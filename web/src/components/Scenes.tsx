import { memo, useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { mulberry32 } from '../lib/rng';
import { resolvedDay, useAppearance } from '../lib/theme';
import { BlockCity, Burst, Figure } from './Brut';

/* =====================================================================
   NIGHT CAMPUS — layered skyline, trees, lamps; paper-cut version by day
   ===================================================================== */
export const NightCampus = memo(function NightCampus({ height = 180, seed = 3, night, style }: { height?: number | string; seed?: number; moon?: boolean; lamps?: boolean; night?: boolean; style?: React.CSSProperties }) {
  const day = !night && resolvedDay(useAppearance());
  return <BlockCity height={height} seed={seed} day={day} style={style} />;
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
export function Silhouette({ pose, size = 120, beam, style }: { pose: Pose; color?: string; size?: number; beam?: string; style?: React.CSSProperties }) {
  return <Figure role={pose === 'scan' ? 'hunter' : 'runner'} size={size} running={pose !== 'crouch'} beam={pose === 'scan' && !!beam} style={style} />;
}

/* =====================================================================
   FILM GRAIN — for cinematic moments only
   ===================================================================== */
const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
export function Grain(_: { opacity?: number }) {
  return null;
}

/* =====================================================================
   LENS FLARE — anamorphic streak + ghosts, fired at a moment
   ===================================================================== */
/** flat flash: a hard cream frame that blinks and a comic burst */
export function LensFlare({ x = '50%', y = '50%', delay = 0 }: { x?: string; y?: string; color?: string; delay?: number }) {
  return (
    <div aria-hidden style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, pointerEvents: 'none', zIndex: 4 }}>
      <motion.div style={{ position: 'absolute', left: -130, top: -130 }} initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ delay, duration: 1.1, times: [0, 0.7, 1] }}>
        <Burst size={260} delay={delay} />
      </motion.div>
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
      fontSize: 10.5, fontWeight: 850, letterSpacing: '0.12em', border: '2px solid #000', boxShadow: '3px 3px 0 #000', ...style }}>{text}</span>
  );
}
