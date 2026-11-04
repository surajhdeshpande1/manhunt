import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, Button } from '../components/ui';
import { Grain, LensFlare, Silhouette, TornEdge } from '../components/Scenes';
import { haptic } from '../lib/feel';
import { sfx, unlocked } from '../lib/sound';
import type { Member, Role } from '../lib/types';

/* ---------- decrypt text ---------- */
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@$/<>';
export function Decrypt({ text, duration = 1400, className, style }: { text: string; duration?: number; className?: string; style?: React.CSSProperties }) {
  const [out, setOut] = useState(() => text.replace(/./g, ' '));
  useEffect(() => {
    const start = performance.now(); let raf = 0;
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const locked = Math.floor(p * text.length * 1.15);
      setOut(text.split('').map((c, i) => (i < locked || c === ' ' ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(''));
      if (p < 1) raf = requestAnimationFrame(loop); else setOut(text);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{out}</span>;
}

/* ---------- ROLE REVEAL ----------
   The screen floods with your team colour and your role, then the colour
   draws back into a header so the briefing can come up underneath. */
export function RoleReveal({ role, hunters, hideSecs, onDone }: { role: Role; hunters: Member[]; hideSecs: number; onDone: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    haptic.big(); if (unlocked()) sfx.reveal(role === 'runner');
    const a = setTimeout(() => setStage(1), 1500);
    return () => clearTimeout(a);
  }, []);
  const runner = role === 'runner';
  const color = runner ? 'var(--runner)' : 'var(--hunter)';
  const m = Math.round(hideSecs / 60);
  const word = runner ? 'Runner' : 'Hunter';
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}
      style={{ position: 'fixed', inset: 0, zIndex: 700, background: '#000', color: '#fff6f0', overflow: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 6 }}><Grain opacity={0.1} /></div>
      <motion.div
        initial={{ clipPath: 'circle(0% at 50% 50%)', height: '100%' }}
        animate={stage === 0 ? { clipPath: 'circle(150% at 50% 50%)', height: '100%' } : { clipPath: 'circle(150% at 50% 50%)', height: '44%' }}
        transition={stage === 0 ? { duration: 0.9, ease } : { duration: 0.75, ease }}
        style={{ background: color, color: runner ? '#170700' : '#000', flex: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          borderBottom: '4px solid #14110f',
          padding: 'calc(env(safe-area-inset-top) + 24px) 24px 28px', position: 'relative', overflow: 'visible' }}>
        <motion.div aria-hidden initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.7, duration: 0.9, ease }}
          style={{ position: 'absolute', right: 14, top: runner ? 'calc(env(safe-area-inset-top) + 26px)' : 'calc(env(safe-area-inset-top) + 96px)', opacity: 0.92 }}>
          <Silhouette pose={runner ? 'sprint' : 'scan'} color={runner ? '#5c0d0a' : '#000'} beam={runner ? undefined : '#fff'} size={stage ? (runner ? 96 : 82) : 150} />
        </motion.div>
        <div aria-hidden className="halftone" style={{ position: 'absolute', left: -30, bottom: 10, width: 200, height: 200, borderRadius: '50%', color: '#14110f', opacity: 0.2 }} />
        <motion.div aria-hidden style={{ position: 'absolute', right: -80, top: -80, width: 320, height: 320, borderRadius: '50%', border: '4px solid currentColor', opacity: 0.25 }}
          initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease }} />
        <motion.div aria-hidden style={{ position: 'absolute', right: 0, top: 0, width: 160, height: 160, borderRadius: '50%', background: 'currentColor', opacity: 0.12 }}
          initial={{ scale: 0.2 }} animate={{ scale: 1 }} transition={{ duration: 1.3, ease, delay: 0.1 }} />
        {!runner && <Tape text="POLICE LINE · DO NOT CROSS" rotate={-6} top="22%" dark delay={0.6} />}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5, ease }} style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', position: 'relative', background: '#14110f', color: runner ? '#ff6a1a' : '#ffd400', padding: '4px 8px', alignSelf: 'flex-start' }}>You’re a</motion.div>
        <div className="display" aria-label={word} style={{ fontSize: 'min(24vw, 128px)', display: 'flex', overflow: 'hidden', paddingBottom: 6, marginTop: 8, position: 'relative', textShadow: '5px 5px 0 #fff2e0' }}>
          {word.split('').map((c, i) => (
            <motion.span key={i} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 0.5 + i * 0.045, duration: 0.7, ease }}>{c}</motion.span>
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {stage >= 1 && (
          <motion.div className="screen" style={{ gap: 22, paddingTop: 26, flex: 1 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease }}>
            <p className="display" style={{ fontSize: 28, margin: 0, lineHeight: 1.05 }}>
              {runner ? <>Go hide. You have {m} minute{m === 1 ? '' : 's'} before the hunt.</> : <>Hold your position. The hunt opens when the admin starts it.</>}
            </p>
            <div className="stack" style={{ gap: 12 }}>
              {(runner ? [
                'Stay inside the boundary. Step out and you have a few seconds to get back.',
                'Clear tasks to fill the shared bar. Reach the mark and runners win.',
                'Hunters see you during reveals. If one reaches you, show your code.',
              ] : [
                'Runners show up on your map during reveal windows.',
                'Get close and scan a runner’s code to catch them.',
                'Catch everyone, or stop them reaching the mark.',
              ]).map((t, i) => (
                <motion.div key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08, ease }}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 900, background: color, color: '#14110f', boxShadow: '0 0 0 2px #fff2e0' }}>{i + 1}</span>
                  <span style={{ fontSize: 15.5, lineHeight: 1.45, color: 'rgba(255,246,240,.85)' }}>{t}</span>
                </motion.div>
              ))}
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <div className="eyebrow">{hunters.length === 1 ? '1 hunter' : `${hunters.length} hunters`} on the field</div>
              <div className="row scroll-x" style={{ gap: 14 }}>
                {hunters.map((h, i) => (
                  <motion.div key={h.id} className="center" style={{ flex: 'none', width: 68 }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 + i * 0.05, type: 'spring', damping: 20 }}>
                    <div style={{ width: 'fit-content', margin: '0 auto', borderRadius: 8, boxShadow: '0 0 0 3px var(--hunter)' }}><Avatar src={h.selfie} name={h.username} size={56} /></div>
                    <div style={{ fontSize: 12, fontWeight: 550, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="muted">@{h.username}</div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button onClick={() => { haptic.tap(); onDone(); }} className="btn btn-lg btn-block" style={{ background: color, color: '#14110f', ['--hard' as any]: '#fff2e0', borderColor: '#fff2e0' }}>{runner ? 'Go hide' : 'Ready'}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------- queue of short cinematics ---------- */
export type Cine =
  | { k: 'hunt' }
  | { k: 'caught'; who: Member | undefined; by: Member | undefined }
  | { k: 'alert'; title: string; sub?: string; tone?: 'accent' | 'danger' }
  | { k: 'result'; title: string; sub: string; win: boolean | null }
  | { k: 'broadcast'; text: string };

export function useCinema() {
  const [q, setQ] = useState<(Cine & { id: number })[]>([]);
  const play = useCallback((c: Cine) => setQ((x) => [...x.filter((y) => !(c.k === 'alert' && y.k === 'alert')), { ...c, id: Date.now() + Math.random() }]), []);
  const next = useCallback(() => setQ((x) => x.slice(1)), []);
  return { current: q[0], play, next };
}

export function CinemaLayer({ current, next }: { current?: Cine & { id: number }; next: () => void }) {
  return (
    <AnimatePresence mode="wait">
      {current && (
        current.k === 'hunt' ? <HuntGo key={current.id} done={next} /> :
        current.k === 'caught' ? <Eliminated key={current.id} who={current.who} by={current.by} done={next} /> :
        current.k === 'alert' ? <Alert key={current.id} {...current} done={next} /> :
        current.k === 'result' ? <ResultSlam key={current.id} {...current} done={next} /> :
        <Broadcast key={current.id} text={current.text} done={next} />
      )}
    </AnimatePresence>
  );
}

/** A strip of police tape that slides across the screen. */
export function Tape({ text, rotate = -6, top = '40%', dark, delay = 0 }: { text: string; rotate?: number; top?: string; dark?: boolean; delay?: number }) {
  const line = Array.from({ length: 14 }, () => text).join('   ·   ');
  return (
    <motion.div aria-hidden className="tape-strip"
      initial={{ x: rotate < 0 ? '-110%' : '110%' }} animate={{ x: '0%' }} transition={{ delay, duration: 0.5, ease: [0.7, 0, 0.2, 1] }}
      style={{ position: 'absolute', left: '-25%', right: '-25%', top, rotate, padding: '9px 0', fontSize: 15, zIndex: 0, pointerEvents: 'none',
        background: dark ? '#000' : '#ffd400', color: dark ? '#ffd400' : '#000', borderTop: '3px solid #000', borderBottom: '3px solid #000', fontWeight: 900 }}>
      {line}
    </motion.div>
  );
}

/** Police siren wash: blue and yellow light sweeping the screen edges. */
function Siren() {
  return (
    <>
      <motion.div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22%', pointerEvents: 'none', background: '#2e6bff', borderRight: '4px solid #000' }}
        animate={{ opacity: [0, 1, 0, 0, 1, 0] }} transition={{ duration: 1.2, repeat: 2 }} />
      <motion.div aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '22%', pointerEvents: 'none', background: '#ffd400', borderLeft: '4px solid #000' }}
        animate={{ opacity: [0, 0, 1, 0, 0, 1] }} transition={{ duration: 1.2, repeat: 2 }} />
    </>
  );
}

function useAuto(done: () => void, ms: number) {
  const d = useRef(done); d.current = done;
  useEffect(() => { const t = setTimeout(() => d.current(), ms); return () => clearTimeout(t); }, [ms]);
}

function HuntGo({ done }: { done: () => void }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    haptic.tap();
    sfx.tick();
    const t = setInterval(() => setN((x) => { if (x > 1) { haptic.tap(); sfx.tick(); } else { haptic.big(); sfx.siren(); } return x - 1; }), 800);
    return () => clearInterval(t);
  }, []);
  useAuto(done, 3900);
  const R = 92, C = 2 * Math.PI * R;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 720, background: 'rgba(14,12,11,.92)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      {n <= 0 && <Siren />}
      {n <= 0 && <LensFlare color="#fff7b0" />}
      <div style={{ position: 'relative', width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
        <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx="110" cy="110" r={R} fill="none" stroke="#2e2723" strokeWidth="14" />
          <motion.circle cx="110" cy="110" r={R} fill="none" stroke="var(--hunter)" strokeWidth="14" strokeLinecap="butt" strokeDasharray={C}
            initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: C }} transition={{ duration: 2.4, ease: 'linear' }} />
        </svg>
        <AnimatePresence mode="popLayout">
          {n > 0 ? (
            <motion.div key={n} className="display mono" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} style={{ fontSize: 120, fontWeight: 900, color: '#fff2e0', textShadow: '6px 6px 0 #ff6a1a' }}>{n}</motion.div>
          ) : (
            <motion.div key="go" className="center" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 14, stiffness: 260 }}>
              <div className="display" style={{ fontSize: 54, color: '#14110f', background: '#ffd400', padding: '8px 14px 4px', border: '3px solid #000', boxShadow: '6px 6px 0 #fff2e0', rotate: '-3deg' }}>Hunt’s on</div>
              <div style={{ color: '#fff2e0', marginTop: 18, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13 }}>Hunters are moving</div>
            </motion.div>
          )}
        </AnimatePresence>
        {n <= 0 && [0, 0.15].map((d) => (
          <motion.span key={d} aria-hidden style={{ position: 'absolute', inset: 18, borderRadius: '50%', border: '6px solid var(--hunter)' }}
            initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 1.2, delay: d, ease: [0.22, 1, 0.36, 1] }} />
        ))}
      </div>
    </motion.div>
  );
}

