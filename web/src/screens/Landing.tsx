import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { sfx, whenUnlocked } from '../lib/sound';
import { LogoMark } from '../components/ui';
import { BlocksG, Burst, C, FigureG, INK, useBlocks } from '../components/Brut';

/**
 * Opening film, 10 seconds, every launch. Cut paper, stop-motion runners, hard cuts.
 *
 *  0.0  Shutters: yellow, orange and black blocks slam down. "TONIGHT. ON CAMPUS."
 *  1.3  The street. The city scrolls, a runner sprints in.        "SOMEONE IS RUNNING."
 *  3.4  A hunter with a torch comes in behind and closes the gap.  "SOMEONE IS HUNTING."
 *  6.6  The lunge. The runner leaps. Freeze frame — TAG!
 *  7.6  Colour blocks wipe across; the logo slams in.              "HIDE. RUN. DON'T GET CAUGHT."
 * 10.0  Into the app.
 *
 * With reduced motion the film is a 1.2 s title card.
 */
const W = 400, H = 860, G = 640;
const ease = [0.2, 0.9, 0.25, 1] as const;
const snap = { type: 'spring', stiffness: 520, damping: 30 } as const;
type Act = 0 | 1 | 2 | 3 | 4;

function Sticker({ text, tone }: { text: string; tone: 'run' | 'hunt' | 'plain' }) {
  const bg = tone === 'run' ? C.flare : tone === 'hunt' ? C.police : C.cream;
  return (
    <motion.div key={text} initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: tone === 'hunt' ? 2 : -2, opacity: 1 }} exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      className="display" style={{ background: bg, color: INK, border: `3px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}`, padding: '10px 16px 8px', fontSize: 'clamp(22px, 6.6vw, 30px)', whiteSpace: 'nowrap' }}>
      {text}
    </motion.div>
  );
}

