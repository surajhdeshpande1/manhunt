import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { scoreCaught, tryAutoplay, whenUnlocked } from '../lib/sound';
import { mulberry32 } from '../lib/rng';
import { Burst } from '../components/Brut';

/**
 * Opening film — "Caught in the act", 10 seconds, every launch.
 *
 *  0.0  Night. A campus wall. The runner rattles a spray can and paints the TAG mark: ember disc, brass disc, drips.
 *  2.1  Steps back, admires it.
 *  2.6  CLICK. A torch beam floods the wall; the runner's shadow is huge on the bricks.
 *  2.7  A sniffer dog skids in and barks. The runner turns. The hunter steps in, whistle in his mouth.
 *  3.3  The can drops. WHISTLE. The runner bolts — side-scrolling chase across campus.
 *  4.4  Runner vaults a bench · the dog leaps it · the hunter scrambles over it.
 *  5.5  Runner slides under a barrier · the hunter's cap gets knocked off by it (BONK).
 *  6.5  Puddle splash. The runner glances back. The hunter closes in.
 *  7.55 The lunge… 7.7 the grab. FREEZE FRAME. "TAG!"
 *  8.4  Colour wipes; the spray-painted mark returns as the logo. “Hide. Run. Don’t get caught.”
 * 10.0  Into the app.
 */
const T = 10;
const W = 400, H = 860, G = 640;
const INK = '#0b0b0c', BONE = '#ede6da', EMBER = '#d9541e', BRASS = '#c9a227', OXIDE = '#b23a2b';
const G1 = '#17171a', G2 = '#1f1f23', G3 = '#2a2a2f', G4 = '#34343b', G5 = '#3e3e46';
const tr = (times: number[], ease: any = 'easeInOut') => ({ duration: T, times: times.map((t) => t / T), ease });
const MARKS = [0.6, 1.4, 2.1, 2.6, 2.7, 2.95, 3.3, 3.35, 4.4, 4.75, 4.85, 4.9, 5.0, 5.25, 5.5, 5.95, 6.1, 6.4, 6.5, 6.9, 7.55, 7.7, 8.4];
const SPEED = 337; // world px per second during the chase (3.4 → 7.7)
const WORLD_END = -SPEED * 4.3;

type Pose = 'stand' | 'spray' | 'run' | 'tuck' | 'slide' | 'reach' | 'sniff';

/* ---------------- characters (feet at 0,0, facing right) ---------------- */
function Limb({ cls, len1, len2, w, fill, end }: { cls: [string, string]; len1: number; len2: number; w: number; fill: string; end: React.ReactNode }) {
  return (
    <g className={`j ${cls[0]}`}>
      <rect x={-w / 2} y={-3} width={w} height={len1 + 3} rx={w / 2} fill={fill} stroke={INK} strokeWidth="2.5" />
      <g transform={`translate(0 ${len1 - 2})`}>
        <g className={`j ${cls[1]}`}>
          <rect x={-(w - 1) / 2} y={-3} width={w - 1} height={len2 + 3} rx={(w - 1) / 2} fill={fill} stroke={INK} strokeWidth="2.5" />
          <g transform={`translate(0 ${len2})`}>{end}</g>
        </g>
      </g>
    </g>
  );
}

