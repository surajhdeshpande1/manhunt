import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Back, Button, Modal, Section, Segmented } from '../components/ui';
import { useSession } from '../lib/session';
import { haptic } from '../lib/feel';
import { TASKS, autoLevel, masteryOf, type Cat } from '../tasks/core';
import { TaskStage, type StageResult } from '../tasks/TaskStage';
import { Sparks } from '../components/Art';

type Rec = { n: number; wins: number; best: number | null };
const KEY = 'tag-practice-v1';
function loadRecs(): Record<string, Rec> { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function saveRecs(r: Record<string, Rec>) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* full or private */ } }
const CATS: { k: Cat; blurb: string }[] = [
  { k: 'Memory', blurb: 'Hold a picture in your head for a few seconds.' },
  { k: 'Codes', blurb: 'Crack it with a method you can repeat.' },
  { k: 'Reflex', blurb: 'Fast hands, calm head.' },
  { k: 'Logic', blurb: 'Spot the rule, then apply it.' },
];
const fmt = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);

/** Practise the 20 tasks between matches. The rule stays the same; the puzzle is new every run. */
export default function Training() {
  const nav = useNavigate();
  const { profile } = useSession();
  const [recs, setRecs] = useState<Record<string, Rec>>(loadRecs);
  const [pick, setPick] = useState<number | null>(null);
  const [lvl, setLvl] = useState<'auto' | 1 | 2 | 3 | 4 | 5>('auto');
  const [run, setRun] = useState<{ kind: number; seed: number; level: number } | null>(null);
  const [res, setRes] = useState<(StageResult & { pb: boolean }) | null>(null);
  const mastery = (k: number) => (profile?.task_mastery?.[String(k)] ?? 0);
  const levelFor = (k: number) => (lvl === 'auto' ? autoLevel(mastery(k) + Math.floor((recs[k]?.wins ?? 0) / 2)) : lvl);
  const done = useMemo(() => TASKS.filter((t) => (recs[t.id]?.wins ?? 0) + mastery(t.id) > 0).length, [recs, profile]);

  function start(kind: number, level = levelFor(kind)) {
    haptic.tap(); setRes(null);
    setRun({ kind, seed: Math.floor(Math.random() * 2e9), level });
  }
  function finished(r: StageResult) {
    if (!run) return;
    const cur = recs[run.kind] ?? { n: 0, wins: 0, best: null };
    const pb = r.ok && (cur.best == null || r.ms < cur.best);
    const next = { ...recs, [run.kind]: { n: cur.n + 1, wins: cur.wins + (r.ok ? 1 : 0), best: pb ? r.ms : cur.best } };
    setRecs(next); saveRecs(next); setRes({ ...r, pb });
    if (r.ok) haptic.ok(); else haptic.warn();
  }
  const t = pick !== null ? TASKS[pick] : null;

  return (
    <div className="screen" style={{ gap: 26 }}>
      <header>
        <div className="row between" style={{ marginLeft: -10 }}>
          <button className="icon-btn" aria-label="Back" onClick={() => nav('/home')}><Back /></button>
          <span className="tag">{done}/20 learnt</span>
        </div>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 12vw, 54px)', margin: '12px 0 8px' }}>Training</h1>
        <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>Every task has one rule that never changes. Learn the rule here. The puzzle is new every run, so practise the <b style={{ color: 'var(--text)' }}>method</b>, not the answer.</p>
      </header>

      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">Practice level</div>
        <Segmented value={String(lvl)} onChange={(v) => setLvl(v === 'auto' ? 'auto' : (Number(v) as 1))}
          options={[{ v: 'auto', label: 'Auto' }, ...[1, 2, 3, 4, 5].map((n) => ({ v: String(n), label: String(n) }))]} />
        <div className="muted" style={{ fontSize: 12.5 }}>Auto matches what you'd get in a match: it rises as you master a task. From level 2, twists bend the rule.</div>
      </div>

      {CATS.map((c) => (
        <Section key={c.k} title={c.k}>
          <div className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 2 }}>{c.blurb}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {TASKS.filter((x) => x.cat === c.k).map((x) => {
              const r = recs[x.id]; const m = masteryOf(mastery(x.id) + (r?.wins ?? 0));
              return (
                <motion.button key={x.id} whileTap={{ scale: 0.97 }} onClick={() => { haptic.tap(); setPick(x.id); }} className="card" style={{ textAlign: 'left', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 132 }}>
                  <div className="row between" style={{ gap: 6 }}>
                    <span className="display" style={{ fontSize: 19 }}>{x.name}</span>
                    <span className="tag" style={{ fontSize: 10, padding: '2px 6px', background: m.at >= 6 ? 'var(--police)' : undefined, color: m.at >= 6 ? '#000' : undefined }}>{m.name}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.35, flex: 1 }}>{x.rule}</div>
                  <div className="mono muted" style={{ fontSize: 11.5 }}>Best {fmt(r?.best ?? null)} · {r?.n ?? 0} run{(r?.n ?? 0) === 1 ? '' : 's'}</div>
                </motion.button>
              );
            })}
          </div>
        </Section>
      ))}

      <Modal open={!!t} onClose={() => setPick(null)} title={t?.name}>
        {t && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface2)', boxShadow: 'inset 3px 0 0 var(--accent)' }}>
              <span className="eyebrow" style={{ color: 'var(--accent)' }}>Rule</span><span style={{ fontWeight: 650 }}>{t.rule}</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {t.how.map((h, i) => <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span className="mono muted" style={{ width: 16 }}>{i + 1}</span><span style={{ fontSize: 14.5 }}>{h}</span></div>)}
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Twists you may meet</div>
              <div className="stack" style={{ gap: 6 }}>
                {t.twists.map((w) => <div key={w.key} style={{ fontSize: 13.5 }}><b style={{ color: 'var(--police)' }}>{w.label}</b> <span className="muted">· {w.hint}</span></div>)}
              </div>
            </div>
            <Button kind="hot" block onClick={() => { const k = t.id; setPick(null); start(k); }}>Practise · level {levelFor(t.id)}</Button>
          </div>
        )}
      </Modal>

      {createPortal(<AnimatePresence>
        {run && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'var(--bg)', overflowY: 'auto' }}>
            <TaskStage key={run.seed} kind={run.kind} seed={run.seed} level={run.level} eyebrow="Practice" closeLabel="Close practice"
              onDone={finished} onClose={() => { setRun(null); setRes(null); }}
              result={res && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="center stack" style={{ gap: 12 }}>
                  <div style={{ position: 'relative' }}>
                    {res.ok && res.pb && <Sparks n={14} radius={130} />}
                    <div className={`display ${res.ok ? 'text-flare' : ''}`} style={{ fontSize: 64, fontWeight: 850, letterSpacing: '-0.05em', color: res.ok ? undefined : 'var(--danger)' }}>{res.ok ? fmt(res.ms) : 'Missed'}</div>
                  </div>
                  <div className="muted" style={{ maxWidth: 320 }}>{res.ok ? (res.pb ? 'New personal best.' : `Best ${fmt(recs[run.kind]?.best ?? null)}.`) : res.why}</div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button kind="hot" onClick={() => start(run.kind, run.level)}>Again</Button>
                    {run.level < 5 && <Button onClick={() => start(run.kind, run.level + 1)}>Level {run.level + 1}</Button>}
                    <Button kind="ghost" onClick={() => { setRun(null); setRes(null); }}>Done</Button>
                  </div>
                </motion.div>
              )} />
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}
