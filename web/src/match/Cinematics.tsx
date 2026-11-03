import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, Button } from '../components/ui';
import { haptic } from '../lib/feel';
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
    haptic.big();
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
      style={{ position: 'fixed', inset: 0, zIndex: 700, background: '#000', color: 'var(--text)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <motion.div
        initial={{ clipPath: 'circle(0% at 50% 50%)', height: '100%' }}
        animate={stage === 0 ? { clipPath: 'circle(150% at 50% 50%)', height: '100%' } : { clipPath: 'circle(150% at 50% 50%)', height: '44%' }}
        transition={stage === 0 ? { duration: 0.9, ease } : { duration: 0.75, ease }}
        style={{ background: color, color: runner ? '#170700' : '#000', flex: 'none', borderRadius: stage ? '0 0 32px 32px' : 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: 'calc(env(safe-area-inset-top) + 24px) 24px 28px', position: 'relative', overflow: 'hidden', transition: 'border-radius .6s var(--ease-out)' }}>
        <motion.div aria-hidden style={{ position: 'absolute', right: -80, top: -80, width: 320, height: 320, borderRadius: '50%', border: '1.5px solid currentColor', opacity: 0.18 }}
          initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease }} />
        <motion.div aria-hidden style={{ position: 'absolute', right: 0, top: 0, width: 160, height: 160, borderRadius: '50%', border: '1.5px solid currentColor', opacity: 0.22 }}
          initial={{ scale: 0.2 }} animate={{ scale: 1 }} transition={{ duration: 1.3, ease, delay: 0.1 }} />
        {!runner && <Tape text="POLICE LINE · DO NOT CROSS" rotate={-6} top="22%" dark delay={0.6} />}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 0.75, y: 0 }} transition={{ delay: 0.45, duration: 0.5, ease }} style={{ fontSize: 17, fontWeight: 600, position: 'relative' }}>You’re a</motion.div>
        <div className="display" aria-label={word} style={{ fontSize: 'min(25vw, 132px)', fontWeight: 800, letterSpacing: '-0.055em', lineHeight: 0.95, display: 'flex', overflow: 'hidden', paddingBottom: 6, position: 'relative' }}>
          {word.split('').map((c, i) => (
            <motion.span key={i} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 0.5 + i * 0.045, duration: 0.7, ease }}>{c}</motion.span>
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {stage >= 1 && (
          <motion.div className="screen" style={{ gap: 22, paddingTop: 26, flex: 1 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease }}>
            <p className="display" style={{ fontSize: 26, margin: 0, fontWeight: 650, lineHeight: 1.15 }}>
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
                  <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', marginTop: 1, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: 'var(--surface2)', color }}>{i + 1}</span>
                  <span className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>{t}</span>
                </motion.div>
              ))}
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <div className="eyebrow">{hunters.length === 1 ? '1 hunter' : `${hunters.length} hunters`} on the field</div>
              <div className="row scroll-x" style={{ gap: 14 }}>
                {hunters.map((h, i) => (
                  <motion.div key={h.id} className="center" style={{ flex: 'none', width: 68 }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 + i * 0.05, type: 'spring', damping: 20 }}>
                    <div style={{ padding: 2, borderRadius: '50%', background: 'var(--hunter)', width: 'fit-content', margin: '0 auto' }}><div style={{ padding: 2, borderRadius: '50%', background: '#000' }}><Avatar src={h.selfie} name={h.username} size={54} /></div></div>
                    <div style={{ fontSize: 12, fontWeight: 550, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="muted">@{h.username}</div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button onClick={() => { haptic.tap(); onDone(); }} className="btn btn-lg btn-block" style={{ background: color, color: runner ? '#170700' : '#000' }}>{runner ? 'Go hide' : 'Ready'}</button>
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
        background: dark ? '#000' : '#ffd400', color: dark ? '#ffd400' : '#000', boxShadow: '0 10px 30px rgba(0,0,0,.45)' }}>
      {line}
    </motion.div>
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
    const t = setInterval(() => setN((x) => { if (x > 1) haptic.tap(); else haptic.big(); return x - 1; }), 800);
    return () => clearInterval(t);
  }, []);
  useAuto(done, 3900);
  const R = 92, C = 2 * Math.PI * R;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 720, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'relative', width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
        <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
          <motion.circle cx="110" cy="110" r={R} fill="none" stroke="var(--hunter)" strokeWidth="3" strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: C }} transition={{ duration: 2.4, ease: 'linear' }} />
        </svg>
        <AnimatePresence mode="popLayout">
          {n > 0 ? (
            <motion.div key={n} className="display mono" initial={{ y: 30, opacity: 0, filter: 'blur(8px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -30, opacity: 0, filter: 'blur(8px)' }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} style={{ fontSize: 112, fontWeight: 700, color: '#fff' }}>{n}</motion.div>
          ) : (
            <motion.div key="go" className="center" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 14, stiffness: 260 }}>
              <div className="display" style={{ fontSize: 46, fontWeight: 800, color: '#fff' }}>Hunt’s on</div>
              <div style={{ color: 'rgba(255,255,255,.6)', marginTop: 6, fontWeight: 500 }}>Hunters are moving</div>
            </motion.div>
          )}
        </AnimatePresence>
        {n <= 0 && [0, 0.15].map((d) => (
          <motion.span key={d} aria-hidden style={{ position: 'absolute', inset: 18, borderRadius: '50%', border: '1.5px solid var(--hunter)' }}
            initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 1.2, delay: d, ease: [0.22, 1, 0.36, 1] }} />
        ))}
      </div>
    </motion.div>
  );
}