function Runner({ pose, look = 'fwd', shadow }: { pose: Pose; look?: 'fwd' | 'back' | 'wide'; shadow?: boolean }) {
  const f = (c: string) => (shadow ? INK : c);
  const run = pose === 'run' || pose === 'tuck';
  const legs = (k: 'A' | 'B', fill: string) => (
    <g transform="translate(0 -54)">
      <g transform={pose === 'tuck' ? `rotate(${k === 'A' ? -70 : -20})` : pose === 'slide' ? `rotate(${k === 'A' ? -78 : -96})` : pose === 'stand' || pose === 'spray' ? `rotate(${k === 'A' ? -6 : 8})` : undefined}>
        <Limb cls={[`leg${k}`, `shin${k}`]} len1={27} len2={25} w={13} fill={f(fill)}
          end={<><ellipse cx="5" cy="1" rx="10" ry="5.5" fill={f(OXIDE)} stroke={INK} strokeWidth="2.5" /><path d="M-4 4 H14" stroke={f(BONE)} strokeWidth="1.6" /></>} />
      </g>
    </g>
  );
  const arm = (k: 'A' | 'B') => (
    <g transform="translate(2 -95)">
      <g transform={pose === 'tuck' ? `rotate(${k === 'A' ? -150 : -110})` : pose === 'slide' ? 'rotate(-160)' : pose === 'stand' ? `rotate(${k === 'A' ? 18 : -14})` : pose === 'spray' && k === 'B' ? 'rotate(20)' : undefined}>
        {pose === 'spray' && k === 'A' ? (
          <g>
            <animateTransform attributeName="transform" type="rotate" values="-112;-138;-122;-112" dur="0.42s" repeatCount="indefinite" />
            <Limb cls={['x', 'x']} len1={22} len2={20} w={11} fill={f(EMBER)} end={<>
              <rect x="-5" y="0" width="10" height="16" rx="2" fill={f(BONE)} stroke={INK} strokeWidth="2" />
              <rect x="-3" y="14" width="6" height="4" fill={f(EMBER)} stroke={INK} strokeWidth="1.5" />
            </>} />
          </g>
        ) : (
          <Limb cls={[`arm${k}`, 'x']} len1={22} len2={20} w={11} fill={f(EMBER)} end={<circle cx="0" cy="2" r="5.5" fill={f(BONE)} stroke={INK} strokeWidth="2.2" />} />
        )}
      </g>
    </g>
  );
  const eyesX = look === 'back' ? 1 : 11;
  return (
    <g className={`cc ${run ? 'run' : ''}`} transform={pose === 'slide' ? 'rotate(-58) translate(0 8)' : undefined}>
      {arm('B')}
      {legs('B', '#1f1f23')}
      <g className="body">
        <path d="M-15 -52 Q-19 -80 -11 -100 Q2 -106 12 -101 Q20 -80 15 -52 Z" fill={f(EMBER)} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M-9 -66 H9" stroke={INK} strokeWidth="2" opacity=".6" />
        <circle cx="3" cy="-114" r="17.5" fill={f(EMBER)} stroke={INK} strokeWidth="2.5" />
        <ellipse cx={look === 'back' ? -5 : 11} cy="-112" rx="9.5" ry="11.5" fill={INK} />
        {!shadow && <>
          <ellipse cx={eyesX - 3} cy="-113" rx={look === 'wide' ? 3 : 2.2} ry={look === 'wide' ? 4.2 : 3.2} fill={BONE} />
          <ellipse cx={eyesX + 4} cy="-113" rx={look === 'wide' ? 3 : 2.2} ry={look === 'wide' ? 4.2 : 3.2} fill={BONE} />
          <path d="M9 -97 L7 -88 M14 -98 L14 -90" stroke={BONE} strokeWidth="1.6" strokeLinecap="round" />
        </>}
      </g>
      {legs('A', '#26262b')}
      {arm('A')}
    </g>
  );
}

