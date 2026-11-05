import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { mulberry32 } from '../lib/rng';

/* Event themes an admin can put on a room: they add a light layer of seasonal art
   over the room screens without changing the team colours. */
export type EventKey = 'none' | 'diwali' | 'halloween' | 'fest' | 'holi';
export const EVENTS: Record<EventKey, { label: string; blurb: string; swatch: string }> = {
  none: { label: 'None', blurb: 'Just the night.', swatch: 'linear-gradient(135deg, #171412, #2a2a2f)' },
  diwali: { label: 'Diwali', blurb: 'Diyas and gold sparks.', swatch: 'radial-gradient(circle at 50% 70%, #c9a227, #e0784a 40%, #3a1712 80%)' },
  halloween: { label: 'Halloween', blurb: 'Bats over the campus.', swatch: 'radial-gradient(circle at 50% 40%, #e0784a, #8e3a1c 45%, #0b0807 80%)' },
  fest: { label: 'College fest', blurb: 'Confetti in team colours.', swatch: 'conic-gradient(#d9541e, #c9a227, #ede6da, #3d4fd6, #d9541e)' },
  holi: { label: 'Holi', blurb: 'Clouds of colour.', swatch: 'conic-gradient(#ff4fd8, #c9a227, #7fa38a, #3e5c8a, #ff4fd8)' },
};

function Diya({ x, d, s }: { x: number; d: number; s: number }) {
  return (
    <motion.div style={{ position: 'absolute', left: `${x}%`, bottom: -40, width: 26 * s, height: 40 * s }}
      initial={{ y: 0, opacity: 0 }} animate={{ y: '-55vh', opacity: [0, 1, 1, 0] }} transition={{ duration: 14 + d * 6, delay: d * 9, repeat: Infinity, ease: 'linear' }}>
      <svg viewBox="0 0 26 40" width="100%" height="100%">
        <defs><radialGradient id="dg"><stop offset="0%" stopColor="#e6d79a" /><stop offset="60%" stopColor="#c98a2e" stopOpacity=".6" /><stop offset="100%" stopColor="#d9541e" stopOpacity="0" /></radialGradient></defs>
        <circle cx="13" cy="14" r="13" fill="url(#dg)" />
        <path d="M13 4 C 17 10, 17 16, 13 19 C 9 16, 9 10, 13 4Z" fill="#d9b84a" />
        <path d="M3 26 Q 13 38 23 26 Z" fill="#8e3a1c" />
      </svg>
    </motion.div>
  );
}
function Bat({ y, d, s }: { y: number; d: number; s: number }) {
  return (
    <motion.svg viewBox="0 0 40 16" width={40 * s} height={16 * s} style={{ position: 'absolute', top: `${y}%`, left: -60, filter: 'drop-shadow(0 0 4px rgba(255,138,61,.9))' }}
      animate={{ x: [0, window.innerWidth + 120], y: [0, -20, 10, -10, 0] }} transition={{ duration: 12 + d * 6, delay: d * 8, repeat: Infinity, ease: 'linear' }}>
      <motion.path d="M20 9 C 17 4, 12 2, 2 6 C 7 7, 9 9, 10 12 C 13 9, 16 10, 20 14 C 24 10, 27 9, 30 12 C 31 9, 33 7, 38 6 C 28 2, 23 4, 20 9Z" fill="#120806"
        animate={{ scaleY: [1, 0.5, 1] }} transition={{ duration: 0.35, repeat: Infinity }} style={{ transformOrigin: '20px 9px' }} />
    </motion.svg>
  );
}

export const EventLayer = memo(function EventLayer({ event }: { event?: string | null }) {
  const reduce = useReducedMotion();
  const r = useMemo(() => mulberry32(event?.length ?? 1), [event]);
  const items = useMemo(() => Array.from({ length: 14 }, () => ({ x: r() * 100, y: r() * 60, d: r(), s: 0.6 + r() * 0.7, c: Math.floor(r() * 4) })), [r]);
  if (!event || event === 'none' || reduce) return null;
  const wrap: React.CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3, overflow: 'hidden' };
  if (event === 'diwali') return (
    <div aria-hidden style={wrap}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 40% at 50% 105%, rgba(255,176,32,.22), transparent 70%)' }} />
      {items.slice(0, 9).map((it, i) => <Diya key={i} x={it.x} d={it.d} s={it.s} />)}
    </div>
  );
  if (event === 'halloween') return (
    <div aria-hidden style={wrap}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 30% at 50% 0%, rgba(255,138,61,.16), transparent 70%)' }} />
      {items.slice(0, 5).map((it, i) => <Bat key={i} y={4 + it.y * 0.5} d={it.d} s={it.s} />)}
      <svg viewBox="0 0 100 100" width="120" height="120" style={{ position: 'absolute', top: 0, right: 0, opacity: 0.22 }}>
        <g fill="none" stroke="#ede6da" strokeWidth="0.7">{[20, 40, 60, 80].map((r2) => <path key={r2} d={`M100 ${r2} Q ${100 - r2 * 0.5} ${r2 * 0.5} ${100 - r2} 0`} />)}
          {[0, 25, 50, 75].map((a) => <line key={a} x1="100" y1="0" x2={100 - 100 * Math.cos((a * Math.PI) / 180)} y2={100 * Math.sin((a * Math.PI) / 180)} />)}</g>
      </svg>
    </div>
  );
  if (event === 'fest') return (
    <div aria-hidden style={wrap}>
      {items.map((it, i) => (
        <motion.span key={i} style={{ position: 'absolute', left: `${it.x}%`, top: -20, width: 7 * it.s, height: 12 * it.s, borderRadius: 2, background: ['#d9541e', '#c9a227', '#ede6da', '#3d4fd6'][it.c] }}
          animate={{ y: ['0vh', '106vh'], rotate: [0, 360 * (it.c % 2 ? 1 : -1)], x: [0, (it.d - 0.5) * 80] }} transition={{ duration: 7 + it.d * 6, delay: it.d * 7, repeat: Infinity, ease: 'linear' }} />
      ))}
    </div>
  );
  // holi
  return (
    <div aria-hidden style={wrap}>
      {items.slice(0, 7).map((it, i) => (
        <motion.span key={i} style={{ position: 'absolute', left: `${it.x - 15}%`, top: `${it.y + 10}%`, width: 220 * it.s, height: 220 * it.s, borderRadius: '50%',
          background: `radial-gradient(circle, ${['#ff4fd8', '#c9a227', '#7fa38a', '#3e5c8a'][it.c]}55, transparent 65%)` }}
          animate={{ scale: [0.6, 1.15, 0.6], opacity: [0, 0.8, 0] }} transition={{ duration: 6 + it.d * 5, delay: it.d * 6, repeat: Infinity }} />
      ))}
    </div>
  );
});

export function EventBadge({ event }: { event?: string | null }) {
  if (!event || event === 'none') return null;
  const e = EVENTS[event as EventKey]; if (!e) return null;
  return <span className="tag" style={{ background: e.swatch, color: event === 'halloween' ? '#fff' : '#000', fontWeight: 750 }}>{e.label}</span>;
}
