import { memo, useEffect, useId, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { ChaseScene } from './Brut';
import { resolvedDay, useAppearance } from '../lib/theme';

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
      <span className="orb orb-d" />
      <span className="backdrop-vignette" />
    </div>
  );
});

/* ---------- Hero art: the looping cut-paper chase (kept under the old name) ---------- */
export const LightTrails = memo(function LightTrails({ height = 320, dim = false }: { height?: number | string; loop?: boolean; dim?: boolean }) {
  const day = resolvedDay(useAppearance());
  return <div style={{ opacity: dim ? 0.6 : 1, height }}><ChaseScene height="100%" day={day} /></div>;
});

/* ---------- Police tape band (static, for hunter surfaces) ---------- */
export function TapeBand({ text = 'POLICE LINE · DO NOT CROSS', rotate = -4, style }: { text?: string; rotate?: number; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  const line = Array.from({ length: 10 }, () => text).join('   ·   ');
  return (
    <div aria-hidden style={{ position: 'absolute', left: '-20%', right: '-20%', rotate: `${rotate}deg`, overflow: 'hidden', background: '#ffd400', color: '#000', padding: '7px 0',
      fontWeight: 900, fontSize: 12.5, letterSpacing: '0.08em', whiteSpace: 'nowrap', borderTop: '2.5px solid #000', borderBottom: '2.5px solid #000', ...style }}>
      <motion.div animate={reduce ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>{line}   ·   {line}</motion.div>
    </div>
  );
}

/* ---------- Loader: hunter block chasing runner block around a square ---------- */
export function Orbit({ size = 40 }: { size?: number }) {
  const s = size * 0.34;
  const path = { left: [0, size - s, size - s, 0, 0], top: [0, 0, size - s, size - s, 0] };
  return (
    <span role="status" aria-label="Loading" style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      {[{ c: 'var(--runner)', d: 0 }, { c: 'var(--hunter)', d: -0.5 }].map((b, i) => (
        <motion.span key={i} style={{ position: 'absolute', width: s, height: s, background: b.c, boxShadow: '0 0 0 2px var(--edge)', borderRadius: 2 }}
          animate={path} transition={{ duration: 1.6, delay: b.d, repeat: Infinity, ease: [0.7, 0, 0.3, 1], times: [0, 0.25, 0.5, 0.75, 1] }} />
      ))}
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

/* ---------- Burst of flat cut-paper chips (catch / success moments) ---------- */
export function Sparks({ n = 14, color = '#ff6a1a', radius = 120 }: { n?: number; color?: string; radius?: number }) {
  return (
    <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2, r = radius * (0.7 + ((i * 37) % 10) / 25), sz = 8 + (i % 3) * 4;
        return (
          <motion.span key={i} style={{ position: 'absolute', width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2, background: ['#ffd400', color, '#fff2e0'][i % 3], boxShadow: '0 0 0 2px #14110f', borderRadius: i % 4 === 0 ? '50%' : 1 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }} animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: [1, 1, 0], rotate: 180 + i * 20, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.2, 0.9, 0.25, 1], delay: 0.02 * (i % 4) }} />
        );
      })}
    </span>
  );
}
