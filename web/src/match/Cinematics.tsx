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

/* ---------- ROLE REVEAL ---------- */
export function RoleReveal({ role, hunters, hideSecs, onDone }: { role: Role; hunters: Member[]; hideSecs: number; onDone: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    haptic.big();
    const a = setTimeout(() => setStage(1), 1700);
    const b = setTimeout(() => setStage(2), 2300);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const runner = role === 'runner';
  const m = Math.round(hideSecs / 60);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}
      style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'var(--bg)', color: 'var(--text)', overflow: 'auto' }} className="grid-bg">
      <motion.div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: '46%', background: 'var(--accent)', skewX: -14, transformOrigin: 'top' }}
        initial={{ left: '-80%' }} animate={{ left: ['-80%', '30%', '170%'] }} transition={{ duration: 1.1, times: [0, 0.45, 1], ease: [0.7, 0, 0.2, 1] }} />
      <div className="screen" style={{ justifyContent: 'center', gap: 22, position: 'relative' }}>
        <div className="eyebrow">Identity assigned</div>
        <div>
          <div className="eyebrow" style={{ color: 'var(--muted)' }}>You are a</div>
          <Decrypt text={runner ? 'RUNNER' : 'HUNTER'} className="display" style={{ display: 'block', fontSize: 'min(24vw, 128px)', fontWeight: 800, color: 'var(--accent)', lineHeight: 0.9, letterSpacing: '0.02em' }} />
        </div>
        <AnimatePresence>
          {stage >= 1 && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 10 }}>
              <p className="display" style={{ fontSize: 26, margin: 0, fontWeight: 600, lineHeight: 1.1 }}>
                {runner ? <>Hide. You have <span className="accent">{m} minute{m === 1 ? '' : 's'}</span>.</> : <>Hold position. The hunt opens when the admin says so.</>}
              </p>
              <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 15 }}>
                {runner ? (<>
                  <li>Stay inside the boundary. Leave it and you're out after a few seconds.</li>
                  <li>When the hunt starts, crack tasks to fill the bar. Hit the mark and runners win.</li>
                  <li>Hunters see you on their map during reveals. If one catches you, show your QR.</li>
                </>) : (<>
                  <li>Runners appear on your map during reveal windows.</li>
                  <li>Get close and scan a runner's QR to catch them.</li>
                  <li>Stop them hitting the mark on the bar, or catch everyone.</li>
                </>)}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
        {stage >= 2 && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 10 }}>
            <div className="eyebrow">Hunters on the field · {hunters.length}</div>
            <div className="row scroll-x" style={{ gap: 12 }}>
              {hunters.map((h) => (
                <div key={h.id} className="center" style={{ flex: 'none', width: 74 }}>
                  <div style={{ padding: 2, background: '#ffd000' }} className="cut cut-sm"><Avatar src={h.selfie} name={h.username} size={64} /></div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{h.username}</div>
                </div>
              ))}
            </div>
            <Button size="lg" block arrow onClick={onDone} style={{ marginTop: 12 }}>{runner ? 'Go hide' : 'Ready'}</Button>
          </motion.div>
        )}
      </div>
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

function useAuto(done: () => void, ms: number) {
  const d = useRef(done); d.current = done;
  useEffect(() => { const t = setTimeout(() => d.current(), ms); return () => clearTimeout(t); }, [ms]);
}

