import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { lite } from '../lib/viewport';
import { mulberry32 } from '../lib/rng';

/*
  Role ambience — the screen breathes with your side of the game.
  Runner ("the hunted"): embers rise, the edges pulse like a heartbeat (faster when exposed),
  faint footprints cross the bottom.
  Hunter ("the law"): a radar sweep turns in the corner, two searchlights pan, police tape edges the top.
  Everything sits at the screen edges and never blocks touches or the map's centre.
*/

export const RunnerAmbience = memo(function RunnerAmbience({ exposed = false, intensity = 1 }: { exposed?: boolean; intensity?: number }) {
  const reduce = useReducedMotion();
  const embers = useMemo(() => { const r = mulberry32(31); return Array.from({ length: lite ? 7 : 16 }, () => ({ x: r() * 100, d: r(), s: 2 + r() * 4, drift: (r() - 0.5) * 60, hot: r() > 0.6 })); }, []);
  if (reduce) return null;
  const beat = exposed ? 0.55 : 1.1;
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 25, overflow: 'hidden', opacity: intensity }}>
      {/* heartbeat at the edges: lub-dub, faster when you're exposed */}
      <motion.div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 0 ${exposed ? 8 : 5}px ${exposed ? '#b23a2b' : '#d9541e'}` }}
        animate={{ opacity: [0.15, 0.95, 0.35, 0.8, 0.15] }} transition={{ duration: beat, times: [0, 0.12, 0.25, 0.37, 1], repeat: Infinity, ease: 'easeOut' }} />
      {/* embers rising from the bottom */}
      {embers.map((e, i) => (
        <motion.span key={i} style={{ position: 'absolute', bottom: -10, left: `${e.x}%`,
          width: e.s + 4, height: e.s + 4, borderRadius: 1, background: e.hot ? '#c9a227' : '#d9541e', boxShadow: '0 0 0 1.5px #0b0b0c' }}
          animate={{ y: [0, -(260 + e.d * 260)], x: [0, e.drift], opacity: [0, 1, 0.8, 0], rotate: [0, 180 + e.drift * 3], scale: [1, 1, 0.4] }}
          transition={{ duration: 4 + e.d * 4, delay: e.d * 6, repeat: Infinity, ease: 'easeOut' }} />
      ))}
      {/* footprints crossing the bottom edge now and then */}
      <motion.div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 6px)', left: 0, display: 'flex', gap: 22 }}
        initial={{ x: '-40vw' }} animate={{ x: ['-40vw', '120vw'] }} transition={{ duration: 16, repeat: Infinity, repeatDelay: 10, ease: 'linear' }}>
        {Array.from({ length: lite ? 4 : 8 }, (_, i) => (
          <motion.svg key={i} width="10" height="16" viewBox="0 0 10 16" style={{ transform: `translateY(${i % 2 ? -7 : 0}px) rotate(90deg)` }}
            animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: 3, delay: i * 0.25, repeat: Infinity, repeatDelay: 1 }}>
            <ellipse cx="5" cy="10" rx="4" ry="5.5" fill="#d9541e" stroke="#0b0b0c" strokeWidth="1.2" /><ellipse cx="5" cy="2.6" rx="2.6" ry="2.4" fill="#d9541e" stroke="#0b0b0c" strokeWidth="1.2" />
          </motion.svg>
        ))}
      </motion.div>
    </div>
  );
});

export const HunterAmbience = memo(function HunterAmbience({ hunting = true, intensity = 1 }: { hunting?: boolean; intensity?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 25, overflow: 'hidden', opacity: intensity }}>
      {/* radar sweep, bottom-left corner */}
      <div style={{ position: 'absolute', left: -150, bottom: -150, width: 300, height: 300, borderRadius: '50%', boxShadow: 'inset 0 0 0 2.5px rgba(201,162,39,.5)' }}>
        {[0.33, 0.66].map((k) => <span key={k} style={{ position: 'absolute', inset: `${k * 50}%`, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px rgba(201,162,39,.35)' }} />)}
        <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(201,162,39,.38) 0deg 40deg, transparent 40deg)' }}
          animate={{ rotate: 360 }} transition={{ duration: hunting ? 3 : 6, repeat: Infinity, ease: 'linear' }} />
      </div>
      {/* two searchlights panning from the top corners */}
      {[{ x: '8%', from: 18, to: -10, d: 0 }, { x: '92%', from: -16, to: 12, d: 1.5 }].map((l, i) => (
        <motion.div key={i} style={{ position: 'absolute', top: -40, left: l.x, width: 0, height: 0, transformOrigin: '0 0' }}
          animate={{ rotate: [l.from, l.to, l.from] }} transition={{ duration: 9, delay: l.d, repeat: Infinity, ease: 'easeInOut' }}>
          <span style={{ position: 'absolute', left: -90, top: 0, width: 180, height: '85vh', clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)',
            background: 'rgba(201,162,39,.16)' }} />
        </motion.div>
      ))}
      {/* police tape along the top edge, gently scrolling */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 9, overflow: 'hidden', borderBottom: '2px solid #000' }}>
        <motion.div style={{ width: '200%', height: '100%', background: 'repeating-linear-gradient(-45deg, #c9a227 0 10px, #000 10px 20px)' }}
          animate={{ x: ['0%', '-50%'] }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} />
      </div>
    </div>
  );
});

/* ---------- small HUD glyphs ---------- */
/** an ECG trace; speeds up when exposed */
export function Heartbeat({ exposed = false, width = 54, color = '#d9541e' }: { exposed?: boolean; width?: number; color?: string }) {
  const d = 'M0 12 H14 L18 4 L22 20 L26 8 L29 12 H54';
  return (
    <svg width={width} height="24" viewBox="0 0 54 24" aria-hidden style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeOpacity=".2" strokeWidth="2" />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"
        initial={{ pathLength: 0, pathOffset: 0 }} animate={{ pathLength: [0, 0.45, 0], pathOffset: [0, 0.3, 1] }}
        transition={{ duration: exposed ? 0.6 : 1.2, repeat: Infinity, ease: 'linear' }} />
    </svg>
  );
}
/** a tiny rotating radar */
export function RadarGlyph({ size = 26, color = '#c9a227' }: { size?: number; color?: string }) {
  return (
    <span aria-hidden style={{ position: 'relative', width: size, height: size, display: 'inline-block', borderRadius: '50%', boxShadow: `inset 0 0 0 2px ${color}` }}>
      <span style={{ position: 'absolute', inset: '30%', borderRadius: '50%', boxShadow: `inset 0 0 0 1px ${color}55` }} />
      <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from 0deg, ${color} 0deg 50deg, transparent 50deg)` }}
        animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
      <span style={{ position: 'absolute', left: '50%', top: '50%', width: 3, height: 3, margin: -1.5, borderRadius: '50%', background: color }} />
    </span>
  );
}
