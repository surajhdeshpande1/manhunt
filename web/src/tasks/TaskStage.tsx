import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { X } from '../components/ui';
import { haptic } from '../lib/feel';
import { sfx } from '../lib/sound';
import { TASKS, timeFor, twistFor } from './core';
import { dare, taunt } from './taunts';
import { Echo, FlashGrid, Mirror, Pairs, Trail } from './games/memory';
import { Binary, GlyphLock, SafeCrack, WireCut } from './games/codes';
import { LightsOut, NextNumber, OddOne, Pipeline, Scramble, TargetSum } from './games/logic';
import { DeadZone, EmberStrike, Ink, Maze, SteadyHand } from './games/reflex';
import type { GP } from './games/types';

export const GAMES: ((p: GP) => JSX.Element)[] = [Echo, Pairs, FlashGrid, Trail, SafeCrack, Maze, GlyphLock, Binary, WireCut, LightsOut, Pipeline, DeadZone, EmberStrike, SteadyHand, Ink, OddOne, TargetSum, NextNumber, Scramble, Mirror];

const seenKey = (k: string) => `tag-task-seen-${k}`;
function hasSeen(k: string) { try { return localStorage.getItem(seenKey(k)) === '1'; } catch { return true; } }
function markSeen(k: string) { try { localStorage.setItem(seenKey(k), '1'); } catch { /* private mode */ } }

export type StageResult = { ok: boolean; ms: number; why?: string; left: number };

/**
 * Full-screen task surface used in matches and in Training.
 * Header: the task's fixed RULE (the thing players learn), the instance's TWIST, and the clock.
 */