function Hunter({ pose, capOff, whistle }: { pose: Pose; capOff?: boolean; whistle?: boolean }) {
  const run = pose === 'run' || pose === 'tuck' || pose === 'reach';
  return (
    <g className={`cc ${run ? 'run' : ''}`} transform="scale(1.12)">
      <g transform="translate(2 -98)"><g transform={pose === 'reach' ? 'rotate(-100)' : pose === 'tuck' ? 'rotate(-140)' : pose === 'stand' ? 'rotate(-75)' : undefined}>
        {pose === 'stand' || pose === 'reach'
          ? <Limb cls={['x', 'x']} len1={23} len2={21} w={12} fill={G5} end={<><circle cx="0" cy="2" r="5.5" fill={BONE} stroke={INK} strokeWidth="2.2" />{pose === 'stand' && <rect x="-4" y="2" width="8" height="18" rx="2" fill={BRASS} stroke={INK} strokeWidth="2" />}</>} />
          : <Limb cls={['armB', 'x']} len1={23} len2={21} w={12} fill={G5} end={<circle cx="0" cy="2" r="5.5" fill={BONE} stroke={INK} strokeWidth="2.2" />} />}
      </g></g>
      <g transform="translate(-1 -55)"><g transform={pose === 'tuck' ? 'rotate(-30)' : pose === 'stand' ? 'rotate(8)' : undefined}>
        <Limb cls={['legB', 'shinB']} len1={28} len2={26} w={14} fill={G2} end={<ellipse cx="5" cy="1" rx="11" ry="5.5" fill={INK} stroke={INK} strokeWidth="2" />} />
      </g></g>
      <g className="body">
        <path d="M-17 -54 Q-22 -84 -13 -104 Q2 -110 14 -104 Q24 -84 17 -54 Z" fill={G5} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M0 -104 V-56" stroke={BRASS} strokeWidth="2.2" />
        <rect x="-15" y="-60" width="32" height="6" fill={INK} />
        <rect x="6" y="-92" width="8" height="9" rx="1.5" fill={BRASS} stroke={INK} strokeWidth="1.5" />
        <circle cx="4" cy="-118" r="16" fill={BONE} stroke={INK} strokeWidth="2.5" />
        <path d="M7 -121 h6 M15 -121 h4" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M6 -109 Q12 -113 19 -109 Q12 -106 6 -109 Z" fill={INK} />
        {whistle && <><rect x="17" y="-111" width="9" height="5" rx="2" fill={BRASS} stroke={INK} strokeWidth="1.4" /><path d="M26 -110 l4 -2" stroke={INK} strokeWidth="1.5" /></>}
        {capOff ? <path d="M-6 -133 q4 -6 8 0 q4 -6 8 0" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" /> : <Cap />}
      </g>
      <g transform="translate(1 -55)"><g transform={pose === 'tuck' ? 'rotate(-75)' : pose === 'stand' ? 'rotate(-6)' : undefined}>
        <Limb cls={['legA', 'shinA']} len1={28} len2={26} w={14} fill="#26262b" end={<ellipse cx="5" cy="1" rx="11" ry="5.5" fill={INK} stroke={INK} strokeWidth="2" />} />
      </g></g>
      <g transform="translate(2 -98)"><g transform={pose === 'reach' ? 'rotate(-95)' : pose === 'tuck' ? 'rotate(-120)' : pose === 'stand' ? 'rotate(14)' : undefined}>
        <Limb cls={[pose === 'run' ? 'armA' : 'x', 'x']} len1={23} len2={21} w={12} fill={G5} end={<circle cx="0" cy="2" r={pose === 'reach' ? 7 : 5.5} fill={BONE} stroke={INK} strokeWidth="2.2" />} />
      </g></g>
    </g>
  );
}
function Cap() {
  return <g><path d="M-12 -126 Q4 -144 20 -126 Z" fill={BRASS} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" /><rect x="-12" y="-128" width="38" height="5" rx="2.5" fill={INK} /><circle cx="4" cy="-133" r="3" fill={BONE} stroke={INK} strokeWidth="1.2" /></g>;
}

function Dog({ pose }: { pose: Pose }) {
  const run = pose === 'run' || pose === 'tuck';
  const leg = (x: number, cls: string, back?: boolean) => (
    <g transform={`translate(${x} -15)`}><g transform={pose === 'tuck' ? `rotate(${back ? 50 : -50})` : undefined}>
      <g className={`j ${cls}`}><rect x="-3.2" y="-2" width="6.4" height="16" rx="3.2" fill={BONE} stroke={INK} strokeWidth="2.2" /></g>
    </g></g>
  );
  return (
    <g className={`cc fast ${run ? 'run' : ''} wag`}>
      {leg(-13, 'legB', true)}{leg(11, 'legA')}
      <g className="body">
        <g transform="translate(-20 -26)"><g className="j tail"><path d="M0 0 Q-10 -8 -8 -20" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" /><path d="M0 0 Q-10 -8 -8 -20" stroke={BONE} strokeWidth="3.5" strokeLinecap="round" fill="none" /></g></g>
        <ellipse cx="0" cy="-23" rx="23" ry="11.5" fill={BONE} stroke={INK} strokeWidth="2.5" />
        <ellipse cx="-6" cy="-27" rx="9" ry="6" fill={OXIDE} opacity=".85" />
        <g transform={pose === 'sniff' ? 'translate(0 8) rotate(14 20 -30)' : undefined}>
          <circle cx="22" cy="-33" r="11" fill={BONE} stroke={INK} strokeWidth="2.5" />
          <ellipse cx="32" cy="-29" rx="8" ry="5.5" fill={BONE} stroke={INK} strokeWidth="2.2" />
          <circle cx="39" cy="-30" r="2.8" fill={INK} />
          <circle cx="24" cy="-36" r="2.2" fill={INK} />
          <path d="M15 -42 Q9 -36 12 -24 Q18 -30 19 -40 Z" fill={INK} />
          <rect x="11" y="-26" width="14" height="4" rx="2" fill={BRASS} stroke={INK} strokeWidth="1.3" />
        </g>
      </g>
      {leg(-8, 'legA', true)}{leg(16, 'legB')}
    </g>
  );
}

/* ---------------- spray-painted TAG mark (wall art + final logo) ---------------- */
function SprayMark({ p0, p1, d0, d1, delay = 0, scale = 1 }: { p0: number; p1: number; d0: number; d1: number; delay?: number; scale?: number }) {
  // p0/p1: when each disc gets sprayed; d0/d1: when its drips run. All in absolute film seconds (delay offsets them).
  const speck = useMemo(() => { const r = mulberry32(5); return Array.from({ length: 26 }, () => ({ a: r() * Math.PI * 2, d: 25 + r() * 12, s: 0.8 + r() * 1.6, k: r() > 0.5 ? 1 : 0 })); }, []);
  const disc = (cx: number, color: string, at: number, drip: number, k: number) => (
    <g>
      <motion.circle cx={cx} cy="0" r="23" fill={color} stroke={INK} strokeWidth="2.5" initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 0, 0.35, 0.7, 1.05, 1], opacity: [0, 0, 1, 1, 1, 1] }} transition={{ ...tr([0, at, at + 0.08, at + 0.25, at + 0.45, at + 0.55].map((x) => x + delay)), ...{ ease: 'easeOut' } }} style={{ originX: `${cx}px`, originY: '0px' }} />
      {speck.filter((s) => s.k === k).map((s, i) => (
        <motion.circle key={i} cx={cx + Math.cos(s.a) * s.d} cy={Math.sin(s.a) * s.d} r={s.s} fill={color} initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1] }} transition={tr([0, at + 0.1 + i * 0.02, at + 0.12 + i * 0.02].map((x) => x + delay), 'linear')} />
      ))}
      {[-9, 4, 13].map((dx, i) => (
        <motion.rect key={dx} x={cx + dx - 2.5} y={14} width="5" rx="2.5" fill={color} initial={{ height: 0 }}
          animate={{ height: [0, 0, 14 + i * 7 + (k ? 4 : 0)] }} transition={tr([0, drip + i * 0.08, drip + 0.4 + i * 0.12].map((x) => x + delay), 'easeOut')} />
      ))}
    </g>
  );
  return <g transform={`scale(${scale})`}>{disc(-24, EMBER, p0, d0, 0)}{disc(23, BRASS, p1, d1, 1)}</g>;
}

