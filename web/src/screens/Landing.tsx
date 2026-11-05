import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { scoreLine, tryAutoplay, whenUnlocked } from '../lib/sound';
import { mulberry32 } from '../lib/rng';

/**
 * Opening film — "One-line chase", 10 seconds, every launch.
 * Everything is drawn by a single ember line; a brass line hunts it.
 *
 *  0.0  A heartbeat trace crosses the dark: two beats.
 *  1.4  The line climbs and sketches a runner in one stroke; the sketch comes alive.
 *  2.6  It runs. The line trailing from its heels draws the campus behind it: blocks, a tree, the clock tower, a lamp.
 *  4.6  A brass line enters with a hunter and a torch. The ember line starts spiking — the runner's heartbeat — faster as it closes in.
 *  6.6  Everything stops. The lunge. The runner leaps. Both figures unravel into their lines, which tangle.
 *  7.5  The knot pulls tight… and pops into two discs: the TAG mark. “Hide. Run. Don’t get caught.”
 * 10.0  Into the app.
 *
 * Music and effects are synthesised in sync (lib/sound.ts → scoreLine()). Reduced motion: a 1.2 s title card.
 */
const T = 10;
const W = 400, H = 860, G = 560, RX = 250;
const INK = '#0b0b0c', BONE = '#ede6da', EMBER = '#d9541e', BRASS = '#c9a227';
const tr = (times: number[], ease: any = 'easeInOut') => ({ duration: T, times: times.map((t) => t / T), ease });
const MARKS = [2.35, 4.6, 4.75, 6.6, 6.85, 7.0, 8.0];

/* ---------- the one-line figure ---------- */
type Frame = { head: [number, number]; limbs: number[][] };
const RUN: Frame[] = [
  { head: [62, 14], limbs: [[59, 26, 49, 56], [57, 30, 72, 38, 84, 28], [57, 30, 42, 41, 34, 54], [49, 56, 66, 74, 62, 100], [49, 56, 36, 79, 18, 86]] },
  { head: [60, 15], limbs: [[58, 27, 51, 57], [56, 31, 64, 44, 58, 56], [56, 31, 46, 42, 44, 54], [51, 57, 58, 79, 54, 100], [51, 57, 45, 79, 41, 100]] },
  { head: [64, 16], limbs: [[61, 27, 46, 55], [59, 31, 76, 36, 86, 24], [59, 31, 44, 44, 40, 58], [46, 55, 68, 66, 76, 100], [46, 55, 30, 74, 8, 86]] },
];
const HUNT: Frame[] = RUN.map((f) => ({ head: f.head, limbs: f.limbs.map((l, i) => (i === 1 ? [l[0], l[1], l[0] + 16, l[1] + 4, l[0] + 30, l[1] + 2] : l)) }));
const OX = -50, OY = -100; // frame space → feet at (0,0)

function FigureLine({ frames, color, running, hunter }: { frames: Frame[]; color: string; running: boolean; hunter?: boolean }) {
  const draw = (f: Frame) => (
    <g transform={`translate(${OX} ${OY})`}>
      <g stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {f.limbs.map((l, i) => <polyline key={i} points={l.join(' ')} />)}
        <circle cx={f.head[0]} cy={f.head[1]} r="10" fill={INK} />
        {hunter && <path d={`M${f.head[0] - 11} ${f.head[1] - 6} H${f.head[0] + 8} M${f.head[0] + 2} ${f.head[1] - 6} H${f.head[0] + 16}`} />}
        {hunter && <rect x={f.limbs[1][4] - 1} y={f.limbs[1][5] - 5} width="10" height="8" rx="1.5" />}
      </g>
    </g>
  );
  if (!running) return draw(frames[0]);
  return <g>{frames.map((f, i) => <g key={i} className="cut-frame" style={{ animationDuration: '0.27s', animationDelay: `${-((3 - i) % 3) * 0.09}s` }}>{draw(f)}</g>)}</g>;
}

/** the runner pose drawn as one continuous stroke (for the sketch moment) */
function sketchPath() {
  const f = RUN[0]; const p = (x: number, y: number) => `${(x + OX + RX).toFixed(1)} ${(y + OY + G).toFixed(1)}`;
  const [, a1, a2, l1, l2] = f.limbs;
  return [
    `M${p(l1[4], l1[5])}`, `L${p(l1[2], l1[3])}`, `L${p(l1[0], l1[1])}`, `L${p(l2[2], l2[3])}`, `L${p(l2[4], l2[5])}`, `L${p(l2[2], l2[3])}`, `L${p(l2[0], l2[1])}`,
    `L${p(59, 26)}`, `L${p(a1[2], a1[3])}`, `L${p(a1[4], a1[5])}`, `L${p(a1[2], a1[3])}`, `L${p(57, 30)}`, `L${p(a2[2], a2[3])}`, `L${p(a2[4], a2[5])}`, `L${p(a2[2], a2[3])}`, `L${p(59, 26)}`,
    `L${p(61, 24)}`, `A10 10 0 1 1 ${p(61.1, 24)}`,
  ].join(' ');
}

