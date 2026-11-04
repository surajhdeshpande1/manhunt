import { useId } from 'react';
import { motion } from 'framer-motion';

/* Illustrated medals. Each badge has its own emblem; the rim colour tells you the rarity. */
const RIM: Record<string, [string, string]> = {
  first_blood: ['#d9541e', '#8e2e22'], hat_trick: ['#c9a227', '#9e8020'], ghost: ['#ede6da', '#8c9bff'], full_clear: ['#7fa38a', '#0e6b4a'],
  first_win: ['#b8923a', '#a66b00'], veteran: ['#e0a27a', '#3a1712'], road_runner: ['#e0784a', '#b23a2b'], marathon: ['#8c9bff', '#1b2a6b'],
};
function Emblem({ code, c }: { code: string; c: string }) {
  const s = { fill: 'none', stroke: c, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (code) {
    case 'first_blood': return <g {...s}><circle cx="32" cy="32" r="11" /><path d="M32 15v8M32 41v8M15 32h8M41 32h8" /><circle cx="32" cy="32" r="2.5" fill={c} /></g>;
    case 'hat_trick': return <g {...s}><path d="M20 26l12-8 12 8M20 34l12-8 12 8M20 42l12-8 12 8" /></g>;
    case 'ghost': return <g {...s}><path d="M21 46V30a11 11 0 0122 0v16l-4-3-3.5 3-3.5-3-3.5 3-3.5-3z" /><circle cx="28" cy="30" r="1.8" fill={c} /><circle cx="36" cy="30" r="1.8" fill={c} /></g>;
    case 'full_clear': return <g {...s}><rect x="19" y="19" width="26" height="26" rx="6" /><path d="M25 32l5 5 10-11" /></g>;
    case 'first_win': return <g {...s}><path d="M24 18h16v8a8 8 0 01-16 0zM24 21h-5a5 5 0 005 7M40 21h5a5 5 0 01-5 7M32 34v6M26 46h12M28 40h8" /></g>;
    case 'veteran': return <g {...s}><path d="M32 17l4.5 9.2 10.1 1.5-7.3 7.1 1.7 10-9-4.7-9 4.7 1.7-10-7.3-7.1 10.1-1.5z" /></g>;
    case 'road_runner': return <g {...s}><path d="M35 16L22 35h10l-3 13 13-19H32z" /></g>;
    case 'marathon': return <g {...s}><path d="M18 32c0-5 4-8 7-8 7 0 7 16 14 16 3 0 7-3 7-8s-4-8-7-8c-7 0-7 16-14 16-3 0-7-3-7-8z" /></g>;
    default: return <circle cx="32" cy="32" r="8" fill={c} />;
  }
}
export function BadgeArt({ code, on, size = 64 }: { code: string; on: boolean; size?: number }) {
  const id = useId().replace(/:/g, '');
  const [a, b] = RIM[code] ?? ['#e0a27a', '#3a1712'];
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 64 76" aria-hidden style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={on ? a : '#5a524c'} /><stop offset="100%" stopColor={on ? b : '#2a2a2f'} /></linearGradient>
        <radialGradient id={`${id}f`} cx="50%" cy="35%" r="65%"><stop offset="0%" stopColor={on ? '#2a1a12' : '#1a1715'} /><stop offset="100%" stopColor="#0b0807" /></radialGradient>
        <linearGradient id={`${id}s`} x1="0" x2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0" /><stop offset="50%" stopColor="#fff" stopOpacity=".55" /><stop offset="100%" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`${id}c`}><circle cx="32" cy="32" r="27" /></clipPath>
      </defs>
      {/* ribbon tails */}
      <path d="M22 52 L18 74 L26 69 L30 76 L32 56Z" fill={on ? b : '#2a2a2f'} />
      <path d="M42 52 L46 74 L38 69 L34 76 L32 56Z" fill={on ? a : '#3a332e'} />
      <circle cx="32" cy="32" r="30" fill={`url(#${id}r)`} />
      <circle cx="32" cy="32" r="25" fill={`url(#${id}f)`} />
      <g opacity={on ? 1 : 0.35}><Emblem code={code} c={on ? a : '#8a7f78'} /></g>
      {on && (
        <g clipPath={`url(#${id}c)`}>
          <motion.rect y="0" width="18" height="64" fill={`url(#${id}s)`} transform="skewX(-20)" initial={{ x: -30 }} animate={{ x: 90 }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut' }} />
        </g>
      )}
      {!on && <g transform="translate(43 42)"><circle r="8" fill="#0b0b0c" stroke="#5a524c" /><path d="M-3 0v-2a3 3 0 016 0v2M-4 0h8v5h-8z" fill="none" stroke="#8a7f78" strokeWidth="1.4" /></g>}
    </svg>
  );
}
