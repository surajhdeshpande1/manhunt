import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { mulberry32 } from '../lib/rng';

/*
  Indie brutalist art kit — cut paper.
  Figures are flat cut-outs with a thick ink outline and a 3-frame stop-motion run cycle.
  Buildings are flat blocks with outlines. Nothing glows; things move.
*/

export const INK = '#0b0b0c';
export const C = { flare: '#d9541e', ember: '#b23a2b', police: '#c9a227', cream: '#ede6da', brick: '#8e2e22', ink: INK, night: '#0b0b0c' };

/* ---------- cut-out figures ---------- */
type Frame = { head: [number, number]; limbs: number[][] };
const RUN: Frame[] = [
  { head: [62, 14], limbs: [[59, 26, 49, 56], [57, 30, 72, 38, 84, 28], [57, 30, 42, 41, 34, 54], [49, 56, 66, 74, 62, 100], [49, 56, 36, 79, 18, 86]] },
  { head: [60, 15], limbs: [[58, 27, 51, 57], [56, 31, 64, 44, 58, 56], [56, 31, 46, 42, 44, 54], [51, 57, 58, 79, 54, 102], [51, 57, 45, 79, 41, 100]] },
  { head: [64, 16], limbs: [[61, 27, 46, 55], [59, 31, 76, 36, 86, 24], [59, 31, 44, 44, 40, 58], [46, 55, 68, 66, 76, 90], [46, 55, 30, 74, 8, 76]] },
];
// the hunter holds a torch straight out in front
const HUNT: Frame[] = RUN.map((f) => ({ head: f.head, limbs: f.limbs.map((l, i) => (i === 1 ? [l[0], l[1], l[0] + 16, l[1] + 4, l[0] + 30, l[1] + 2] : l)) }));

function Body({ f, fill, ink, hunter }: { f: Frame; fill: string; ink: string; hunter?: boolean }) {
  return (
    <>
      <g stroke={ink} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" fill="none">{f.limbs.map((l, i) => <polyline key={i} points={l.join(' ')} />)}</g>
      <circle cx={f.head[0]} cy={f.head[1]} r="12.5" fill={ink} />
      <g stroke={fill} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none">{f.limbs.map((l, i) => <polyline key={i} points={l.join(' ')} />)}</g>
      <circle cx={f.head[0]} cy={f.head[1]} r="8.5" fill={fill} />
      {hunter && <path d={`M${f.head[0] - 10} ${f.head[1] - 4} h20 l6 4 h-26z`} fill={ink} />}
      {hunter && <rect x={f.limbs[1][4] - 2} y={f.limbs[1][5] - 6} width="12" height="10" rx="2" fill={ink} />}
    </>
  );
}

/** A cut-out runner or hunter as an SVG group (draw inside an <svg>). */
export function FigureG({ role, running = true, beam = true, fps = 9, x = 0, y = 0, s = 1, ink = INK }: { role: 'runner' | 'hunter'; running?: boolean; beam?: boolean; fps?: number; x?: number; y?: number; s?: number; ink?: string }) {
  const frames = role === 'hunter' ? HUNT : RUN;
  const fill = role === 'hunter' ? C.police : C.flare;
  const dur = `${(frames.length / fps).toFixed(3)}s`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {role === 'hunter' && beam && <polygon points="94,30 230,-6 230,70" fill={C.police} opacity=".5" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />}
      {running ? frames.map((f, i) => (
        <g key={i} className="cut-frame" style={{ animationDuration: dur, animationDelay: `${(-((frames.length - i) % frames.length) / fps).toFixed(3)}s`, ['--n' as any]: frames.length }}>
          <Body f={f} fill={fill} ink={ink} hunter={role === 'hunter'} />
        </g>
      )) : <Body f={frames[0]} fill={fill} ink={ink} hunter={role === 'hunter'} />}
    </g>
  );
}

