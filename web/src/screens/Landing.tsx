import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';

/**
 * One-second open. The runner dot drifts in, the hunter dot closes the gap,
 * they touch, a single catch-radius ring goes out, and the wordmark settles.
 * Tap anywhere to skip.
 */
const spring = { type: 'spring', stiffness: 260, damping: 26 } as const;

export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => haptic.tap(), 620);
    const t2 = setTimeout(finish, reduce ? 500 : 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div onClick={finish} role="button" aria-label="Skip intro" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish()}
      style={{ position: 'fixed', inset: 0, background: '#000', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 900 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 64, height: 38 }}>
          {/* catch ring, fired at the moment of contact */}
          <motion.span aria-hidden style={{ position: 'absolute', left: 32 - 19, top: 0, width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #ffd400' }}
            initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 3.4], opacity: [0, 0.7, 0] }}
            transition={{ delay: 0.58, duration: 1.0, ease: [0.22, 1, 0.36, 1], times: [0, 0.15, 1] }} />
          <motion.span style={{ position: 'absolute', top: 2, left: 0, width: 34, height: 34, borderRadius: '50%', background: '#ff6a1a' }}
            initial={{ x: -46, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring, delay: 0.05 }} />
          <motion.span style={{ position: 'absolute', top: 2, left: 28, width: 34, height: 34, borderRadius: '50%', background: '#ffd400', boxShadow: '0 0 0 3px #000' }}
            initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.32 }} />
        </div>
        <motion.span className="display" style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.06em', color: '#f5f5f7', lineHeight: 1, marginTop: -6 }}
          initial={{ opacity: 0, x: -10, filter: 'blur(8px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.72, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          tag
        </motion.span>
      </div>
    </motion.div>
  );
}
