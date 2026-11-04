import { memo, useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { mulberry32 } from '../lib/rng';
import { resolvedDay, useAppearance } from '../lib/theme';

/* =====================================================================
   NIGHT CAMPUS — layered skyline, trees, lamps; paper-cut version by day
   ===================================================================== */
export const NightCampus = memo(function NightCampus({ height = 180, seed = 3, moon = true, lamps = true, style }: { height?: number | string; seed?: number; moon?: boolean; lamps?: boolean; style?: React.CSSProperties }) {
  const id = useId().replace(/:/g, '');
  const day = resolvedDay(useAppearance());
  const reduce = useReducedMotion();
  const W = 400, H = 200, G = 176;
  const { back, front, trees, lampX } = useMemo(() => {
    const r = mulberry32(seed);
    const row = (minH: number, maxH: number, gap: number) => {
      const out: { x: number; w: number; h: number; roof: number; win: [number, number, number][] }[] = []; let x = -8;
      while (x < W + 8) {
        const w = 22 + r() * 40, h = minH + r() * (maxH - minH), roof = r() > 0.8 ? 1 : r() > 0.7 ? 2 : 0;
        const win: [number, number, number][] = [];
        for (let yy = G - h + 9; yy < G - 10; yy += 11) for (let xx = x + 5; xx < x + w - 6; xx += 9) if (r() > 0.74) win.push([xx, yy, r()]);
        out.push({ x, w, h, roof, win }); x += w + gap + r() * 8;
      }
      return out;
    };
    const trees = Array.from({ length: 7 }, () => ({ x: r() * W, s: 0.7 + r() * 0.6 }));
    return { back: row(60, 130, 0), front: row(28, 92, 6), trees, lampX: [36, 128, 220, 312].map((v) => v + r() * 30) };
  }, [seed]);
  const sky0 = day ? '#fff7ec' : 'transparent';
  const backFill = day ? '#f0e0cc' : '#141634';
  const frontFill = day ? '#d9b99a' : '#0b0708';
  const treeFill = day ? '#b9a07f' : '#070a08';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="xMidYMax slice" aria-hidden style={{ display: 'block', ...style }}>
      <defs>
        <radialGradient id={`${id}m`}><stop offset="0%" stopColor="#fff2e0" /><stop offset="55%" stopColor="#ffd9a8" stopOpacity=".85" /><stop offset="100%" stopColor="#ffd9a8" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}l`}><stop offset="0%" stopColor="#ffb020" stopOpacity={day ? 0.25 : 0.55} /><stop offset="100%" stopColor="#ffb020" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={day ? '#f1dfca' : '#1b2a6b'} stopOpacity={day ? 1 : 0.35} /><stop offset="100%" stopColor={sky0} stopOpacity="0" /></linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}g)`} />
      {moon && <circle cx="320" cy="44" r={day ? 18 : 26} fill={day ? '#ffb27a' : `url(#${id}m)`} opacity={day ? 0.55 : 0.9} />}
      {back.map((b, i) => <rect key={`b${i}`} x={b.x} y={G - b.h} width={b.w} height={b.h} fill={backFill} />)}
      {trees.map((t, i) => (
        <g key={`t${i}`} transform={`translate(${t.x} ${G}) scale(${t.s})`} fill={treeFill}>
          <rect x="-1.5" y="-18" width="3" height="18" /><circle cx="0" cy="-26" r="11" /><circle cx="-8" cy="-20" r="8" /><circle cx="8" cy="-21" r="8" />
        </g>
      ))}
      {front.map((b, i) => (
        <g key={`f${i}`}>
          <rect x={b.x} y={G - b.h} width={b.w} height={b.h} fill={frontFill} />
          {b.roof === 1 && <polygon points={`${b.x},${G - b.h} ${b.x + b.w / 2},${G - b.h - 12} ${b.x + b.w},${G - b.h}`} fill={frontFill} />}
          {b.roof === 2 && <rect x={b.x + b.w / 2 - 1} y={G - b.h - 14} width="2" height="14" fill={frontFill} />}
          {!day && b.win.map(([x, y, d], j) => (
            <motion.rect key={j} x={x} y={y} width="3.5" height="4.5" rx="0.6" fill={d > 0.85 ? '#fff2e0' : '#ffb020'}
              initial={{ opacity: 0.85 }} animate={reduce ? undefined : { opacity: [0.85, 0.35, 0.85] }} transition={{ duration: 3 + d * 5, repeat: Infinity, delay: d * 4 }} />
          ))}
        </g>
      ))}
      <rect x="0" y={G} width={W} height={H - G} fill={frontFill} />
      {lamps && lampX.map((x, i) => (
        <g key={`l${i}`}>
          <ellipse cx={x} cy={G + 4} rx="30" ry="9" fill={`url(#${id}l)`} />
          <rect x={x - 0.7} y={G - 26} width="1.4" height="27" fill={day ? '#3a2b23' : '#2a1d16'} />
          <circle cx={x} cy={G - 27} r="2.2" fill={day ? '#ffb020' : '#ffd9a8'} />
        </g>
      ))}
    </svg>
  );
});

/* =====================================================================
   SILHOUETTES — pictogram figures built from joints
   ===================================================================== */