/** Standalone figure. */
export function Figure({ role, size = 110, running = true, beam, style }: { role: 'runner' | 'hunter'; size?: number; running?: boolean; beam?: boolean; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden style={{ display: 'block', overflow: 'visible', ...style }}>
      <FigureG role={role} running={running && !reduce} beam={beam ?? role === 'hunter'} />
    </svg>
  );
}

/* ---------- blocky campus skyline ---------- */
export function useBlocks(seed: number, width: number, minH: number, maxH: number) {
  return useMemo(() => {
    const r = mulberry32(seed); const out: { x: number; w: number; h: number; c: number; win: [number, number][] ; roof: number }[] = []; let x = -6;
    while (x < width + 6) {
      const w = 26 + Math.floor(r() * 44), h = minH + Math.floor(r() * (maxH - minH)), c = Math.floor(r() * 4), roof = r();
      const win: [number, number][] = [];
      for (let yy = 12; yy < h - 14; yy += 16) for (let xx = 7; xx < w - 10; xx += 13) if (r() > 0.55) win.push([xx, yy]);
      out.push({ x, w, h, c, win, roof }); x += w + 4 + Math.floor(r() * 6);
    }
    return out;
  }, [seed, width, minH, maxH]);
}
export function BlocksG({ blocks, ground, palette, ink = INK, lit = '#c9a227' }: { blocks: ReturnType<typeof useBlocks>; ground: number; palette: string[]; ink?: string; lit?: string }) {
  return (
    <g stroke={ink} strokeWidth="2.5" strokeLinejoin="round">
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={ground - b.h} width={b.w} height={b.h + 400} fill={palette[b.c % palette.length]} />
          {b.roof > 0.82 && <polygon points={`${b.x},${ground - b.h} ${b.x + b.w / 2},${ground - b.h - 14} ${b.x + b.w},${ground - b.h}`} fill={palette[(b.c + 1) % palette.length]} />}
          {b.roof < 0.12 && <rect x={b.x + b.w / 2 - 2} y={ground - b.h - 16} width="4" height="16" fill={ink} />}
          {b.win.map(([wx, wy], j) => <rect key={j} x={b.x + wx} y={ground - b.h + wy} width="6" height="7" fill={(i + j) % 3 ? lit : C.cream} strokeWidth="1.5" />)}
        </g>
      ))}
    </g>
  );
}

/** Flat block skyline as its own picture (replaces the old night campus). */
export const BlockCity = memo(function BlockCity({ height = 160, seed = 3, day, style }: { height?: number | string; seed?: number; day?: boolean; style?: React.CSSProperties }) {
  const W = 400, G = 186;
  const back = useBlocks(seed, W, 70, 130), front = useBlocks(seed + 9, W, 30, 86);
  const ink = day ? INK : '#000';
  return (
    <svg viewBox={`0 0 ${W} 200`} width="100%" height={height} preserveAspectRatio="xMidYMax slice" aria-hidden style={{ display: 'block', ...style }}>
      <circle cx="318" cy="52" r="26" fill={C.flare} stroke={ink} strokeWidth="2.5" />
      <BlocksG blocks={back} ground={G} palette={day ? ['#e2dacd', '#d8cfc0', '#ebe4d8'] : ['#232327', '#2a2a30', '#1d1d21']} ink={ink} lit={day ? '#c9a227' : '#c98a2e'} />
      <BlocksG blocks={front} ground={G} palette={day ? ['#e0784a', '#c9a227', '#ede6da', '#b23a2b'] : ['#151518', '#111113', '#19191c']} ink={ink} lit={day ? INK : '#c9a227'} />
      <rect x="-4" y={G} width={W + 8} height="20" fill={day ? INK : '#000'} />
    </svg>
  );
});