function Eliminated({ who, by, done }: { who?: Member; by?: Member; done: () => void }) {
  useEffect(() => { haptic.alarm(); sfx.caught(); }, []);
  useAuto(done, 2800);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 720, background: 'rgba(14,12,11,.92)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <Siren />
      <Tape text="CAUGHT" rotate={-8} top="calc(50% - 90px)" />
      <Tape text="CAUGHT" rotate={6} top="calc(50% - 40px)" delay={0.12} />
      <div className="center" style={{ display: 'grid', justifyItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', width: 128, height: 128, display: 'grid', placeItems: 'center' }}>
          <motion.span aria-hidden style={{ position: 'absolute', inset: -6, borderRadius: 12, border: '5px solid var(--hunter)', background: '#000', boxShadow: '6px 6px 0 #fff2e0' }}
            initial={{ scale: 2.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }} />
          <motion.div initial={{ filter: 'grayscale(0)' }} animate={{ filter: 'grayscale(1)' }} transition={{ delay: 0.5, duration: 0.6 }}>
            <Avatar src={who?.selfie} name={who?.username} size={110} />
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <div className="display" style={{ fontSize: 56, marginTop: 26, color: '#ff453a', textShadow: '4px 4px 0 #fff2e0' }}>Caught</div>
          <div style={{ color: '#fff2e0', marginTop: 10, fontWeight: 700 }}>@{who?.username ?? 'runner'}{by ? <> · tagged by @{by.username}</> : null}</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Dynamic-island style banner that drops from the top of the screen. */
function Island({ children, tone, onClick }: { children: React.ReactNode; tone: string; onClick: () => void }) {
  return (
    <motion.div onClick={onClick} initial={{ y: -90, scale: 0.7, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -60, scale: 0.85, opacity: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 320 }}
      style={{ position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top) + 10px)', zIndex: 715, display: 'flex', justifyContent: 'center', pointerEvents: 'auto' }}>
      <div className="row" style={{ background: '#14110f', color: '#fff2e0', borderRadius: 10, padding: '14px 18px 14px 14px', gap: 12, maxWidth: 420, width: '100%',
        boxShadow: `0 0 0 2.5px #fff2e0, 5px 5px 0 2.5px ${tone}` }}>
        <span style={{ position: 'relative', width: 34, height: 34, flex: 'none', display: 'grid', placeItems: 'center' }}>
          <motion.span style={{ width: 16, height: 16, borderRadius: 3, background: tone, boxShadow: '0 0 0 2px #fff2e0' }} animate={{ rotate: [0, 90, 90, 180] }} transition={{ duration: 1.6, repeat: Infinity, ease: [0.7, 0, 0.3, 1] }} />
        </span>
        <div className="grow">{children}</div>
      </div>
    </motion.div>
  );
}

function Alert({ title, sub, tone = 'accent', done }: { title: string; sub?: string; tone?: 'accent' | 'danger'; done: () => void }) {
  useEffect(() => { haptic.warn(); if (tone === 'danger') sfx.warn(); else sfx.ping(); }, []);
  useAuto(done, 2600);
  const c = tone === 'danger' ? 'var(--danger)' : 'var(--accent)';
  return (
    <>
      {tone === 'danger' && <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4] }} exit={{ opacity: 0 }} transition={{ duration: 1 }}
        style={{ position: 'fixed', inset: 0, zIndex: 709, pointerEvents: 'none', boxShadow: 'inset 0 0 0 8px #ff453a' }} />}
      <Island tone={c} onClick={done}>
        <div style={{ fontWeight: 850, fontSize: 16 }}>{title}</div>
        {sub && <div style={{ fontSize: 13.5, color: 'rgba(245,245,247,.6)' }}>{sub}</div>}
      </Island>
    </>
  );
}