/* ---------------- scenery ---------------- */
function Bricks() {
  const rows = [];
  for (let y = 372; y < G; y += 18) for (let x = -60 + ((y / 18) % 2) * 22; x < 560; x += 44) rows.push(<rect key={`${x}-${y}`} x={x} y={y} width="42" height="16" rx="1.5" fill={G3} stroke={G2} strokeWidth="2" />);
  return <g>{rows}</g>;
}
function Lamp({ x }: { x: number }) {
  return <g><rect x={x - 2.5} y={G - 150} width="5" height="150" fill={INK} /><path d={`M${x} ${G - 150} h18 v6 h-18z`} fill={INK} /><circle cx={x + 18} cy={G - 140} r="7" fill={BRASS} stroke={INK} strokeWidth="2" /><ellipse cx={x + 18} cy={G + 4} rx="46" ry="8" fill={BRASS} opacity=".1" /></g>;
}
function Bench({ x }: { x: number }) {
  return <g><rect x={x - 34} y={G - 34} width="68" height="9" rx="2" fill={G5} stroke={INK} strokeWidth="2.5" /><rect x={x - 34} y={G - 52} width="68" height="8" rx="2" fill={G5} stroke={INK} strokeWidth="2.5" />
    <rect x={x - 28} y={G - 26} width="6" height="26" fill={INK} /><rect x={x + 22} y={G - 26} width="6" height="26" fill={INK} /><rect x={x - 30} y={G - 46} width="5" height="14" fill={INK} /><rect x={x + 25} y={G - 46} width="5" height="14" fill={INK} /></g>;
}
function Barrier({ x }: { x: number }) {
  const segs = Array.from({ length: 6 }, (_, i) => <rect key={i} x={x - 100 + i * 20} y={G - 76} width="20" height="10" fill={i % 2 ? BONE : EMBER} />);
  return <g><rect x={x + 18} y={G - 92} width="12" height="92" fill={G4} stroke={INK} strokeWidth="2.5" /><g>{segs}</g><rect x={x - 100} y={G - 76} width="120" height="10" fill="none" stroke={INK} strokeWidth="2.5" /><circle cx={x + 24} cy={G - 71} r="6" fill={BRASS} stroke={INK} strokeWidth="2" /></g>;
}
function Puddle({ x }: { x: number }) {
  return <g><ellipse cx={x} cy={G + 10} rx="46" ry="7" fill="#1d2228" stroke={INK} strokeWidth="2" /><path d={`M${x - 24} ${G + 9} h16 M${x + 6} ${G + 11} h10`} stroke={BONE} strokeWidth="1.6" opacity=".5" /></g>;
}
function Skyline() {
  const r = mulberry32(3); const out = []; let x = -40;
  while (x < 1100) { const w = 50 + r() * 70, h = 120 + r() * 170; out.push(<g key={x}><rect x={x} y={G - h} width={w} height={h} fill={G1} stroke={INK} strokeWidth="2" />{Array.from({ length: Math.floor(h / 34) }, (_, i) => r() > 0.55 && <rect key={i} x={x + 12} y={G - h + 16 + i * 30} width="9" height="11" fill={r() > 0.5 ? BRASS : G3} opacity=".85" />)}</g>); x += w + 10 + r() * 30; }
  return <g>{out}</g>;
}