type Pose = 'run' | 'crouch' | 'scan' | 'sprint';
const POSES: Record<Pose, { head: [number, number]; limbs: number[][]; phone?: [number, number] }> = {
  run: { head: [60, 13], limbs: [[57, 25, 47, 56], [55, 29, 70, 38, 82, 28], [55, 29, 40, 41, 32, 54], [47, 56, 64, 74, 60, 100], [47, 56, 34, 79, 16, 86]] },
  sprint: { head: [66, 16], limbs: [[62, 27, 46, 54], [60, 31, 78, 34, 88, 22], [60, 31, 44, 44, 40, 58], [46, 54, 68, 66, 74, 92], [46, 54, 30, 74, 8, 74]] },
  crouch: { head: [38, 50], limbs: [[44, 60, 60, 78], [46, 64, 58, 74, 48, 86], [46, 64, 34, 74, 28, 86], [60, 78, 74, 94, 64, 110], [60, 78, 48, 98, 34, 110]] },
  scan: { head: [42, 12], limbs: [[42, 24, 42, 62], [42, 30, 62, 36, 78, 33], [42, 30, 34, 48, 38, 62], [42, 62, 52, 88, 54, 114], [42, 62, 34, 88, 30, 114]], phone: [78, 33] },
};
export function Silhouette({ pose, color = '#000', size = 120, beam, style }: { pose: Pose; color?: string; size?: number; beam?: string; style?: React.CSSProperties }) {
  const p = POSES[pose];
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden style={{ display: 'block', overflow: 'visible', ...style }}>
      {beam && p.phone && <polygon points={`${p.phone[0] + 4},${p.phone[1]} 150,${p.phone[1] - 24} 150,${p.phone[1] + 24}`} fill={beam} opacity=".35" />}
      <g stroke={color} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {p.limbs.map((l, i) => <polyline key={i} points={l.join(' ')} />)}
      </g>
      <circle cx={p.head[0]} cy={p.head[1]} r="9" fill={color} />
      {p.phone && <rect x={p.phone[0] - 1} y={p.phone[1] - 6} width="6" height="11" rx="1.5" fill={beam ?? color} />}
    </svg>
  );
}

/* =====================================================================
   FILM GRAIN — for cinematic moments only
   ===================================================================== */
const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
export function Grain({ opacity = 0.09 }: { opacity?: number }) {
  return <div aria-hidden className="grain" style={{ position: 'absolute', inset: '-50%', backgroundImage: NOISE, opacity, pointerEvents: 'none', mixBlendMode: 'overlay', zIndex: 5 }} />;
}

/* =====================================================================
   LENS FLARE — anamorphic streak + ghosts, fired at a moment
   ===================================================================== */
export function LensFlare({ x = '50%', y = '50%', color = '#ffd9a8', delay = 0 }: { x?: string; y?: string; color?: string; delay?: number }) {
  return (
    <div aria-hidden style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, pointerEvents: 'none', zIndex: 4 }}>
      <motion.span style={{ position: 'absolute', left: '-60vw', width: '120vw', top: -1.5, height: 3, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${color} 40%, #fff 50%, ${color} 60%, transparent)`, filter: 'blur(0.5px)' }}
        initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: [0, 1, 1.15], opacity: [0, 1, 0] }} transition={{ delay, duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
      <motion.span style={{ position: 'absolute', left: -70, top: -70, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${color} 18%, transparent 62%)` }}
        initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 1.2, 1.4], opacity: [0, 1, 0] }} transition={{ delay, duration: 1.2 }} />
      {[[60, 40, 34, 0.35], [130, 86, 18, 0.5], [-90, -60, 26, 0.25]].map(([dx, dy, r, o], i) => (
        <motion.span key={i} style={{ position: 'absolute', left: dx - r, top: dy - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `1px solid ${color}`, background: `${color}22` }}
          initial={{ opacity: 0 }} animate={{ opacity: [0, o, 0] }} transition={{ delay: delay + 0.1 + i * 0.05, duration: 1.4 }} />
      ))}
    </div>
  );
}

/* =====================================================================
   TORN EDGE — ripped paper edge between a coloured block and what follows
   ===================================================================== */
export function TornEdge({ color, height = 18, seed = 5, flip, style }: { color: string; height?: number; seed?: number; flip?: boolean; style?: React.CSSProperties }) {
  const d = useMemo(() => {
    const r = mulberry32(seed); let p = 'M0 0 L0 6 ';
    for (let x = 0; x <= 400; x += 6 + r() * 10) p += `L${x.toFixed(1)} ${(4 + r() * 12).toFixed(1)} `;
    return p + 'L400 0 Z';
  }, [seed]);
  return (
    <svg viewBox="0 0 400 18" preserveAspectRatio="none" width="100%" height={height} aria-hidden style={{ display: 'block', transform: flip ? 'scaleY(-1)' : undefined, ...style }}>
      <path d={d} fill={color} />
    </svg>
  );
}

/* =====================================================================
   TAPE PIECE — a short strip of police tape stuck on a corner
   ===================================================================== */
export function TapePiece({ text = 'POLICE', rotate = -12, style }: { text?: string; rotate?: number; style?: React.CSSProperties }) {
  return (
    <span aria-hidden style={{ position: 'absolute', zIndex: 3, padding: '4px 14px', rotate: `${rotate}deg`, background: 'repeating-linear-gradient(-45deg, #ffd400 0 10px, #f2c400 10px 20px)', color: '#000',
      fontSize: 10.5, fontWeight: 850, letterSpacing: '0.12em', boxShadow: '0 4px 10px rgba(0,0,0,.35)', clipPath: 'polygon(3% 0, 100% 6%, 97% 100%, 0 92%)', ...style }}>{text}</span>
  );
}
