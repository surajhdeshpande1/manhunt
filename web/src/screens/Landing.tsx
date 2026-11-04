import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { mulberry32 } from '../lib/rng';
import { Sparks } from '../components/Art';
import { LogoMark } from '../components/ui';
import { Grain, LensFlare, Silhouette } from '../components/Scenes';

/**
 * Opening film, 10 seconds, plays on every launch.
 *
 *  0.0  Night falls. Stars come out, the campus skyline rises, windows and street lamps flicker on.
 *  2.2  A runner's flare-orange light trail streaks through the streets.     "Someone is hiding."
 *  4.6  A police-yellow searchlight sweeps; the hunter's trail gives chase.  "Someone is hunting."
 *  7.2  They meet. Flash, rings, sparks.
 *  7.6  The wordmark burns in over the skyline.                               "Hide. Run. Don't get caught."
 * 10.0  Hand off to the app.
 *
 * Plays in full on every launch. With reduced motion the film is a 1.2 s still.
 */
const W = 400, H = 860, GROUND = 640;
const RUN = 'M-40 600 C 40 560, 90 610, 150 560 S 230 470, 200 430';
const HUNT = 'M440 520 C 360 470, 330 560, 270 500 S 220 440, 200 430';
const ease = [0.22, 1, 0.36, 1] as const;

type Act = 0 | 1 | 2 | 3 | 4;

function useSkyline() {
  return useMemo(() => {
    const r = mulberry32(7);
    const blocks: { x: number; w: number; h: number; win: { x: number; y: number; d: number }[] }[] = [];
    let x = -10;
    while (x < W + 10) {
      const w = 26 + Math.floor(r() * 46), h = 70 + Math.floor(r() * 150) * (r() > 0.75 ? 1.5 : 1);
      const win: { x: number; y: number; d: number }[] = [];
      for (let yy = GROUND - h + 12; yy < GROUND - 14; yy += 14) for (let xx = x + 6; xx < x + w - 8; xx += 11) if (r() > 0.72) win.push({ x: xx, y: yy, d: r() });
      blocks.push({ x, w, h, win });
      x += w + 2 + Math.floor(r() * 6);
    }
    const stars = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * 380, s: r() * 1.3 + 0.3, d: r() }));
    const lamps = [40, 118, 196, 274, 352].map((lx, i) => ({ x: lx + (i % 2 ? 6 : -4), d: i * 0.12 }));
    return { blocks, stars, lamps };
  }, []);
}

