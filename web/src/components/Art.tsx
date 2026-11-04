import { memo, useEffect, useId, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';

/*
  TAG art kit — "light painting".
  Night chases photographed on long exposure: torches leave flare-orange and ember-red
  streaks, the hunters' searchlight is police yellow. No grids, no textures, just light.
*/

export const FLARE = ['#ffd400', '#ffb020', '#ff6a1a', '#e8361f', '#b3170f'];

/* ---------- Ambient backdrop: drifting pools of light behind every screen ---------- */
export const Backdrop = memo(function Backdrop() {
  return (
    <div aria-hidden className="backdrop">
      <span className="orb orb-a" />
      <span className="orb orb-b" />
      <span className="orb orb-c" />
      <span className="backdrop-vignette" />
    </div>
  );
});

/* ---------- Light trails: long-exposure streaks with a glowing head ---------- */
type Trail = { d: string; w: number; dur: number; delay: number; from: string; to: string; head?: string };
const TRAILS: Trail[] = [
  { d: 'M-40 300 C 60 220, 120 340, 200 250 S 330 120, 420 170', w: 7, dur: 3.6, delay: 0, from: '#e8361f', to: '#ffb020', head: '#ffd9a8' },
  { d: 'M-30 360 C 80 330, 150 400, 240 320 S 360 260, 430 300', w: 3, dur: 4.2, delay: 0.5, from: '#b3170f', to: '#ff6a1a' },
  { d: 'M420 60 C 330 110, 300 40, 220 110 S 90 200, -30 150', w: 4, dur: 4.6, delay: 0.9, from: '#ffd400', to: '#ff6a1a', head: '#fff6c2' },
  { d: 'M-20 200 C 100 180, 140 120, 230 160 S 360 210, 420 120', w: 1.6, dur: 5.2, delay: 1.3, from: '#ff6a1a', to: '#ffd400' },
];

export const LightTrails = memo(function LightTrails({ height = 320, loop = true, dim = false }: { height?: number | string; loop?: boolean; dim?: boolean }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 400 400" width="100%" height={height} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ display: 'block', opacity: dim ? 0.55 : 1 }}>
      <defs>
        {TRAILS.map((t, i) => (
          <linearGradient key={i} id={`${id}g${i}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={t.from} stopOpacity="0" />
            <stop offset="45%" stopColor={t.from} />
            <stop offset="100%" stopColor={t.to} />
          </linearGradient>
        ))}
        <filter id={`${id}glow`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
        <radialGradient id={`${id}search`} cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#ffd400" stopOpacity=".35" /><stop offset="70%" stopColor="#ffd400" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* hunter's searchlight cone sweeping from above */}
      <motion.path d="M300 -20 L 160 420 L 420 420 Z" fill={`url(#${id}search)`} style={{ transformOrigin: '300px -20px' }}
        initial={{ rotate: 12 }} animate={reduce ? undefined : { rotate: [12, -14, 12] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
      {TRAILS.map((t, i) => (
        <g key={i}>
          {/* glow underlay */}
          <motion.path d={t.d} fill="none" stroke={`url(#${id}g${i})`} strokeWidth={t.w * 3.2} strokeLinecap="round" filter={`url(#${id}glow)`} opacity={0.55}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : t.dur, delay: t.delay, ease: [0.45, 0, 0.2, 1], repeat: loop && !reduce ? Infinity : 0, repeatDelay: 2.4, repeatType: 'loop' }} />
          <motion.path d={t.d} fill="none" stroke={`url(#${id}g${i})`} strokeWidth={t.w} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : t.dur, delay: t.delay, ease: [0.45, 0, 0.2, 1], repeat: loop && !reduce ? Infinity : 0, repeatDelay: 2.4, repeatType: 'loop' }} />
          {t.head && !reduce && (
            <circle r={t.w * 0.9} fill={t.head}>
              <animateMotion dur={`${t.dur + 2.4}s`} begin={`${t.delay}s`} repeatCount={loop ? 'indefinite' : '1'} path={t.d}
                keyPoints="0;1;1" keyTimes={`0;${(t.dur / (t.dur + 2.4)).toFixed(3)};1`} calcMode="spline" keySplines="0.45 0 0.2 1;0 0 1 1" />
            </circle>
          )}
        </g>
      ))}
    </svg>
  );
});

/* ---------- Police tape band (static, for hunter surfaces) ---------- */
export function TapeBand({ text = 'POLICE LINE · DO NOT CROSS', rotate = -4, style }: { text?: string; rotate?: number; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  const line = Array.from({ length: 10 }, () => text).join('   ·   ');
  return (
    <div aria-hidden style={{ position: 'absolute', left: '-20%', right: '-20%', rotate: `${rotate}deg`, overflow: 'hidden', background: '#ffd400', color: '#000', padding: '7px 0',
      fontWeight: 800, fontSize: 12.5, letterSpacing: '0.08em', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,.45)', ...style }}>
      <motion.div animate={reduce ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>{line}   ·   {line}</motion.div>
    </div>
  );
}

/* ---------- Loader: a runner dot orbited by a hunter dot ---------- */
export function Orbit({ size = 40 }: { size?: number }) {
  return (
    <span role="status" aria-label="Loading" style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <span style={{ position: 'absolute', inset: '30%', borderRadius: '50%', background: 'var(--runner)', boxShadow: '0 0 18px var(--runner)' }} />
      <motion.span style={{ position: 'absolute', inset: 0 }} animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
        <span style={{ position: 'absolute', top: 0, left: '50%', width: size * 0.22, height: size * 0.22, marginLeft: -size * 0.11, borderRadius: '50%', background: 'var(--hunter)', boxShadow: '0 0 12px var(--hunter)' }} />
      </motion.span>
    </span>
  );
}

/* ---------- Numbers that count up when they arrive ---------- */
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const [first] = useState(() => ({ v: 0 }));
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduce) { el.textContent = value.toFixed(decimals) + suffix; return; }
    const c = animate(first.v, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { first.v = v; el.textContent = v.toFixed(decimals) + suffix; } });
    return () => c.stop();
  }, [value]);
  return <span ref={ref} className="mono">{(0).toFixed(decimals)}{suffix}</span>;
}

/* ---------- Spark burst (catch / success moments) ---------- */
export function Sparks({ n = 14, color = '#ffb020', radius = 120 }: { n?: number; color?: string; radius?: number }) {
  return (
    <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2, r = radius * (0.7 + ((i * 37) % 10) / 25);
        return (
          <motion.span key={i} style={{ position: 'absolute', width: 4, height: 14, borderRadius: 2, background: i % 3 === 0 ? '#ffd400' : color, rotate: (a * 180) / Math.PI + 90 }}
            initial={{ x: 0, y: 0, opacity: 1, scaleY: 1.4 }} animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, scaleY: 0.4 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.02 * (i % 4) }} />
        );
      })}
    </span>
  );
}