export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const [act, setAct] = useState<Act>(0);
  const [hunter, setHunter] = useState(false);
  const back = useBlocks(11, W * 2, 120, 300), front = useBlocks(23, W * 2, 50, 150);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    const t0 = performance.now();
    whenUnlocked(() => { const s = (performance.now() - t0) / 1000; if (s < 8.5 && !done.current) sfx.intro(s); });
    if (reduce) { setAct(4); const t = setTimeout(finish, 1200); return () => clearTimeout(t); }
    const T = [
      setTimeout(() => setAct(1), 1300),
      setTimeout(() => { setHunter(true); haptic.tap(); }, 3400),
      setTimeout(() => setAct(2), 6600),
      setTimeout(() => { setAct(3); haptic.big(); }, 7050),
      setTimeout(() => setAct(4), 7650),
      setTimeout(finish, 10000),
    ];
    return () => T.forEach(clearTimeout);
  }, []);

  const frozen = act >= 3;
  const play = { animationPlayState: frozen ? 'paused' : 'running' } as const;
  const caption = act === 1 ? (hunter ? 'Someone is hunting.' : 'Someone is running.') : act === 0 ? 'Tonight. On campus.' : null;
  const s = 1.6, footY = G - 102 * s;

  return (
    <motion.div className={frozen ? 'film frozen' : 'film'} style={{ position: 'fixed', inset: 0, background: C.night, zIndex: 900, overflow: 'hidden' }}
      exit={{ y: '-100%', transition: { duration: 0.55, ease: [0.7, 0, 0.2, 1] } }}>

      {/* the street */}
      <motion.div style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0 }} animate={{ opacity: act >= 1 ? 1 : 0 }} transition={{ duration: 0.01 }}>
        <motion.svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden
          animate={hunter && act === 1 ? { x: [0, -2, 2, -1, 0] } : { x: 0 }} transition={{ duration: 0.25, repeat: hunter && act === 1 ? Infinity : 0, repeatDelay: 0.6 }}>
          <rect width={W} height={H} fill={C.flare} />
          {/* sun-moon with a hard shadow */}
          <circle cx="292" cy="250" r="78" fill={INK} transform="translate(8 8)" />
          <circle cx="292" cy="250" r="78" fill={C.cream} stroke={INK} strokeWidth="4" />
          <g className="scroll-slow" style={play}><BlocksG blocks={back} ground={G} palette={['#a61b12', '#c4321c', '#8a1610']} ink={INK} lit={C.police} /></g>
          <g className="scroll-fast" style={play}><BlocksG blocks={front} ground={G} palette={[INK, '#221a16', '#2c211b']} ink={INK} lit={C.police} /></g>
          <rect x="-10" y={G} width={W + 20} height={H - G} fill={INK} />
          <g className="scroll-road" style={play}>{Array.from({ length: 12 }, (_, i) => <rect key={i} x={i * 80} y={G + 46} width="44" height="8" fill={C.police} />)}</g>

          {/* runner: sprints in, then leaps at the lunge */}
          <motion.g initial={{ x: -180 }} animate={act === 0 ? { x: -220 } : act >= 2 ? { x: 236, y: [0, -96, -80] } : { x: 196 }}
            transition={act >= 2 ? { duration: 0.45, ease: 'easeOut' } : { duration: 1.4, ease }}>
            <FigureG role="runner" x={0} y={footY} s={s} fps={12} />
          </motion.g>
          {/* hunter: comes in behind, closes the gap, lunges */}
          {hunter && (
            <motion.g initial={{ x: -260 }} animate={act >= 2 ? { x: 70 } : { x: [-300, -60, -10, 20] }}
              transition={act >= 2 ? { duration: 0.35, ease: [0.5, 0, 0.2, 1] } : { duration: 3.2, times: [0, 0.35, 0.7, 1], ease: 'easeInOut' }}>
              <FigureG role="hunter" x={0} y={footY + 2} s={s} fps={12} />
            </motion.g>
          )}
        </motion.svg>
      </motion.div>

      {/* freeze frame: hard flash + burst */}
      {act === 3 && <motion.div style={{ position: 'absolute', inset: 0, background: C.cream }} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'linear' }} />}
      {act === 3 && <div style={{ position: 'absolute', left: '50%', top: "30%", transform: "translate(-50%, -50%)" }}><Burst size={240} text="TAG!" /></div>}

      {/* shutters at the start */}
      {[C.police, C.flare, INK].map((c, i) => (
        <motion.div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: c, borderBottom: `4px solid ${INK}`, zIndex: 1 + i }}
          initial={{ y: '-101%' }} animate={act === 0 ? { y: '0%' } : { y: '101%' }}
          transition={act === 0 ? { delay: 0.12 * i, duration: 0.42, ease: [0.7, 0, 0.2, 1] } : { delay: 0.06 * (2 - i), duration: 0.5, ease: [0.7, 0, 0.2, 1] }} />
      ))}

      {/* closing wipes and the title card */}
      {[C.police, C.flare, INK].map((c, i) => (
        <motion.div key={`w${i}`} style={{ position: 'absolute', inset: 0, background: c, borderLeft: `4px solid ${INK}`, zIndex: 5 + i }}
          initial={{ x: '101%' }} animate={act >= 4 ? { x: '0%' } : { x: '101%' }} transition={{ delay: 0.1 * i, duration: 0.45, ease: [0.7, 0, 0.2, 1] }} />
      ))}
      {act >= 4 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center', paddingBottom: '10vh' }}>
          <div className="center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.45, ...snap }} style={{ marginBottom: 18 }}><LogoMark size={44} /></motion.div>
            <motion.div className="logo-word" initial={{ y: 60, opacity: 0, scale: 1.3 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.55, ...snap }}
              style={{ fontSize: 'clamp(104px, 34vw, 150px)', fontWeight: 900, color: C.cream, lineHeight: 0.85, textShadow: `7px 7px 0 ${C.flare}`, paddingRight: 10 }}>tag</motion.div>
            <motion.div initial={{ scale: 0.5, opacity: 0, rotate: 6 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} transition={{ delay: 1.0, type: 'spring', stiffness: 500, damping: 20 }}
              className="display" style={{ marginTop: 30, background: C.police, color: INK, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${C.cream}`, padding: '9px 14px 7px', fontSize: 'clamp(17px, 5vw, 21px)', whiteSpace: 'nowrap' }}>
              Hide. Run. Don’t get caught.
            </motion.div>
          </div>
        </div>
      )}

      {/* captions */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: act === 0 ? '44%' : 'calc(env(safe-area-inset-top) + 13%)', display: 'flex', justifyContent: 'center', zIndex: 4, pointerEvents: 'none' }}>
        <AnimatePresence mode="wait">{caption && <Sticker key={caption} text={caption} tone={act === 0 ? 'plain' : hunter ? 'hunt' : 'run'} />}</AnimatePresence>
      </div>

      {/* film progress */}
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 'calc(env(safe-area-inset-bottom) + 22px)', zIndex: 12, height: 12, background: INK, border: `2.5px solid ${C.cream}`, overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: C.flare, transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 1.2 : 10, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}