/* ---------- looping chase panel (hero art; replaces light trails) ---------- */
export const ChaseScene = memo(function ChaseScene({ height = 260, seed = 4, day = false, speed = 1 }: { height?: number | string; seed?: number; day?: boolean; speed?: number }) {
  const reduce = useReducedMotion();
  const W = 400, H = 300, G = 250;
  const back = useBlocks(seed, W * 2, 70, 150), front = useBlocks(seed + 5, W * 2, 26, 70);
  const ink = day ? INK : '#000';
  const loop = reduce ? undefined : { x: [0, -W] };
  const tr = (d: number) => ({ duration: d / speed, repeat: Infinity, ease: 'linear' as const });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="xMidYMax slice" aria-hidden style={{ display: 'block', overflow: 'hidden' }}>
      <circle cx="320" cy="70" r="34" fill={C.flare} stroke={ink} strokeWidth="3" />
      <motion.g animate={loop} transition={tr(26)}>
        <BlocksG blocks={back} ground={G} palette={day ? ['#e2dacd', '#d8cfc0', '#ebe4d8'] : ['#232327', '#2a2a30', '#1d1d21']} ink={ink} lit={day ? '#c9a227' : '#c98a2e'} />
      </motion.g>
      <motion.g animate={loop} transition={tr(11)}>
        <BlocksG blocks={front} ground={G} palette={day ? ['#e0784a', '#c9a227', '#ede6da'] : ['#151518', '#111113', '#19191c']} ink={ink} lit={day ? INK : '#c9a227'} />
      </motion.g>
      <rect x="-4" y={G} width={W + 8} height="60" fill={ink} />
      {/* road dashes rushing past */}
      <motion.g animate={reduce ? undefined : { x: [0, -80] }} transition={tr(0.9)}>
        {Array.from({ length: 8 }, (_, i) => <rect key={i} x={i * 80} y={G + 22} width="40" height="5" fill={day ? '#ede6da' : '#3a2f27'} />)}
      </motion.g>
      {/* the chase: runner ahead, hunter closing and falling back */}
      <motion.g animate={reduce ? undefined : { x: [0, 26, -8, 0] }} transition={{ duration: 5 / speed, repeat: Infinity, ease: 'easeInOut' }}>
        <FigureG role="runner" running={!reduce} x={236} y={G - 92} s={0.82} ink={ink} />
      </motion.g>
      <motion.g animate={reduce ? undefined : { x: [0, 40, 70, 10, 0] }} transition={{ duration: 5 / speed, repeat: Infinity, ease: 'easeInOut' }}>
        <FigureG role="hunter" running={!reduce} x={52} y={G - 94} s={0.84} ink={ink} />
      </motion.g>
    </svg>
  );
});

/* ---------- comic burst (replaces lens flares) ---------- */
export function Burst({ size = 260, fill = C.police, ink = INK, text, delay = 0 }: { size?: number; fill?: string; ink?: string; text?: string; delay?: number }) {
  const pts = useMemo(() => Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, r = i % 2 ? 0.62 : 0.98 - ((i * 7) % 5) * 0.04; return `${50 + Math.cos(a) * 50 * r},${50 + Math.sin(a) * 50 * r}`; }).join(' '), []);
  return (
    <motion.svg viewBox="-4 -4 108 108" width={size} height={size} aria-hidden style={{ display: 'block', overflow: 'visible' }}
      initial={{ scale: 0, rotate: -20 }} animate={{ scale: [0, 1.15, 1], rotate: [-20, 4, 0] }} transition={{ delay, duration: 0.45, ease: [0.3, 1.4, 0.6, 1] }}>
      <polygon points={pts} fill={ink} transform="translate(3 3)" />
      <polygon points={pts} fill={fill} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
      {text && <text x="50" y="58" textAnchor="middle" fontFamily="Archivo Variable, system-ui" fontWeight="900" fontSize="24" fill={ink} style={{ fontStretch: '80%' }}>{text}</text>}
    </motion.svg>
  );
}

/** The chase in a framed panel: outline, hard shadow, flat. Text never sits on top of it. */
export function ArtPanel({ height = 220, seed = 4, day, children, style }: { height?: number | string; seed?: number; day?: boolean; children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: day ? '#e9dccb' : '#141416', boxShadow: '0 0 0 1px var(--line2)', marginRight: 5, marginBottom: 5, ...style }}>
      <ChaseScene height="100%" seed={seed} day={day} />
      {children}
    </div>
  );
}