/** the campus the trailing line draws, in world x from RX onward, plus the runner's heartbeat spikes */
function skylinePath() {
  const g = G; let d = `M${RX - 12} ${g}`;
  const h = (x: number) => { d += ` H${x}`; };
  const box = (x: number, w: number, ht: number, extra?: (x: number, top: number) => string) => {
    h(x); d += ` V${g - ht} H${x + w}`; if (extra) d += extra(x, g - ht); d += ` V${g}`;
  };
  const spike = (x: number, a = 1) => { h(x); d += ` L${x + 5} ${g - 34 * a} L${x + 11} ${g + 30 * a} L${x + 16} ${g - 12 * a} L${x + 20} ${g}`; };
  box(300, 74, 92, (x, top) => ` M${x + 14} ${top + 18} h12 v12 h-12 z M${x + 46} ${top + 18} h12 v12 h-12 z M${x + 74} ${top}`);
  h(410); d += ` V${g - 26} A16 16 0 1 1 ${410.1} ${g - 26} V${g}`; // tree
  box(468, 34, 176, (x, top) => ` H${x + 34} M${x + 17} ${top + 26} m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M${x + 17} ${top + 26} V${top + 18} M${x + 34} ${top}`);
  box(560, 104, 70, (x, top) => ` M${x + 18} ${top + 20} h14 v12 h-14 z M${x + 46} ${top + 20} h14 v12 h-14 z M${x + 74} ${top + 20} h14 v12 h-14 z M${x + 104} ${top}`);
  h(726); d += ` V${g - 92} h16 m0 0 a5 5 0 1 1 0.1 0 M726 ${g - 92} V${g}`; // lamp
  box(770, 60, 116, (x, top) => ` M${x + 14} ${top + 22} h12 v12 h-12 z M${x + 34} ${top + 22} h12 v12 h-12 z M${x + 14} ${top + 50} h12 v12 h-12 z M${x + 34} ${top + 50} h12 v12 h-12 z M${x + 60} ${top}`);
  // the heartbeat gets faster as the hunter closes in (world x = RX + 250·(t − 2.6))
  [5.0, 5.4, 5.8, 6.0, 6.2, 6.35, 6.5].forEach((t, i) => spike(RX + 250 * (t - 2.6) - 6, 0.8 + i * 0.07));
  h(RX + 1100);
  return d;
}
const ECG = `M-10 ${G} H60 L68 ${G} L74 ${G - 40} L80 ${G + 38} L86 ${G - 12} L92 ${G} H150 L158 ${G} L164 ${G - 46} L170 ${G + 44} L176 ${G - 14} L182 ${G} H${RX - 12}`;