function ResultSlam({ title, sub, win, done }: { title: string; sub: string; win: boolean | null; done: () => void }) {
  useEffect(() => { haptic.big(); if (win === false) sfx.lose(); else sfx.win(); }, []);
  useAuto(done, 3400);
  const tone = win === false ? 'rgba(255,255,255,.18)' : 'var(--accent)';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 730, background: win === false ? '#0e0c0b' : '#ff6a1a', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      {win !== false && <LensFlare delay={0.1} />}
      {[0, 0.12, 0.24].map((d, i) => (
        <motion.span key={i} aria-hidden style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', border: `5px solid ${win === false ? '#2e2723' : '#14110f'}` }}
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 2.4 + i * 1.2, opacity: [0, 0.6, 0] }} transition={{ duration: 2.2, delay: d, ease: [0.22, 1, 0.36, 1] }} />
      ))}
      <div className="center" style={{ position: 'relative' }}>
        <motion.div className="display" initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ fontSize: 'min(18vw, 110px)', color: win === false ? '#8e8e93' : '#fff2e0', textShadow: win === false ? 'none' : '6px 6px 0 #14110f' }}>{title}</motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ fontSize: 17, fontWeight: 800, marginTop: 14, color: win === false ? 'rgba(255,255,255,.6)' : '#14110f' }}>{sub}</motion.div>
      </div>
    </motion.div>
  );
}

function Broadcast({ text, done }: { text: string; done: () => void }) {
  useEffect(() => { haptic.ok(); sfx.ping(); }, []);
  useAuto(done, 6500);
  return (
    <Island tone="#ffd400" onClick={done}>
      <div style={{ fontSize: 12.5, color: 'rgba(245,245,247,.55)', fontWeight: 550 }}>From the admin</div>
      <div style={{ fontWeight: 600, fontSize: 15.5 }}>{text}</div>
    </Island>
  );
}