/* ---------------- the film ---------------- */
export function LandingCaught({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const [now, setNow] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    const t0 = performance.now();
    const el = () => (performance.now() - t0) / 1000;
    tryAutoplay().then((ok) => { if (done.current) return; if (ok) scoreCaught(el()); else whenUnlocked(() => { const s = el(); if (s < 9.4 && !done.current) scoreCaught(s); }); });
    if (reduce) { setNow(9); const t = setTimeout(finish, 1200); return () => clearTimeout(t); }
    const ts = MARKS.map((m) => setTimeout(() => setNow(m), m * 1000));
    ts.push(setTimeout(() => haptic.tap(), 2600), setTimeout(() => haptic.big(), 7700), setTimeout(finish, T * 1000));
    return () => ts.forEach(clearTimeout);
  }, []);

  const frozen = now >= 7.7;
  const chase = now >= 3.35;
  // runner
  const rPose: Pose = now < 0.6 ? 'stand' : now < 2.1 ? 'spray' : now < 3.35 ? 'stand' : now >= 4.4 && now < 4.85 ? 'tuck' : now >= 5.5 && now < 5.95 ? 'slide' : 'run';
  const rFace = now >= 2.95 && now < 3.35 ? -1 : 1;
  const rLook = frozen ? 'wide' : now >= 6.4 && now < 6.9 ? 'back' : now >= 2.6 && now < 2.95 ? 'wide' : 'fwd';
  // dog + hunter
  const dPose: Pose = now < 2.95 ? 'sniff' : now >= 4.75 && now < 5.0 ? 'tuck' : chase ? 'run' : 'stand';
  const hPose: Pose = now < 3.35 ? 'stand' : now >= 7.55 ? 'reach' : now >= 4.9 && now < 5.25 ? 'tuck' : 'run';
  const capOff = now >= 6.1;

  const rX = { t: [0, 3.35, 3.75, 7.7], v: [205, 205, 232, 232] };
  const rY = { t: [0, 4.4, 4.62, 4.85, 5.5, 5.95, 10], v: [G, G, G - 84, G, G + 2, G, G] };
  const dX = { t: [0, 2.7, 2.95, 3.35, 4.0, 6.8, 7.7], v: [-80, -80, 70, 70, 120, 152, 192] };
  const dY = { t: [0, 4.75, 4.88, 5.0, 6.62, 6.72, 6.82, 10], v: [G, G, G - 52, G, G, G - 26, G, G] };
  const hX = { t: [0, 2.95, 3.3, 3.35, 4.0, 6.1, 6.25, 7.0, 7.55, 7.7], v: [-120, -120, 22, 22, 70, 92, 84, 112, 160, 178] };
  const hY = { t: [0, 4.9, 5.07, 5.25, 6.1, 6.16, 6.3, 10], v: [G, G, G - 66, G, G, G + 6, G, G] };

  return (
    <motion.div className={frozen ? 'film-frozen' : ''} style={{ position: 'fixed', inset: 0, background: '#111113', zIndex: 900, overflow: 'hidden' }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.7, 0, 0.2, 1] } }}>
      {!reduce && (
        <motion.svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden
          animate={{ scale: [1.75, 1.75, 1.22, 1.22, 1.45, 1.45, 1.9, 1.9], x: [-70, -70, 56, 56, 64, 64, -10, -10], y: [-170, -170, -100, -100, -150, -150, -230, -230] }}
          transition={{ scale: tr([0, 2.6, 2.95, 3.35, 3.8, 7.7, 7.85, 10], [0.6, 0, 0.3, 1] as any), x: tr([0, 2.6, 2.95, 3.35, 3.8, 7.7, 7.85, 10], [0.6, 0, 0.3, 1] as any), y: tr([0, 2.6, 2.95, 3.35, 3.8, 7.7, 7.85, 10], [0.6, 0, 0.3, 1] as any) }}>
          {/* sky + moon */}
          <rect x="-200" y="-200" width={W + 400} height={H + 400} fill="#111113" />
          <circle cx="332" cy="150" r="26" fill={BONE} stroke={INK} strokeWidth="2.5" /><circle cx="344" cy="142" r="22" fill="#111113" />
          {[[50, 120], [140, 210], [230, 90], [290, 250], [80, 300]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill={BONE} opacity=".7" />)}

          {/* far campus (slow parallax) */}
          <motion.g initial={{ x: 0 }} animate={{ x: [0, 0, WORLD_END * 0.35, WORLD_END * 0.35] }} transition={{ x: tr([0, 3.4, 7.7, 10], 'linear') }}>
            <g transform="translate(0 -40)"><Skyline /></g>
          </motion.g>

          {/* the world (scrolls during the chase) */}
          <motion.g initial={{ x: 0 }} animate={{ x: [0, 0, WORLD_END, WORLD_END] }} transition={{ x: tr([0, 3.4, 7.7, 10], [0.35, 0, 0.75, 1] as any) }}>
            {/* the wall */}
            <rect x="-60" y="360" width="620" height={G - 360} fill={G3} stroke={INK} strokeWidth="3" />
            <Bricks />
            <rect x="-60" y="352" width="620" height="12" fill={G4} stroke={INK} strokeWidth="2.5" />
            <g transform="translate(282 488)"><SprayMark p0={0.72} p1={1.5} d0={1.3} d1={2.05} /></g>
            {/* torch spotlight on the wall + the runner's giant shadow */}
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ opacity: tr([0, 2.58, 2.62, 3.4, 3.6], 'linear') }}>
              <ellipse cx="250" cy="500" rx="130" ry="120" fill={BRASS} opacity=".22" />
              <g transform="translate(300 600) scale(1.75)" opacity=".42"><g transform={`scale(${rFace} 1)`}><Runner pose={now < 2.6 ? 'stand' : rPose} shadow /></g></g>
              <polygon points={`-40,585 120,410 380,600`} fill={BRASS} opacity=".08" />
            </motion.g>
            <Lamp x={30} />
            <Lamp x={560} />
            <Bench x={634} />
            <Lamp x={830} />
            <Barrier x={1005} />
            <Puddle x={1275} />
            <Lamp x={1180} />
            {/* the cap knocked off at the barrier stays behind */}
            {capOff && (
              <motion.g initial={{ x: 0, y: 0, rotate: 0 }} animate={{ x: [0, 40, 60], y: [0, -70, 74], rotate: [0, -200, -340] }} transition={{ duration: 0.75, ease: 'easeOut' }}>
                <g transform={`translate(${1005 - 100 + 20} ${G - 4}) scale(1.12)`}><Cap /></g>
              </motion.g>
            )}
            {/* the dropped can */}
            {now >= 3.3 && (
              <motion.g initial={{ y: 0, rotate: 0 }} animate={{ y: [0, 94, 82, 94], rotate: [0, 90, 120, 180] }} transition={{ duration: 0.4, times: [0, 0.6, 0.8, 1] }}>
                <g transform="translate(244 540)"><rect x="-5" y="0" width="10" height="16" rx="2" fill={BONE} stroke={INK} strokeWidth="2" /></g>
              </motion.g>
            )}
          </motion.g>

          {/* ground */}
          <rect x="-200" y={G} width={W + 400} height={H} fill={G1} />
          <rect x="-200" y={G} width={W + 400} height="5" fill={G4} />
          <motion.g initial={{ x: 0 }} animate={{ x: [0, 0, WORLD_END, WORLD_END] }} transition={{ x: tr([0, 3.4, 7.7, 10], [0.35, 0, 0.75, 1] as any) }}>
            {Array.from({ length: 24 }, (_, i) => <rect key={i} x={-40 + i * 80} y={G + 60} width="40" height="5" fill={G3} />)}
          </motion.g>

          {/* spray mist from the can */}
          {rPose === 'spray' && (
            <g>{Array.from({ length: 7 }, (_, i) => (
              <motion.circle key={i} r="2.4" fill={now < 1.4 ? EMBER : BRASS} initial={{ cx: 240, cy: 524, opacity: 0.9 }}
                animate={{ cx: [240, 258 + i * 4], cy: [524, 492 - (i % 3) * 8], opacity: [0.9, 0] }} transition={{ duration: 0.32, repeat: Infinity, delay: i * 0.045, ease: 'easeOut' }} />
            ))}</g>
          )}

          {/* dog */}
          <motion.g initial={{ x: dX.v[0], y: G }} animate={{ x: dX.v, y: dY.v }} transition={{ x: tr(dX.t), y: { ...tr(dY.t), ease: 'easeOut' } }}>
            <Dog pose={dPose} />
            {now >= 2.75 && now < 3.35 && (
              <motion.g initial={{ scale: 0, y: 0 }} animate={{ scale: [0, 1.25, 1], y: [0, -8, -6] }} transition={{ duration: 0.25 }}>
                <path d="M30 -78 h26 a6 6 0 0 1 6 6 v18 a6 6 0 0 1 -6 6 h-8 l-6 8 l-2 -8 h-10 a6 6 0 0 1 -6 -6 v-18 a6 6 0 0 1 6 -6z" fill={BONE} stroke={INK} strokeWidth="2.5" />
                <rect x="41" y="-72" width="5" height="12" rx="2" fill={OXIDE} /><circle cx="43.5" cy="-55" r="2.8" fill={OXIDE} />
              </motion.g>
            )}
          </motion.g>

          {/* hunter (torch beam while standing) */}
          <motion.g initial={{ x: hX.v[0], y: G }} animate={{ x: hX.v, y: hY.v }} transition={{ x: tr(hX.t), y: { ...tr(hY.t), ease: 'easeOut' } }}>
            {now >= 2.95 && now < 3.35 && <polygon points="28,-104 250,-210 250,-30" fill={BRASS} opacity=".16" />}
            <Hunter pose={hPose} capOff={capOff} whistle={now >= 3.3 && now < 4.2} />
            {now >= 5.25 && now < 5.5 && <text x="-6" y="-170" fontFamily="Archivo Variable, system-ui" fontWeight="900" fontSize="20" fill={BONE}>!!</text>}
          </motion.g>

          {/* runner */}
          <motion.g initial={{ x: rX.v[0], y: G }} animate={{ x: rX.v, y: rY.v }} transition={{ x: tr(rX.t), y: { ...tr(rY.t), ease: 'easeOut' } }}>
            <g transform={`scale(${rFace} 1)`}><Runner pose={rPose} look={rLook as any} /></g>
          </motion.g>

          {/* splash at the puddle */}
          {now >= 6.5 && (
            <g>{[-1, -0.5, 0, 0.5, 1].map((k, i) => (
              <motion.circle key={i} r={3 + (i % 2)} fill="#55606c" stroke={INK} strokeWidth="1.5" initial={{ cx: 232, cy: G + 4, opacity: 1 }}
                animate={{ cx: 232 + k * 34 - 12, cy: [G + 4, G - 30 - (2 - Math.abs(k)) * 14, G + 6], opacity: [1, 1, 0] }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            ))}</g>
          )}

          {/* speed lines during the chase */}
          {chase && !frozen && (
            <g>{[0, 1, 2, 3].map((i) => (
              <motion.rect key={i} y={G - 110 + i * 26} height="3" width="60" fill={BONE} opacity=".3" initial={{ x: 420 }} animate={{ x: -80 }} transition={{ duration: 0.45, repeat: Infinity, delay: i * 0.11, ease: 'linear' }} />
            ))}</g>
          )}

          {/* FREEZE FRAME */}
          {frozen && <>
            <motion.rect x="-200" y="-200" width={W + 400} height={H + 400} fill={BONE} initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            <rect x="-200" y="-200" width={W + 400} height={H + 400} fill="url(#ht)" opacity=".18" />
            <defs><pattern id="ht" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.6" fill={BRASS} /></pattern></defs>
          </>}
        </motion.svg>
      )}

      {/* freeze-frame burst and frame */}
      {frozen && !reduce && now < 8.4 && <>
        <div style={{ position: 'absolute', inset: 10, boxShadow: `0 0 0 3px ${BONE}`, borderRadius: 4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '26%', transform: 'translate(-50%, -50%)' }}><Burst size={230} text="TAG!" fill={BRASS} ink={INK} /></div>
      </>}

      {/* wipes into the logo */}
      {[EMBER, INK].map((c, i) => (
        <motion.div key={c} style={{ position: 'absolute', inset: 0, background: c, zIndex: 2 + i }} initial={{ x: '-101%' }}
          animate={reduce || now >= 8.4 ? { x: '0%' } : {}} transition={{ duration: reduce ? 0 : 0.38, delay: reduce ? 0 : i * 0.08, ease: [0.75, 0, 0.2, 1] }} />
      ))}
      {(reduce || now >= 8.4) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'grid', placeItems: 'center', paddingBottom: '8vh', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg viewBox="-80 -50 160 110" width="200" height="138" style={{ overflow: 'visible' }} aria-hidden>
              <SprayMark p0={reduce ? 0 : 0.2} p1={reduce ? 0 : 0.34} d0={reduce ? 0 : 0.5} d1={reduce ? 0 : 0.6} scale={1.35} />
            </svg>
            <motion.div className="logo-word" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0.1 : 0.5, type: 'spring', stiffness: 380, damping: 26 }}
              style={{ marginTop: 6, fontSize: 'clamp(84px, 27vw, 120px)', fontWeight: 900, color: BONE, lineHeight: 0.85, paddingRight: 8 }}>tag</motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0.2 : 0.8, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
              style={{ marginTop: 22, fontSize: 13, fontWeight: 750, letterSpacing: '0.18em', textTransform: 'uppercase', color: BRASS }}>Hide. Run. Don’t get caught.</motion.div>
          </div>
        </div>
      )}

      {/* film progress */}
      <div style={{ position: 'absolute', left: 28, right: 28, bottom: 'calc(env(safe-area-inset-bottom) + 24px)', height: 3, borderRadius: 2, background: 'rgba(237,230,218,.12)', overflow: 'hidden', zIndex: 6 }}>
        <motion.div style={{ height: '100%', background: EMBER, transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 1.2 : T, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}