function HuntGo({ done }: { done: () => void }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    haptic.tap();
    const t = setInterval(() => setN((x) => { if (x > 1) haptic.tap(); else haptic.big(); return x - 1; }), 700);
    return () => clearInterval(t);
  }, []);
  useAuto(done, 3600);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 720, background: 'var(--scrim)', display: 'grid', placeItems: 'center', backdropFilter: 'blur(4px)' }}>
      <AnimatePresence mode="popLayout">
        {n > 0 ? (
          <motion.div key={n} className="display mono" initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.3 }} style={{ fontSize: 'min(48vw, 260px)', fontWeight: 800, color: 'var(--text)' }}>{n}</motion.div>
        ) : (
          <motion.div key="go" style={{ position: 'relative', textAlign: 'center' }} initial={{ scale: 2.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}>
            <motion.div aria-hidden style={{ position: 'absolute', left: '-30%', right: '-30%', top: '40%', height: '28%', background: 'var(--accent)', skewX: -14, transformOrigin: 'left' }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.25 }} />
            <div className="display" style={{ position: 'relative', fontSize: 'min(30vw, 190px)', fontWeight: 800, skewX: -8, color: 'var(--text)', lineHeight: 0.9 } as any}>HUNT</div>
            <div className="eyebrow" style={{ position: 'relative', marginTop: 12, color: 'var(--text)' }}>Is on</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Eliminated({ who, by, done }: { who?: Member; by?: Member; done: () => void }) {
  useEffect(() => { haptic.alarm(); }, []);
  useAuto(done, 2600);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 720, background: 'var(--scrim)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <motion.div style={{ position: 'absolute', left: '-20%', right: '-20%', height: 150, background: '#e63323', rotate: -9 }}
        initial={{ x: '-110%' }} animate={{ x: 0 }} transition={{ duration: 0.32, ease: [0.8, 0, 0.2, 1] }} />
      <motion.div className="row" style={{ position: 'relative', gap: 16, rotate: -9 }} initial={{ x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.18, duration: 0.3 }}>
        <div style={{ padding: 3, background: '#fff' }} className="cut"><Avatar src={who?.selfie} name={who?.username} size={88} out /></div>
        <div style={{ color: '#fff' }}>
          <div className="display" style={{ fontSize: 'min(13vw, 72px)', fontWeight: 800, lineHeight: 0.9 }}>ELIMINATED</div>
          <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>@{who?.username ?? 'runner'}{by ? <span style={{ opacity: 0.75 }}> · by @{by.username}</span> : null}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Alert({ title, sub, tone = 'accent', done }: { title: string; sub?: string; tone?: 'accent' | 'danger'; done: () => void }) {
  useEffect(() => { haptic.warn(); }, []);
  useAuto(done, 1900);
  const c = tone === 'danger' ? 'var(--danger)' : 'var(--accent)';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 710, display: 'grid', placeItems: 'center', pointerEvents: 'auto', background: 'radial-gradient(circle, transparent 30%, var(--scrim) 100%)' }}>
      <motion.div style={{ position: 'absolute', inset: 0, border: `3px solid ${c}` }} animate={{ opacity: [1, 0.2, 1, 0.2, 1] }} transition={{ duration: 1.6 }} />
      <motion.div className="center" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.22 }}
        style={{ width: '100%', background: c, color: tone === 'danger' ? '#fff' : 'var(--accent-ink)', padding: '22px 16px' }}>
        <div className="display" style={{ fontSize: 'min(11vw, 56px)', fontWeight: 800 }}>{title}</div>
        {sub && <div className="display" style={{ fontSize: 16, letterSpacing: '0.2em', fontWeight: 600, marginTop: 4 }}>{sub}</div>}
      </motion.div>
    </motion.div>
  );
}

function ResultSlam({ title, sub, win, done }: { title: string; sub: string; win: boolean | null; done: () => void }) {
  useEffect(() => { haptic.big(); }, []);
  useAuto(done, 3400);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 730, background: win === false ? '#0b0a09' : 'var(--bg)', display: 'grid', placeItems: 'center', overflow: 'hidden' }} className="grid-bg">
      <motion.div aria-hidden style={{ position: 'absolute', left: '-20%', right: '-20%', top: '44%', height: 120, background: win === false ? '#3a3530' : 'var(--accent)', skewY: -6 }}
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
      <div className="center" style={{ position: 'relative' }}>
        <motion.div className="display" initial={{ scale: 2.4, opacity: 0, filter: 'blur(12px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.35 }}
          style={{ fontSize: 'min(22vw, 150px)', fontWeight: 800, color: win === false ? '#9c9183' : 'var(--text)', lineHeight: 0.9 }}>{title}</motion.div>
        <motion.div className="display" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          style={{ fontSize: 20, letterSpacing: '0.24em', fontWeight: 600, marginTop: 14, color: win === false ? '#9c9183' : 'var(--text)' }}>{sub}</motion.div>
      </div>
    </motion.div>
  );
}

function Broadcast({ text, done }: { text: string; done: () => void }) {
  useEffect(() => { haptic.ok(); }, []);
  useAuto(done, 6500);
  return (
    <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }} onClick={done}
      style={{ position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top) + 12px)', zIndex: 715 }}>
      <div className="cut" style={{ background: 'var(--text)', color: 'var(--bg)', padding: '14px 16px', maxWidth: 560, margin: '0 auto', boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}>
        <div className="eyebrow" style={{ color: 'inherit', opacity: 0.6 }}>Admin broadcast</div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>{text}</div>
      </div>
    </motion.div>
  );
}