function Eliminated({ who, by, done }: { who?: Member; by?: Member; done: () => void }) {
  useEffect(() => { haptic.alarm(); }, []);
  useAuto(done, 2800);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 720, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', display: 'grid', placeItems: 'center' }}>
      <Tape text="CAUGHT" rotate={-8} top="calc(50% - 90px)" />
      <Tape text="CAUGHT" rotate={6} top="calc(50% - 40px)" delay={0.12} />
      <div className="center" style={{ display: 'grid', justifyItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', width: 128, height: 128, display: 'grid', placeItems: 'center' }}>
          <motion.span aria-hidden style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '4px solid var(--hunter)', background: '#000' }}
            initial={{ scale: 2.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }} />
          <motion.div initial={{ filter: 'grayscale(0)' }} animate={{ filter: 'grayscale(1)' }} transition={{ delay: 0.5, duration: 0.6 }}>
            <Avatar src={who?.selfie} name={who?.username} size={110} />
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <div className="display" style={{ fontSize: 40, fontWeight: 800, marginTop: 20, color: '#fff' }}>Caught</div>
          <div style={{ color: 'rgba(255,255,255,.65)', marginTop: 6, fontWeight: 500 }}>@{who?.username ?? 'runner'}{by ? <> · tagged by @{by.username}</> : null}</div>
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
      <div className="row" style={{ background: '#0c0c0d', color: '#f5f5f7', borderRadius: 26, padding: '12px 18px 12px 14px', gap: 12, maxWidth: 420, width: '100%',
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.1), 0 20px 50px -12px rgba(0,0,0,.7), 0 0 0 1px ${tone}22` }}>
        <span style={{ position: 'relative', width: 34, height: 34, flex: 'none', display: 'grid', placeItems: 'center' }}>
          <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: tone, opacity: 0.25 }} animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: tone }} />
        </span>
        <div className="grow">{children}</div>
      </div>
    </motion.div>
  );
}

function Alert({ title, sub, tone = 'accent', done }: { title: string; sub?: string; tone?: 'accent' | 'danger'; done: () => void }) {
  useEffect(() => { haptic.warn(); }, []);
  useAuto(done, 2600);
  const c = tone === 'danger' ? 'var(--danger)' : 'var(--accent)';
  return (
    <>
      {tone === 'danger' && <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4] }} exit={{ opacity: 0 }} transition={{ duration: 1 }}
        style={{ position: 'fixed', inset: 0, zIndex: 709, pointerEvents: 'none', boxShadow: 'inset 0 0 120px 10px rgba(255,69,58,.35)' }} />}
      <Island tone={c} onClick={done}>
        <div style={{ fontWeight: 650, fontSize: 15.5 }}>{title}</div>
        {sub && <div style={{ fontSize: 13.5, color: 'rgba(245,245,247,.6)' }}>{sub}</div>}
      </Island>
    </>
  );
}

function ResultSlam({ title, sub, win, done }: { title: string; sub: string; win: boolean | null; done: () => void }) {
  useEffect(() => { haptic.big(); }, []);
  useAuto(done, 3400);
  const tone = win === false ? 'rgba(255,255,255,.18)' : 'var(--accent)';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 730, background: '#000', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      {[0, 0.12, 0.24].map((d, i) => (
        <motion.span key={i} aria-hidden style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', border: `1.5px solid ${tone}` }}
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 2.4 + i * 1.2, opacity: [0, 0.6, 0] }} transition={{ duration: 2.2, delay: d, ease: [0.22, 1, 0.36, 1] }} />
      ))}
      <div className="center" style={{ position: 'relative' }}>
        <motion.div className="display" initial={{ scale: 1.25, opacity: 0, filter: 'blur(14px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ fontSize: 'min(17vw, 104px)', fontWeight: 800, letterSpacing: '-0.05em', color: win === false ? '#8e8e93' : '#fff' }}>{title}</motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ fontSize: 17, fontWeight: 500, marginTop: 10, color: 'rgba(255,255,255,.6)' }}>{sub}</motion.div>
      </div>
    </motion.div>
  );
}

function Broadcast({ text, done }: { text: string; done: () => void }) {
  useEffect(() => { haptic.ok(); }, []);
  useAuto(done, 6500);
  return (
    <Island tone="#f5f5f7" onClick={done}>
      <div style={{ fontSize: 12.5, color: 'rgba(245,245,247,.55)', fontWeight: 550 }}>From the admin</div>
      <div style={{ fontWeight: 600, fontSize: 15.5 }}>{text}</div>
    </Island>
  );
}
