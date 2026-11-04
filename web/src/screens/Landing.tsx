import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { Sparks } from '../components/Art';
import { LogoMark } from '../components/ui';

/**
 * Opening shot, ~2.4 s. Two long-exposure light trails race in from opposite corners:
 * the runner's flare-orange streak and the hunter's police-yellow one. They meet,
 * the screen flashes, sparks fly, and the wordmark burns in. Tap to skip.
 */
const RUN = 'M-60 700 C 40 640, 10 520, 110 470 S 170 380, 200 400';
const HUNT = 'M460 120 C 360 150, 400 300, 300 330 S 230 420, 200 400';
const ease = [0.45, 0, 0.15, 1] as const;

export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const [hit, setHit] = useState(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setHit(true); const t = setTimeout(finish, 700); return () => clearTimeout(t); }
    const t1 = setTimeout(() => { setHit(true); haptic.big(); }, 1150);
    const t2 = setTimeout(finish, 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div onClick={finish} role="button" aria-label="Skip intro" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish()}
      style={{ position: 'fixed', inset: 0, background: '#000', cursor: 'pointer', zIndex: 900, overflow: 'hidden' }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)', transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}>
      <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="ld-run" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#b3170f" stopOpacity="0" /><stop offset="40%" stopColor="#e8361f" /><stop offset="100%" stopColor="#ffb020" /></linearGradient>
          <linearGradient id="ld-hunt" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb020" stopOpacity="0" /><stop offset="45%" stopColor="#ffd400" /><stop offset="100%" stopColor="#fff6c2" /></linearGradient>
          <filter id="ld-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
          <radialGradient id="ld-flash"><stop offset="0%" stopColor="#fff" /><stop offset="25%" stopColor="#ffd9a8" stopOpacity=".9" /><stop offset="60%" stopColor="#ff6a1a" stopOpacity=".35" /><stop offset="100%" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
        </defs>
        {[{ d: RUN, g: 'ld-run', w: 9, delay: 0.05 }, { d: HUNT, g: 'ld-hunt', w: 7, delay: 0.3 }].map((t) => (
          <g key={t.g}>
            <motion.path d={t.d} fill="none" stroke={`url(#${t.g})`} strokeWidth={t.w * 3} strokeLinecap="round" filter="url(#ld-glow)" opacity={0.7}
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, opacity: hit ? 0.25 : 0.7 }} transition={{ pathLength: { duration: 0.85, delay: t.delay, ease }, opacity: { duration: 0.8 } }} />
            <motion.path d={t.d} fill="none" stroke={`url(#${t.g})`} strokeWidth={t.w} strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, opacity: hit ? 0.35 : 1 }} transition={{ pathLength: { duration: 0.85, delay: t.delay, ease }, opacity: { duration: 0.8 } }} />
          </g>
        ))}
        {hit && (
          <motion.circle cx="200" cy="400" fill="url(#ld-flash)" initial={{ r: 0, opacity: 1 }} animate={{ r: [0, 260, 340], opacity: [1, 0.9, 0] }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        )}
        {hit && [0, 0.1, 0.22].map((d, i) => (
          <motion.circle key={i} cx="200" cy="400" fill="none" stroke={i === 1 ? '#ffd400' : '#ff6a1a'} strokeWidth={1.6}
            initial={{ r: 10, opacity: 0.9 }} animate={{ r: 180 + i * 70, opacity: 0 }} transition={{ duration: 1.2, delay: d, ease: [0.22, 1, 0.36, 1] }} />
        ))}
      </svg>

      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        {hit && <Sparks n={18} radius={150} color="#ff6a1a" />}
        <div className="center" style={{ position: 'relative' }}>
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={hit ? { opacity: 1, scale: 1 } : {}} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <LogoMark size={34} />
          </motion.div>
          <motion.div className="display text-flare" style={{ fontSize: 96, fontWeight: 850, letterSpacing: '-0.07em', lineHeight: 0.9, paddingRight: 6 }}
            initial={{ opacity: 0, y: 14, filter: 'blur(14px)' }} animate={hit ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}} transition={{ delay: 0.18, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            tag
          </motion.div>
          <motion.div initial={{ opacity: 0, letterSpacing: '0.4em' }} animate={hit ? { opacity: 0.7, letterSpacing: '0.18em' } : {}} transition={{ delay: 0.45, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginTop: 16, fontSize: 12.5, fontWeight: 650, color: '#fff6f0' }}>
            HIDE · RUN · DON’T GET CAUGHT
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