function scribble(seed: number, sx: number, sy: number, cx: number, cy: number) {
  const r = mulberry32(seed); let d = `M${sx} ${sy}`;
  for (let i = 0; i < 16; i++) {
    const a = i * 1.15 + r() * 0.8, rad = 70 - i * 3.2 + r() * 14;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.8;
    const qx = cx + Math.cos(a - 0.6) * (rad + 24), qy = cy + Math.sin(a - 0.6) * (rad + 24) * 0.8;
    d += ` Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const [now, setNow] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  const paths = useMemo(() => ({ sketch: sketchPath(), sky: skylinePath(), knotA: scribble(7, 296, 480, 236, 470), knotB: scribble(19, 222, 490, 236, 470) }), []);

  useEffect(() => {
    const t0 = performance.now();
    const el = () => (performance.now() - t0) / 1000;
    tryAutoplay().then((ok) => { if (done.current) return; if (ok) scoreLine(el()); else whenUnlocked(() => { const s = el(); if (s < 9.4 && !done.current) scoreLine(s); }); });
    if (reduce) { setNow(9); const t = setTimeout(finish, 1200); return () => clearTimeout(t); }
    const ts = MARKS.map((m) => setTimeout(() => setNow(m), m * 1000));
    ts.push(setTimeout(() => haptic.tap(), 4600), setTimeout(() => haptic.big(), 8070), setTimeout(finish, T * 1000));
    return () => ts.forEach(clearTimeout);
  }, []);

  const running = now >= 2.35 && now < 6.6;
  const hunterRun = now >= 4.6 && now < 6.6;
  const showLogo = reduce || now >= 8.0;
  const hx = { t: [0, 4.6, 5.4, 6.2, 6.6, 6.85, 7.0, 10], v: [-70, -70, 70, 140, 172, 172, 222, 222] };

  return (
    <motion.div style={{ position: 'fixed', inset: 0, background: INK, zIndex: 900, overflow: 'hidden' }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.7, 0, 0.2, 1] } }}>
      {!reduce && (
        <motion.svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden
          animate={{ x: [0, 0, -6, 6, -5, 4, -2, 0, 0] }} transition={{ x: tr([0, 7.0, 7.06, 7.12, 7.18, 7.24, 7.32, 7.4, 10], 'linear') }}>
          <defs>
            <clipPath id="tagReveal"><rect x="-200" y="0" width={RX + 200} height={H} /></clipPath>
            <clipPath id="tagTrail"><motion.rect x="-200" y="0" height={H} initial={{ width: 0 }} animate={{ width: hx.v.map((v) => v + 200) }} transition={{ width: tr(hx.t) }} /></clipPath>
          </defs>

          {/* the world: heartbeat trace + the campus the line draws, scrolling as the runner runs */}
          <motion.g initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ opacity: tr([0, 7.4, 7.9]) }}>
            <g clipPath="url(#tagReveal)">
              <motion.g initial={{ x: 0 }} animate={{ x: [0, 0, -1000, -1000] }} transition={{ x: tr([0, 2.6, 6.6, 10], 'linear') }}>
                <motion.path d={ECG} fill="none" stroke={EMBER} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: [0, 0, 1, 1] }} transition={{ pathLength: tr([0, 0.1, 1.3, 10], 'linear') }} />
                <motion.path d={paths.sky} fill="none" stroke={EMBER} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1] }} transition={{ opacity: tr([0, 1.28, 1.3, 10], 'linear') }} />
              </motion.g>
            </g>
            {/* the hunter's brass trail along the ground */}
            <g clipPath="url(#tagTrail)">
              <line x1="-200" y1={G + 9} x2={W + 200} y2={G + 9} stroke={BRASS} strokeWidth="3.5" strokeLinecap="round" />
            </g>
          </motion.g>

          {/* the sketch: one stroke draws the runner, then it comes alive */}
          <motion.path d={paths.sketch} fill="none" stroke={EMBER} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 0, 1, 1], opacity: [0, 0, 1, 1, 0] }}
            transition={{ pathLength: tr([0, 1.35, 2.25, 10], 'easeInOut'), opacity: tr([0, 1.34, 1.36, 2.3, 2.36], 'linear') }} />

          {/* runner */}
          {(
            <motion.g initial={{ x: RX, y: G, opacity: 0 }}
              animate={{ x: [RX, RX, RX, RX, RX + 46, RX + 46], y: [G, G, G, G, G - 78, G - 70], opacity: [0, 0, 1, 1, 1, 0] }}
              transition={{ x: tr([0, 2.3, 2.36, 6.85, 7.05, 7.15]), y: tr([0, 2.3, 2.36, 6.85, 7.05, 7.15], 'easeOut'), opacity: tr([0, 2.3, 2.36, 6.85, 7.05, 7.15], 'linear') }}>
              <motion.g animate={running ? { y: [0, -5, 0] } : { y: 0 }} transition={{ duration: 0.27, repeat: running ? Infinity : 0, ease: 'easeInOut' }}>
                <FigureLine frames={RUN} color={EMBER} running={running} />
              </motion.g>
            </motion.g>
          )}

          {/* hunter */}
          <motion.g initial={{ x: hx.v[0], y: G, opacity: 1 }} animate={{ x: hx.v, opacity: hx.t.map((t) => (t >= 7.0 ? 0 : 1)) }}
            transition={{ x: tr(hx.t), opacity: tr(hx.t.map((t, i) => (i === 6 ? 7.15 : t))) }}>
            <motion.g animate={hunterRun ? { y: [0, -4, 0] } : { y: 0 }} transition={{ duration: 0.3, repeat: hunterRun ? Infinity : 0, ease: 'easeInOut' }}>
              {now >= 4.75 && (
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.75, 1] }} transition={{ duration: 0.3 }}>
                  <polygon points="40,-70 200,-118 200,-14" fill={BRASS} opacity=".1" />
                  <polyline points="200,-118 40,-70 200,-14" fill="none" stroke={BRASS} strokeWidth="2" strokeLinejoin="round" opacity=".75" />
                </motion.g>
              )}
              <FigureLine frames={HUNT} color={BRASS} running={hunterRun} hunter />
            </motion.g>
          </motion.g>

          {/* the tangle, then the knot pulls tight */}
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scale: 1, rotate: 0, opacity: 0, x: 0, y: 0 }}
            animate={{ scale: [1, 1, 1, 0.12], rotate: [0, 0, 0, 200], x: [0, 0, 0, -36], y: [0, 0, 0, -70], opacity: [0, 0, 1, 1, 0] }}
            transition={{ scale: tr([0, 7.0, 7.48, 8.05], [0.7, 0, 0.9, 0.4] as any), rotate: tr([0, 7.0, 7.48, 8.05], [0.7, 0, 0.9, 0.4] as any), x: tr([0, 7.0, 7.48, 8.05], [0.7, 0, 0.9, 0.4] as any), y: tr([0, 7.0, 7.48, 8.05], [0.7, 0, 0.9, 0.4] as any), opacity: tr([0, 6.98, 7.0, 7.95, 8.06], 'linear') }}>
            <motion.path d={paths.knotA} fill="none" stroke={EMBER} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: [0, 0, 1, 1] }} transition={{ pathLength: tr([0, 7.0, 7.42, 10], 'easeOut') }} />
            <motion.path d={paths.knotB} fill="none" stroke={BRASS} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: [0, 0, 1, 1] }} transition={{ pathLength: tr([0, 7.04, 7.46, 10], 'easeOut') }} />
          </motion.g>

          {/* the snap: a bone flash ring */}
          <motion.circle cx="200" cy="400" fill="none" stroke={BONE} strokeWidth="2" initial={{ r: 0, opacity: 0 }}
            animate={{ r: [0, 0, 180], opacity: [0, 0.9, 0] }} transition={{ r: tr([0, 8.05, 8.7], 'easeOut'), opacity: tr([0, 8.05, 8.7]) }} />
        </motion.svg>
      )}

      {/* the mark, the name, the line */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: '7vh', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', height: 74 }}>
            {[EMBER, BRASS].map((c, i) => (
              <motion.span key={c} style={{ width: 66, height: 66, borderRadius: '50%', background: c, marginLeft: i ? -4 : 0, boxShadow: `0 0 0 3px ${INK}` }}
                initial={{ opacity: 0, scale: 0, x: i ? -30 : 30 }}
                animate={showLogo ? { opacity: 1, scale: [0, 1.25, 0.92, 1], x: 0 } : {}}
                transition={{ delay: reduce ? 0 : 0.07 + i * 0.08, duration: 0.55, ease: [0.3, 1.3, 0.6, 1], opacity: { delay: reduce ? 0 : 0.07, duration: 0.05 } }} />
            ))}
          </div>
          <motion.div className="logo-word" initial={{ opacity: 0, y: 24 }} animate={showLogo ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduce ? 0.1 : 0.45, type: 'spring', stiffness: 380, damping: 26 }}
            style={{ marginTop: 24, fontSize: 'clamp(84px, 27vw, 120px)', fontWeight: 900, color: BONE, lineHeight: 0.85, paddingRight: 8 }}>tag</motion.div>
          <motion.svg width="190" height="10" viewBox="0 0 190 10" style={{ marginTop: 18, overflow: 'visible' }} aria-hidden>
            <motion.path d="M2 5 H70 L76 5 L80 0 L85 10 L89 3 L92 5 H188" fill="none" stroke={EMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }} animate={showLogo ? { pathLength: 1, opacity: 1 } : {}} transition={{ delay: reduce ? 0.15 : 0.75, duration: 0.7, ease: 'easeInOut', opacity: { delay: reduce ? 0.15 : 0.75, duration: 0.01 } }} />
          </motion.svg>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={showLogo ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduce ? 0.2 : 0.95, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
            style={{ marginTop: 14, fontSize: 13, fontWeight: 750, letterSpacing: '0.18em', textTransform: 'uppercase', color: BRASS }}>Hide. Run. Don’t get caught.</motion.div>
        </div>
      </div>

      {/* film progress */}
      <div style={{ position: 'absolute', left: 28, right: 28, bottom: 'calc(env(safe-area-inset-bottom) + 24px)', height: 3, borderRadius: 2, background: 'rgba(237,230,218,.12)', overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: EMBER, transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 1.2 : T, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}