export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const [act, setAct] = useState<Act>(0);
  const { blocks, stars, lamps } = useSkyline();
  // the SVG is drawn bottom-aligned with "slice": work out where the street sits on this screen
  const scale = typeof window !== 'undefined' ? Math.max(window.innerWidth / W, window.innerHeight / H) : 1;
  const groundPx = (H - GROUND) * scale;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    if (reduce) { setAct(4); const t = setTimeout(finish, 1200); return () => clearTimeout(t); }
    const T = [
      setTimeout(() => setAct(1), 2200),
      setTimeout(() => setAct(2), 4600),
      setTimeout(() => { setAct(3); haptic.big(); }, 7200),
      setTimeout(() => setAct(4), 7600),
      setTimeout(finish, 10000),
    ];
    return () => T.forEach(clearTimeout);
  }, []);

  const caption = act === 1 ? 'Someone is hiding.' : act === 2 ? 'Someone is hunting.' : null;

  return (
    <motion.div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 900, overflow: 'hidden' }}
      exit={{ opacity: 0, transition: { duration: 0.7, ease } }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#05030a" /><stop offset="55%" stopColor="#1a0710" /><stop offset="82%" stopColor="#4a0f1f" /><stop offset="100%" stopColor="#a63a12" />
          </linearGradient>
          <radialGradient id="moon"><stop offset="0%" stopColor="#fff2e0" /><stop offset="60%" stopColor="#ffd9a8" stopOpacity=".9" /><stop offset="100%" stopColor="#ffd9a8" stopOpacity="0" /></radialGradient>
          <radialGradient id="lamp"><stop offset="0%" stopColor="#ffb020" stopOpacity=".55" /><stop offset="100%" stopColor="#ffb020" stopOpacity="0" /></radialGradient>
          <linearGradient id="run" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#b3170f" stopOpacity="0" /><stop offset="40%" stopColor="#e8361f" /><stop offset="100%" stopColor="#ffb020" /></linearGradient>
          <linearGradient id="hunt" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb020" stopOpacity="0" /><stop offset="45%" stopColor="#ffd400" /><stop offset="100%" stopColor="#fff6c2" /></linearGradient>
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffd400" stopOpacity=".45" /><stop offset="100%" stopColor="#ffd400" stopOpacity="0" /></linearGradient>
          <radialGradient id="flash"><stop offset="0%" stopColor="#fff" /><stop offset="25%" stopColor="#fff2e0" stopOpacity=".95" /><stop offset="60%" stopColor="#ff6a1a" stopOpacity=".35" /><stop offset="100%" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>

        {/* sky: dusk sinks into night */}
        <motion.rect width={W} height={H} fill="url(#sky)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2.2, ease: 'easeOut' }} />
        {stars.map((s, i) => (
          <motion.circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff2e0"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0.4, 0.85] }} transition={{ delay: 0.4 + s.d * 1.6, duration: 3 + s.d * 2, repeat: Infinity, repeatType: 'mirror' }} />
        ))}
        <motion.circle cx="296" cy="176" r="64" fill="url(#moon)" initial={{ opacity: 0, cy: 216 }} animate={{ opacity: 0.85, cy: 176 }} transition={{ duration: 3, ease }} />

        {/* hunter's searchlight, act 2 */}
        <motion.path d="M330 -40 L 150 700 L 420 700 Z" fill="url(#beam)" style={{ transformOrigin: '330px -40px' }}
          initial={{ opacity: 0, rotate: 24 }} animate={act >= 2 ? { opacity: act >= 3 ? 0.25 : 1, rotate: [24, -8, 6] } : { opacity: 0 }} transition={{ duration: 2.8, ease: 'easeInOut' }} />

        {/* skyline rises */}
        <motion.g initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5, duration: 1.8, ease }}>
          {blocks.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={GROUND - b.h} width={b.w} height={b.h + 300} fill="#0a0507" />
              {b.win.map((w, j) => (
                <motion.rect key={j} x={w.x} y={w.y} width="4" height="5" rx="0.6" fill={w.d > 0.8 ? '#fff2e0' : '#ffb020'}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.95, 0.55, 0.9] }} transition={{ delay: 1.2 + w.d * 1.8, duration: 2.4, repeat: Infinity, repeatType: 'mirror' }} />
              ))}
            </g>
          ))}
          <rect x="0" y={GROUND} width={W} height={H - GROUND} fill="#050203" />
          {lamps.map((l, i) => (
            <g key={i}>
              <motion.ellipse cx={l.x} cy={GROUND + 6} rx="38" ry="14" fill="url(#lamp)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 + l.d, duration: 0.6 }} />
              <rect x={l.x - 0.8} y={GROUND - 34} width="1.6" height="38" fill="#2a1a12" />
              <motion.circle cx={l.x} cy={GROUND - 35} r="2.4" fill="#ffd9a8" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.6, 1] }} transition={{ delay: 1.6 + l.d, duration: 0.5 }} />
            </g>
          ))}
        </motion.g>

        {/* the chase */}
        {[{ d: RUN, g: 'run', w: 8, on: act >= 1, dur: 2.2 }, { d: HUNT, g: 'hunt', w: 6, on: act >= 2, dur: 2.4 }].map((t) => (
          <g key={t.g}>
            <motion.path d={t.d} fill="none" stroke={`url(#${t.g})`} strokeWidth={t.w * 3} strokeLinecap="round" filter="url(#glow)"
              initial={{ pathLength: 0, opacity: 0.7 }} animate={t.on ? { pathLength: 1, opacity: act >= 3 ? 0.2 : 0.7 } : {}} transition={{ pathLength: { duration: t.dur, ease: [0.45, 0, 0.2, 1] }, opacity: { duration: 1 } }} />
            <motion.path d={t.d} fill="none" stroke={`url(#${t.g})`} strokeWidth={t.w} strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={t.on ? { pathLength: 1, opacity: act >= 3 ? 0.3 : 1 } : {}} transition={{ pathLength: { duration: t.dur, ease: [0.45, 0, 0.2, 1] }, opacity: { duration: 1 } }} />
          </g>
        ))}

        {/* the tag */}
        {act >= 3 && <motion.circle cx="200" cy="430" fill="url(#flash)" initial={{ r: 0, opacity: 1 }} animate={{ r: [0, 300, 420], opacity: [1, 0.9, 0] }} transition={{ duration: 1.3, ease }} />}
        {act >= 3 && [0, 0.12, 0.26].map((d, i) => (
          <motion.circle key={i} cx="200" cy="430" fill="none" stroke={['#ff6a1a', '#ffd400', '#e8361f'][i]} strokeWidth="1.6"
            initial={{ r: 10, opacity: 0.9 }} animate={{ r: 200 + i * 80, opacity: 0 }} transition={{ duration: 1.5, delay: d, ease }} />
        ))}
      </svg>

      {/* figures cross the street under the lamps, rim-lit so they read against the dark */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: groundPx - 6, height: 110, pointerEvents: 'none', overflow: 'visible' }}>
        {act >= 1 && act < 3 && (
          <motion.div style={{ position: 'absolute', bottom: 0, filter: 'drop-shadow(0 0 5px rgba(255,138,61,.95)) drop-shadow(0 0 14px rgba(232,54,31,.6))' }}
            initial={{ left: '-20%' }} animate={{ left: '108%' }} transition={{ duration: 4.6, ease: 'linear' }}>
            <Silhouette pose="sprint" color="#120806" size={64} />
          </motion.div>
        )}
        {act === 2 && (
          <motion.div style={{ position: 'absolute', bottom: 0, filter: 'drop-shadow(0 0 5px rgba(255,212,0,.9))' }}
            initial={{ left: '-25%' }} animate={{ left: '62%' }} transition={{ duration: 2.6, ease: 'linear' }}>
            <Silhouette pose="scan" color="#120806" size={66} beam="#ffd400" />
          </motion.div>
        )}
      </div>
      {act >= 3 && <LensFlare y="50%" color="#ffd9a8" />}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}><Grain opacity={0.11} /></div>

      {/* the scene dims so the title card owns the frame */}
      <motion.div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 60% at 50% 38%, rgba(0,0,0,.35), rgba(0,0,0,.82))', pointerEvents: 'none' }}
        initial={{ opacity: 0 }} animate={{ opacity: act >= 4 ? 1 : 0 }} transition={{ duration: 0.9, ease }} />

      {/* captions */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '16%', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <AnimatePresence mode="wait">
          {caption && (
            <motion.div key={caption} initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.8, ease }} style={{ color: act === 2 ? '#ffe766' : '#ffd9a8', fontSize: 'clamp(20px, 5.6vw, 26px)', fontWeight: 500, letterSpacing: '-0.02em' }}>
              {caption}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* title card */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', paddingBottom: '22vh' }}>
        <div className="center" style={{ position: 'relative' }}>
          {act === 3 && <Sparks n={20} radius={170} color="#ff6a1a" />}
          {act >= 4 && (
            <>
              <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><LogoMark size={36} /></motion.div>
              <motion.div className="display text-flare" initial={{ opacity: 0, y: 16, filter: 'blur(16px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.1, duration: 0.9, ease }}
                style={{ fontSize: 'clamp(84px, 28vw, 120px)', fontWeight: 850, letterSpacing: '-0.07em', lineHeight: 0.9, paddingRight: 8 }}>tag</motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 0.85, y: 0 }} transition={{ delay: 0.7, duration: 0.9, ease }}
                style={{ marginTop: 18, fontSize: 16, fontWeight: 500, color: '#fff2e0', letterSpacing: '-0.01em' }}>Hide. Run. Don’t get caught.</motion.div>
            </>
          )}
        </div>
      </div>

      {/* film progress + skip */}
      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 'calc(env(safe-area-inset-bottom) + 22px)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(255,242,224,.14)', overflow: 'hidden' }}>
          <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #e8361f, #ffb020, #ffd400)', transformOrigin: 'left' }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 1.2 : 10, ease: 'linear' }} />
        </div>

      </div>
    </motion.div>
  );
}
