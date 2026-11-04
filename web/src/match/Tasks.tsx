import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, X, useToast } from '../components/ui';
import { rpc } from '../lib/supabase';
import { fmtClock, msUntil } from '../lib/clock';
import { haptic } from '../lib/feel';
import { GAMES, GAME_INFO } from '../games/Games';
import { Sparks } from '../components/Art';
import type { RoomState } from '../lib/types';

type Task = { seed: number; kind: number; index: number; of: number };

export function TaskDeck({ s, refresh }: { s: RoomState; refresh: () => void }) {
  const toast = useToast();
  const me = s.me!;
  const per = s.room.settings.tasks_per_runner;
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(null);
  const cd = msUntil(me.cooldown_until);
  const hunt = s.room.status === 'hunt';
  const locked = !!me.oob_since;
  const allDone = me.tasks >= per;

  async function start() {
    setBusy(true);
    try { const t = await rpc<Task>('start_task', { p_room: s.room.id }); setTask(t); setResult(null); haptic.tap(); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function win() {
    if (!task) return;
    try {
      await rpc('complete_task', { p_room: s.room.id, p_seed: task.seed });
      haptic.ok(); setResult({ ok: true, msg: `Task ${task.index} cleared` });
    } catch (e: any) { setResult({ ok: false, msg: e.message }); }
    refresh();
  }
  async function fail(why: string) {
    await rpc('fail_task', { p_room: s.room.id }).catch(() => {});
    setResult({ ok: false, msg: `${why}. 10 s penalty.` }); refresh();
  }
  function close() { setTask(null); setResult(null); }

  const label = !hunt ? (s.room.status === 'paused' ? 'Paused' : 'Unlocks at the hunt') : locked ? 'Locked · outside zone' : allDone ? 'Deck cleared'
    : me.task_active ? 'Resume task' : cd > 0 ? `Cooldown ${fmtClock(cd)}` : `Start task ${me.tasks + 1}`;
  const can = hunt && !locked && !allDone && (me.task_active || cd <= 0);

  return (
    <>
      <div className="frame cut" style={{ background: can ? 'var(--grad-flare)' : 'var(--line2)', boxShadow: can ? '0 16px 40px -20px #ff6a1a' : 'none' }}>
        <div className="inner cut" style={{ padding: 14 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div>
              <div className="eyebrow">Task deck</div>
              <div className="display mono" style={{ fontSize: 30, lineHeight: 1 }}>{me.tasks}<span className="muted" style={{ fontSize: 18 }}>/{per}</span></div>
            </div>
            <div className="row" style={{ gap: 3 }}>
              {Array.from({ length: Math.min(per, 15) }, (_, i) => (
                <motion.span key={i} initial={false} animate={{ backgroundColor: i < me.tasks ? 'var(--accent)' : 'var(--surface3)', scaleY: i < me.tasks ? 1 : 0.7 }} transition={{ type: 'spring', damping: 18 }} style={{ width: 6, height: 22, borderRadius: 3, display: 'block' }} />
              ))}
            </div>
          </div>
          <Button kind="hot" block disabled={!can} loading={busy} onClick={start}>{label}</Button>
        </div>
      </div>

      {createPortal(<AnimatePresence>
        {task && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'radial-gradient(130% 55% at 50% 0%, color-mix(in srgb, var(--accent) 26%, var(--bg)), var(--bg) 70%)', overflowY: 'auto' }} className="grid-bg">
            <div className="screen" style={{ gap: 18 }}>
              <div className="row between">
                <div>
                  <div className="eyebrow">Task {task.index} of {task.of}</div>
                  <div className="display" style={{ fontSize: 40, fontWeight: 850, letterSpacing: "-0.05em" }}>{GAME_INFO[task.kind].name}</div>
                </div>
                <button className="icon-btn" aria-label="Close task" onClick={close}><X /></button>
              </div>
              <p className="muted" style={{ margin: 0 }}>{GAME_INFO[task.kind].brief}</p>
              {locked && <div className="cut card-pad" style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600 }}>You're outside the zone. Get back in to submit.</div>}
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, flex: 1 }}>
                {!result ? <Game kind={task.kind} seed={task.seed} onWin={win} onFail={fail} /> : (
                  <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="center stack" style={{ gap: 12, alignSelf: 'center' }}>
                    <div style={{ position: 'relative' }}>{result.ok && <Sparks n={16} radius={140} />}<div className={`display ${result.ok ? 'text-flare' : ''}`} style={{ fontSize: 72, fontWeight: 850, letterSpacing: '-0.05em', color: result.ok ? undefined : 'var(--danger)', paddingRight: 6 }}>{result.ok ? '+1 task' : 'Failed'}</div></div>
                    <div className="muted">{result.msg}</div>
                    <Button onClick={close}>{result.ok ? 'Back to the map' : 'OK'}</Button>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}

function Game({ kind, seed, onWin, onFail }: { kind: number; seed: number; onWin: () => void; onFail: (w: string) => void }) {
  const G = GAMES[kind] ?? GAMES[0];
  return <G seed={seed} onWin={onWin} onFail={onFail} />;
}
