import { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * A miniature match, drawn in the same language as the live map:
 * a few streets and blocks, the safe zone, three runners drifting,
 * and a hunter who sweeps in and tags one every few seconds.
 */
const ROADS = [
  'M-20 92 C 80 84, 170 108, 380 96',
  'M-20 248 C 90 236, 210 262, 380 238',
  'M70 -20 C 82 90, 60 220, 88 380',
  'M236 -20 C 220 110, 262 230, 240 380',
  'M-20 330 L 120 196 L 380 168',
];
const LANES = ['M150 -20 C 146 120, 160 240, 150 380', 'M-20 170 C 120 176, 220 150, 380 150', 'M300 -20 L 312 380'];
const BLOCKS: [number, number, number, number][] = [
  [100, 18, 44, 52], [160, 22, 52, 46], [262, 24, 70, 48], [16, 116, 40, 46], [108, 120, 30, 26],
  [172, 108, 48, 30], [266, 112, 30, 26], [322, 186, 40, 40], [168, 184, 54, 40], [18, 270, 44, 52], [104, 268, 34, 70], [262, 262, 30, 70], [172, 282, 50, 60],
];

// runner loops (x, y keyframes)
const RUN = [
  { x: [118, 150, 196, 176, 118], y: [210, 178, 196, 232, 210], d: 14 },
  { x: [262, 290, 310, 282, 262], y: [70, 98, 140, 126, 70], d: 17 },
  { x: [40, 80, 70, 30, 40], y: [190, 210, 240, 236, 190], d: 15 },
];

function Scene({ height = 300 }: { height?: number }) {
  const reduce = useReducedMotion();
  const [hit, setHit] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setHit((h) => h + 1), 6000);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <svg viewBox="0 0 360 360" width="100%" height={height} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ display: 'block' }}>
      <defs>
        <radialGradient id="fs-fade" cx="50%" cy="50%" r="60%">
          <stop offset="62%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
        </radialGradient>
        <radialGradient id="fs-blue"><stop offset="0%" stopColor="#ff6a1a" stopOpacity=".55" /><stop offset="100%" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
        <radialGradient id="fs-red"><stop offset="0%" stopColor="#ffd400" stopOpacity=".28" /><stop offset="100%" stopColor="#ffd400" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="360" height="360" fill="#0b0b0c" />
      {BLOCKS.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="5" fill="#141417" />)}
      {ROADS.map((d, i) => <path key={i} d={d} fill="none" stroke="#212125" strokeWidth="11" strokeLinecap="round" />)}
      {LANES.map((d, i) => <path key={i} d={d} fill="none" stroke="#1b1b1e" strokeWidth="5" strokeLinecap="round" />)}

      {/* safe zone: tint outside, clean inside, slowly closing */}
      <motion.circle cx="180" cy="168" fill="none" stroke="#f5f5f7" strokeOpacity=".5" strokeWidth="1.2" strokeDasharray="3 6"
        initial={{ r: 150 }} animate={reduce ? { r: 140 } : { r: [150, 128, 150] }} transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }} />

      {RUN.map((r, i) => (
        <motion.g key={i} initial={{ x: r.x[0], y: r.y[0] }}
          animate={reduce ? undefined : { x: r.x, y: r.y }} transition={{ duration: r.d, repeat: Infinity, ease: 'easeInOut' }}>
          <circle r="14" fill="url(#fs-blue)" />
          <circle r="5" fill="#ff6a1a" stroke="#0b0b0c" strokeWidth="2" />
        </motion.g>
      ))}

      {/* hunter: sweeps toward runner 0 */}
      <motion.g initial={{ x: 210, y: 300 }}
        animate={reduce ? undefined : { x: [210, 200, 160, 130, 170, 210], y: [300, 262, 224, 210, 270, 300] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}>
        <circle r="34" fill="url(#fs-red)" />
        <circle r="30" fill="none" stroke="#ffd400" strokeOpacity=".4" strokeDasharray="2 4" />
        <circle r="6" fill="#ffd400" stroke="#0b0b0c" strokeWidth="2" />
      </motion.g>

      {/* tag flash */}
      {!reduce && (
        <motion.circle key={hit} cx="132" cy="208" fill="none" stroke="#ffd400" strokeWidth="1.5"
          initial={{ r: 4, opacity: 0 }} animate={{ r: [4, 46], opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.2, delay: 2.6, ease: [0.22, 1, 0.36, 1], times: [0, 0.12, 1] }} />
      )}
      <rect width="360" height="360" fill="url(#fs-fade)" />
    </svg>
  );
}
export const FieldScene = memo(Scene);
