import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, useToast } from '../components/ui';
import { isNetworkError, rpc } from '../lib/supabase';
import { fmtClock, msUntil, serverNow } from '../lib/clock';
import { haptic } from '../lib/feel';
import { sfx } from '../lib/sound';
import { TaskStage } from '../tasks/TaskStage';
import { TASKS } from '../tasks/core';
import { Sparks } from '../components/Art';
import type { RoomState } from '../lib/types';

type Task = { seed: number; kind: number; index: number; of: number; level?: number; started_at?: string };
type Save = 'saving' | 'saved' | 'held' | 'failed';
type Result = { ok: boolean; msg: string; save?: Save };

/**
 * A finished task waiting for the server. It is kept on the phone, so a weak signal, a closed app or a moment
 * outside the zone can't lose a task the runner actually solved: it is sent again until the server has it.
 */
type Pending = { seed: number; notBefore: number; index: number };
const pendKey = (room: string) => `tag-task-pending-${room}`;
function readPending(room: string): Pending | null {
  try { return JSON.parse(localStorage.getItem(pendKey(room)) || 'null'); } catch { return null; }
}
function writePending(room: string, p: Pending | null) {
  try { if (p) localStorage.setItem(pendKey(room), JSON.stringify(p)); else localStorage.removeItem(pendKey(room)); } catch { /* private mode */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (msg: string) => isNetworkError(msg) || /No connection|connection is slow/i.test(msg);

export function TaskDeck({ s, refresh, side }: { s: RoomState; refresh: () => void; side?: ReactNode }) {
  const toast = useToast();
  const me = s.me!;
  const roomId = s.room.id;
  const per = s.room.settings.tasks_per_runner;
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<Pending | null>(() => readPending(roomId));
  const open = useRef(false); // is the task sheet on screen (for background toasts)
  open.current = !!task;
  const sending = useRef(false);
  const lastTry = useRef(0);

  const cd = msUntil(me.cooldown_until);
  const hunt = s.room.status === 'hunt';
  const locked = !!me.oob_since;
  // a solved task still on its way counts on the deck straight away
  const shownTasks = Math.min(per, me.tasks + (pending && me.task_active ? 1 : 0));
  const allDone = shownTasks >= per;

  const settle = useCallback((p: Pending, outcome: Save, msg?: string) => {
    if (outcome === 'saved' || outcome === 'failed') { writePending(roomId, null); setPending(null); }
    if (outcome === 'saved') {
      setResult((r) => (r?.ok ? { ok: true, msg: `Task ${p.index} saved`, save: 'saved' } : r));
      if (!open.current) toast(`Task ${p.index} counted`);
      refresh();
    } else if (outcome === 'held') {
      setResult((r) => (r?.ok ? { ok: true, msg: msg!, save: 'held' } : r));
    } else {
      setResult((r) => (r?.ok ? { ok: false, msg: `Not counted: ${msg}`, save: 'failed' } : r));
      if (!open.current) toast(`Task ${p.index} not counted: ${msg}`, true);
      refresh();
    }
  }, [roomId, refresh, toast]);

  /** send a finished task until the server has it; retries quietly through weak signal */
  const submit = useCallback(async (p0: Pending) => {
    if (sending.current) return;
    sending.current = true; lastTry.current = Date.now();
    let p = p0;
    try {
      for (let attempt = 0; attempt < 7; attempt++) {
        const wait = p.notBefore - serverNow(); // the server counts a task only 4 s after handing it out
        if (wait > 0) await sleep(Math.min(wait, 6000));
        try {
          await rpc('complete_task', { p_room: roomId, p_seed: p.seed });
          settle(p, 'saved'); return;
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (/too fast/i.test(msg)) { p = { ...p, notBefore: serverNow() + 1200 }; continue; }
          if (retryable(msg)) { await sleep(Math.min(8000, 800 * 2 ** attempt)); continue; }
          if (/outside the zone/i.test(msg)) { settle(p, 'held', "You're outside the zone. This task counts as soon as you're back inside."); return; }
          if (/not on right now/i.test(msg)) { settle(p, 'held', 'The match is paused. This task counts when it resumes.'); return; }
          settle(p, 'failed', msg); return; // the task is gone: the match ended, you were caught, or it was replaced
        }
      }
      settle(p, 'held', "No signal yet. This task is kept on your phone and counts as soon as you're back online.");
    } finally { sending.current = false; lastTry.current = Date.now(); }
  }, [roomId, settle]);

  // a task kept on the phone (weak signal, outside the zone, paused, or the app was closed): send it again when it can count
  useEffect(() => {
    if (!pending || sending.current || Date.now() - lastTry.current < 4000) return;
    if (!me.task_active) { submit(pending); return; } // already counted, or gone: one call settles which
    if (hunt && !locked) submit(pending);
  });

  async function start() {
    setBusy(true);
    try { const t = await rpc<Task>('start_task', { p_room: roomId }); setTask(t); setResult(null); haptic.tap(); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  function win() {
    if (!task) return;
    const started = task.started_at ? Date.parse(task.started_at) : serverNow();
    const p: Pending = { seed: task.seed, notBefore: started + 4300, index: task.index };
    writePending(roomId, p); setPending(p);
    haptic.ok();
    setResult({ ok: true, msg: locked ? "You're outside the zone. This task counts as soon as you're back inside." : 'Saving…', save: locked ? 'held' : 'saving' });
    if (!locked && hunt) submit(p);
  }
  function fail(why: string) {
    setResult({ ok: false, msg: `${why}. 10 s penalty.` });
    rpc('fail_task', { p_room: roomId }).catch(() => {}).finally(refresh);
  }
  function close() { setTask(null); setResult(null); }

  const label = !hunt ? (s.room.status === 'paused' ? 'Paused' : 'Unlocks at the hunt')
    : pending && me.task_active ? (locked ? 'Get back inside to count your task' : 'Saving your task…')
    : locked ? 'Locked · outside zone' : allDone ? 'Deck cleared'
    : me.task_active ? 'Resume task' : cd > 0 ? `Cooldown ${fmtClock(cd)}` : `Start task ${me.tasks + 1}`;
  const can = hunt && !locked && !allDone && !(pending && me.task_active) && (me.task_active || cd <= 0);

  return (
    <>
      <div className="frame cut" style={{ background: can ? 'var(--grad-flare)' : 'var(--line2)', boxShadow: can ? '0 16px 40px -20px #d9541e' : 'none' }}>
        <div className="inner cut" style={{ padding: 14 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div>
              <div className="eyebrow">Tasks</div>
              <div className="display mono" style={{ fontSize: 30, lineHeight: 1 }}>{shownTasks}<span className="muted" style={{ fontSize: 18 }}>/{per}</span></div>
            </div>
            <div className="row" style={{ gap: 3 }} aria-hidden>
              {Array.from({ length: Math.min(per, 15) }, (_, i) => (
                <motion.span key={i} initial={false} animate={{ backgroundColor: i < shownTasks ? 'var(--accent)' : 'var(--surface3)', scaleY: i < shownTasks ? 1 : 0.7 }} transition={{ type: 'spring', damping: 18 }} style={{ width: 6, height: 22, borderRadius: 3, display: 'block' }} />
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
            <div className="grow" style={{ minWidth: 0 }}><Button kind="hot" block disabled={!can} loading={busy} onClick={start} style={{ minHeight: 58 }}>{label}</Button></div>
            {side}
          </div>
        </div>
      </div>

      {createPortal(<AnimatePresence>
        {task && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.22 }}
            style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'var(--bg)', overflowY: 'auto' }}>
            {locked && !result && <div className="cut card-pad" style={{ position: 'relative', zIndex: 2, margin: '12px 20px 0', background: 'var(--danger)', color: '#fff', fontWeight: 600 }}>You're outside the zone. Solve it anyway: it counts once you're back inside.</div>}
            <TaskStage key={task.seed} kind={task.kind % TASKS.length} seed={task.seed} level={task.level ?? 1} eyebrow={`Task ${task.index} of ${task.of}`}
              onDone={(r) => (r.ok ? win() : fail(r.why ?? 'Failed'))} onClose={close}
              result={result && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }} className="center stack" style={{ gap: 12 }}>
                  <div style={{ position: 'relative' }}>{result.ok && <Sparks n={12} radius={120} />}<div className={`display ${result.ok ? 'text-flare' : ''}`} style={{ fontSize: 72, fontWeight: 850, letterSpacing: '-0.05em', color: result.ok ? undefined : 'var(--danger)', paddingRight: 6 }}>{result.ok ? '+1 task' : 'Failed'}</div></div>
                  <div className="row" style={{ gap: 8, justifyContent: 'center' }} role="status" aria-live="polite">
                    {result.save === 'saving' && <span className="spin" aria-hidden />}
                    {result.save === 'saved' && <span aria-hidden style={{ color: 'var(--ok)', fontWeight: 900 }}>✓</span>}
                    <span className="muted" style={{ maxWidth: 320 }}>{result.msg}</span>
                  </div>
                  <Button onClick={close}>{result.ok ? 'Back to the map' : 'OK'}</Button>
                </motion.div>
              )} />
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
