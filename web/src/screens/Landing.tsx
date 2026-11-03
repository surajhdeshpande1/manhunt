import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';

/** ~4 s intro: runner sprints, hunter closes in, a tap tags the runner, TAG slams in. Tap to skip. */

const W = 400, H = 800;
// cubic bezier the chase follows
const P0 = [-60, 610], P1 = [90, 470], P2 = [180, 650], P3 = [262, 430];
function bez(t: number) {
  const u = 1 - t;
  const x = u ** 3 * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t ** 3 * P3[0];
  const y = u ** 3 * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t ** 3 * P3[1];
  return [x, y];
}
function track(from: number, to: number, n = 26) {
  const xs: number[] = [], ys: number[] = [], rs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    const [x, y] = bez(t);
    const [x2, y2] = bez(Math.min(1, t + 0.01));
    xs.push(x); ys.push(y); rs.push((Math.atan2(y2 - y, x2 - x) * 180) / Math.PI);
  }
  return { x: xs, y: ys, rotate: rs };
}

const SHARDS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.2;
  const d = 60 + (i % 4) * 26;
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: (i * 47) % 360, s: 4 + (i % 3) * 3 };
});

export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const shake = useAnimationControls();
  const [phase, setPhase] = useState<'chase' | 'tag' | 'logo'>('chase');
  const runner = useMemo(() => track(0, 1), []);
  const hunter = useMemo(() => track(0, 0.86), []);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    const t1 = setTimeout(() => { setPhase('tag'); haptic.tap(); }, 2050);
    const t2 = setTimeout(() => {
      setPhase('logo'); haptic.big();
      shake.start({ x: [0, -9, 8, -5, 4, -2, 0], y: [0, 5, -4, 3, -2, 1, 0], transition: { duration: 0.42 } });
    }, 2420);
    const t3 = setTimeout(finish, 4100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const tagged = phase !== 'chase';
  const [tx, ty] = P3;

  return (
    <motion.div onClick={finish} role="button" aria-label="Skip intro" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish()}
      style={{ position: 'fixed', inset: 0, background: '#0b0a09', overflow: 'hidden', cursor: 'pointer', zIndex: 900 }}
      exit={{ opacity: 0 }}>
      <motion.svg animate={shake} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="rgba(239,230,214,.07)" /></pattern>
          <radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="55%" stopColor="#0b0a09" stopOpacity="0" /><stop offset="100%" stopColor="#0b0a09" stopOpacity=".9" /></radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width={W} height={H} fill="url(#g)" />
        {/* drifting contour lines, like a survey map */}
        <motion.g initial={{ y: 0 }} animate={{ y: -40 }} transition={{ duration: 4.2, ease: 'linear' }} opacity={0.5}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M-20 ${200 + i * 95} C 80 ${160 + i * 95}, 160 ${260 + i * 95}, 240 ${210 + i * 95} S 380 ${150 + i * 95}, 430 ${220 + i * 95}`}
              fill="none" stroke="rgba(239,230,214,.08)" strokeWidth="1" />
          ))}
        </motion.g>
        {/* scan sweep */}
        <motion.rect x={0} width={W} height={2} fill="#ff4a1c" opacity={0.5} initial={{ y: -10 }} animate={{ y: H + 10 }} transition={{ duration: 1.3, ease: 'easeInOut' }} />

        {/* chase trail */}
        <motion.path d={`M${P0[0]} ${P0[1]} C ${P1[0]} ${P1[1]}, ${P2[0]} ${P2[1]}, ${P3[0]} ${P3[1]}`} fill="none" stroke="#ff6214" strokeWidth={1.5}
          strokeDasharray="2 7" initial={{ pathLength: 0, opacity: 0.7 }} animate={{ pathLength: 1, opacity: tagged ? 0 : 0.7 }} transition={{ duration: 2, ease: 'easeOut' }} />

        {/* RUNNER: an orange arrowhead */}
        {!tagged && (
          <motion.g initial={{ x: runner.x[0], y: runner.y[0], rotate: runner.rotate[0] }}
            animate={{ x: runner.x, y: runner.y, rotate: runner.rotate }} transition={{ duration: 2.05, ease: [0.35, 0, 0.25, 1] }}>
            <g filter="url(#glow)">
              <polygon points="14,0 -10,-10 -5,0 -10,10" fill="#ff6214" />
              <rect x={-26} y={-2} width={9} height={4} fill="#ff6214" opacity={0.6} />
              <rect x={-40} y={-1.5} width={7} height={3} fill="#ff6214" opacity={0.3} />
            </g>
          </motion.g>
        )}

        {/* HUNTER: yellow reticle that closes in, then snaps on */}
        <motion.g initial={{ x: hunter.x[0], y: hunter.y[0] }}
          animate={tagged ? { x: tx, y: ty, scale: [1, 0.7, 1.15], rotate: 45 } : { x: hunter.x, y: hunter.y, rotate: 0 }}
          transition={tagged ? { duration: 0.3, ease: 'easeOut' } : { duration: 1.75, delay: 0.3, ease: [0.45, 0, 0.3, 1] }}>
          <g stroke="#ffd000" strokeWidth={2} fill="none" filter="url(#glow)">
            <circle r={18} strokeOpacity={0.9} />
            <path d="M0 -30V-22M0 22V30M-30 0H-22M22 0H30" />
          </g>
          <circle r={2.5} fill="#ffd000" />
        </motion.g>

        {/* the TAP */}
        {tagged && (
          <g transform={`translate(${tx} ${ty})`}>
            <motion.circle r={10} fill="none" stroke="#efe6d6" strokeWidth={2} initial={{ scale: 0.4, opacity: 1 }} animate={{ scale: 6, opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
            <motion.circle r={22} fill="#efe6d6" initial={{ scale: 0, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.35 }} />
            {SHARDS.map((s, i) => (
              <motion.rect key={i} width={s.s} height={s.s * 0.5} fill={i % 2 ? '#ff6214' : '#e63323'}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ x: s.dx, y: s.dy, rotate: s.r, opacity: 0 }}
                transition={{ duration: 0.9, ease: [0.1, 0.7, 0.3, 1] }} />
            ))}
            <motion.text y={-40} textAnchor="middle" fill="#ffd000" fontFamily="Barlow Condensed" fontWeight={800} fontSize={16} letterSpacing="4"
              initial={{ opacity: 0, y: -30 }} animate={{ opacity: [0, 1, 0], y: -48 }} transition={{ duration: 0.7 }}>TAGGED</motion.text>
          </g>
        )}
        <rect width={W} height={H} fill="url(#vig)" pointerEvents="none" />
      </motion.svg>

      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 22px)', left: 22, pointerEvents: 'none' }}>
        <motion.div className="eyebrow" style={{ color: '#9c9183', letterSpacing: '0.24em' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>TAG // Live manhunt</motion.div>
        <motion.div style={{ color: '#5f574d', fontSize: 11, letterSpacing: '0.12em', marginTop: 4 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>SIGNAL ACQUIRED · TRACKING 1 TARGET</motion.div>
      </div>
      <motion.div className="mono" style={{ position: 'absolute', right: 22, bottom: 'calc(env(safe-area-inset-bottom) + 52px)', color: '#5f574d', fontSize: 11, letterSpacing: '0.12em', pointerEvents: 'none' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>16.1805°N 75.6905°E</motion.div>

      {/* white flash */}
      {phase === 'logo' && (
        <motion.div style={{ position: 'absolute', inset: 0, background: '#efe6d6', pointerEvents: 'none' }}
          initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.45 }} />
      )}

      {/* LOGO SLAM */}
      {phase === 'logo' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <motion.div aria-hidden style={{ position: 'absolute', left: '-14%', right: '-14%', top: '46%', height: '22%', background: '#ff4a1c', transformOrigin: 'left', skewX: -14 }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.28, delay: 0.08, ease: [0.8, 0, 0.2, 1] }} />
            {['#ffd000', '#ff6214'].map((c, i) => (
              <motion.div key={c} aria-hidden className="display"
                style={{ position: 'absolute', inset: 0, fontSize: 'min(42vw, 220px)', fontWeight: 800, color: c, mixBlendMode: 'screen', skewX: -8 }}
                initial={{ x: i ? 14 : -14, opacity: 0.8 }} animate={{ x: 0, opacity: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>TAG</motion.div>
            ))}
            <motion.h1 className="display" style={{ position: 'relative', margin: 0, fontSize: 'min(42vw, 220px)', fontWeight: 800, color: '#efe6d6', skewX: -8, lineHeight: 0.85 }}
              initial={{ scale: 2.4, opacity: 0, filter: 'blur(14px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}>TAG</motion.h1>
            <motion.div className="display" style={{ marginTop: 18, fontSize: 15, letterSpacing: '0.42em', color: '#9c9183', fontWeight: 600 }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.4 }}>HIDE · RUN · GET TAGGED</motion.div>
          </div>
        </div>
      )}

      <motion.div className="eyebrow" style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 22px)', left: 0, right: 0, textAlign: 'center', color: '#5f574d' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>Tap to skip</motion.div>
    </motion.div>
  );
}