export function TaskStage({ kind, seed, level, eyebrow, onDone, onClose, result, closeLabel = 'Close task' }: {
  kind: number; seed: number; level: number; eyebrow: string;
  onDone: (r: StageResult) => void; onClose: () => void; result?: ReactNode; closeLabel?: string;
}) {
  const def = TASKS[kind] ?? TASKS[0];
  const twist = useMemo(() => twistFor(kind, seed, level), [kind, seed, level]);
  const tdef = def.twists.find((t) => t.key === twist);
  const [phase, setPhase] = useState<'learn' | 'play' | 'over'>(() => (hasSeen(def.key) ? 'play' : 'learn'));
  const deadline = useRef(0), startedAt = useRef(0), finished = useRef(false), lastTick = useRef(99);
  const bar = useRef<HTMLDivElement>(null), secs = useRef<HTMLSpanElement>(null);
  const total = timeFor(kind, level);
  const G = GAMES[kind] ?? GAMES[0];
  if ((import.meta as any).env?.DEV) (window as any).__tagTask = { kind, seed, level, twist };

  const [verdict, setVerdict] = useState<string | null>(null);
  const [hits, setHits] = useState(0);
  const shake = useAnimationControls();
  useEffect(() => { if (hits) shake.start({ x: [0, -9, 8, -5, 4, 0], transition: { duration: 0.32 } }); }, [hits, shake]);
  const finish = useCallback((r: Omit<StageResult, 'ms' | 'left'>) => {
    if (finished.current) return;
    finished.current = true; setPhase('over');
    if (r.ok) sfx.task(); else { sfx.fail(); setHits((h) => h + 1); }
    const now = performance.now();
    const ms = Math.round(now - startedAt.current), left = Math.round(deadline.current - now);
    setVerdict(taunt({ ok: r.ok, ms, left, total, twist: !!twist, why: r.why, level, seed }));
    onDone({ ...r, ms, left });
  }, [onDone, total, twist, level, seed]);

  useEffect(() => {
    if (phase !== 'play') return;
    startedAt.current = performance.now(); deadline.current = startedAt.current + total;
    if (twist) haptic.warn();
    let raf = 0;
    const loop = () => {
      const left = deadline.current - performance.now();
      const f = Math.max(0, left / total);
      if (bar.current) { bar.current.style.transform = `scaleX(${f})`; bar.current.style.background = f < 0.25 ? 'var(--danger)' : 'var(--accent)'; }
      const s = Math.max(0, Math.ceil(left / 1000));
      if (secs.current) secs.current.textContent = `${s}s`;
      if (s <= 5 && s < lastTick.current && s > 0) { lastTick.current = s; haptic.tap(); sfx.tick(); }
      if (left <= 0) { finish({ ok: false, why: 'Out of time' }); return; }
      if (!finished.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, total, twist, finish]);

  const penalize = useCallback((ms: number) => { deadline.current -= ms; setHits((h) => h + 1); }, []);

  // keyboard users can back out the same way they close any sheet
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="screen" style={{ gap: 14, paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{eyebrow} · Level {level} · {def.cat}</div>
          <div className="display" style={{ fontSize: 'clamp(34px, 10vw, 44px)', fontWeight: 850, letterSpacing: '-0.05em', lineHeight: 1 }}>{def.name}</div>
        </div>
        <button className="icon-btn" aria-label={closeLabel} onClick={onClose}><X /></button>
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'stretch', padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 3px 0 0 var(--accent), inset 0 0 0 1px var(--line)' }}>
        <span className="eyebrow" style={{ color: 'var(--accent)', paddingTop: 2 }}>Rule</span>
        <span style={{ fontWeight: 650, fontSize: 15, lineHeight: 1.35 }}>{def.rule}</span>
      </div>

      <AnimatePresence>
        {tdef && phase !== 'learn' && (
          <motion.div initial={{ opacity: 0, y: -14, scale: 1.25, rotate: -3 }} animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 17 }}
            className="row" style={{ gap: 10, padding: '9px 12px', borderRadius: 12, background: '#c9a227', color: '#0b0b0c' }}>
            <span style={{ fontWeight: 900, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Twist · {tdef.label}</span>
            <span style={{ fontWeight: 650, fontSize: 13.5, lineHeight: 1.3 }}>{tdef.hint}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {phase !== 'learn' && !result && (
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface3)', overflow: 'hidden' }}>
            <div ref={bar} style={{ height: '100%', width: '100%', transformOrigin: 'left', background: 'var(--accent)' }} />
          </div>
          <span ref={secs} className="mono" style={{ fontSize: 13, fontWeight: 800, minWidth: 32, textAlign: 'right' }}>{Math.round(total / 1000)}s</span>
        </div>
      )}

      {phase === 'learn' ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 12, marginTop: 6 }}>
          <div className="eyebrow">New task · how it works</div>
          {def.how.map((h, i) => (
            <div key={i} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span className="display mono" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface2)', display: 'grid', placeItems: 'center', fontSize: 15, flex: 'none' }}>{i + 1}</span>
              <span style={{ fontSize: 15.5, lineHeight: 1.4, paddingTop: 3 }}>{h}</span>
            </div>
          ))}
          <p style={{ margin: '4px 0 0', fontSize: 14.5, fontWeight: 700, color: 'var(--accent)' }}>{dare(level, !!twist, seed)}</p>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>The rule never changes. The puzzle is new every time, and twists get more likely as you get better.</p>
          <button className="btn btn-hot btn-lg" style={{ marginTop: 8 }} onClick={() => { markSeen(def.key); haptic.tap(); setPhase('play'); }}>Start · {Math.round(total / 1000)} s on the clock</button>
        </motion.div>
      ) : result ? (
        <div style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: 18, flex: 1, paddingTop: 20 }}>
          {result}
          {verdict && <motion.div initial={{ opacity: 0, y: 8, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: -1.5 }} transition={{ delay: 0.45, type: 'spring', damping: 14 }} className="taunt">{verdict}</motion.div>}
        </div>
      ) : (
        <motion.div animate={shake}
          className="stack" style={{ alignItems: 'center', gap: 14, paddingTop: 6, pointerEvents: phase === 'over' ? 'none' : undefined }}>
          <G seed={seed} level={level} twist={twist} penalize={penalize} onWin={() => finish({ ok: true })} onFail={(why) => finish({ ok: false, why })} />
          {hits > 0 && <motion.div key={`f${hits}`} initial={{ opacity: 0.5 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} className="hit-flash" />}
        </motion.div>
      )}
    </div>
  );
}
