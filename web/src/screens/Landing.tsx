import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { score, tryAutoplay, whenUnlocked } from '../lib/sound';

/**
 * Opening film — "Pin People", 10 seconds, every launch.
 * The players are map pins come alive on a paper campus map.
 *
 *  0.0  A folded paper map drops in and unfolds; a pop-up campus springs up; an ember fuse draws the play zone.
 *  1.4  The runner pin drops in, looks around, hides: under a bin lid, then behind a too-thin lamppost.
 *  3.0  It sneaks across campus clearing tasks; a bar at the top fills.
 *  4.5  Three hunter pins THUNK into the map. A radar ping sweeps the campus and lights the runner up.
 *  5.6  The chase: runner sprints, leaps a building, hunters on its tail, one cuts it off.
 *  7.4  Cornered. It turns: QR on its back. BEEP. It flattens into a sticker and peels off.
 *  8.1  The campus folds back into the map and the map folds away.
 *  8.6  Two pin heads bounce together into the TAG mark. "Hide. Run. Don’t get caught."
 * 10.0  Into the app.
 *
 * Score and sound effects are synthesised in sync (lib/sound.ts → score()). Reduced motion: a 1.2 s title card.
 */
const T = 10;
const W = 400, H = 860;
const INK = '#0b0b0c', BONE = '#ede6da', EMBER = '#d9541e', BRASS = '#c9a227', OXIDE = '#b23a2b', SAGE = '#7fa38a';
const G1 = '#17171a', G2 = '#1f1f23', G3 = '#2a2a2f', G4 = '#34343b';
const tr = (times: number[], ease: any = 'easeInOut') => ({ duration: T, times: times.map((t) => t / T), ease });
const MARKS = [1.4, 1.58, 1.95, 2.2, 2.55, 2.75, 3.05, 3.9, 4.2, 4.55, 5.05, 5.6, 6.55, 7.2, 7.3, 7.4, 7.45, 7.75, 8.0];

/* ---------------- pin characters ---------------- */
const LEGS: [number, number, number, number][] = [[-11, -1, 9, 0], [-3, 0, 3, -1], [9, 0, -11, -1]];
function Legs({ running, shoe }: { running: boolean; shoe: string }) {
  const draw = (l: [number, number, number, number]) => (
    <>
      <polyline points={`-4,-13 ${l[0]},${l[1]}`} stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
      <polyline points={`4,-13 ${l[2]},${l[3]}`} stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx={l[0] + 1.5} cy={l[1]} rx="4" ry="2.4" fill={shoe} stroke={INK} strokeWidth="1.5" />
      <ellipse cx={l[2] + 1.5} cy={l[3]} rx="4" ry="2.4" fill={shoe} stroke={INK} strokeWidth="1.5" />
    </>
  );
  if (!running) return <g>{draw([-5, 0, 5, 0])}</g>;
  return <g>{LEGS.map((l, i) => <g key={i} className="cut-frame" style={{ animationDuration: '0.24s', animationDelay: `${-((3 - i) % 3) * 0.08}s` }}>{draw(l)}</g>)}</g>;
}
const BODY = 'M0 -10 C -5 -17 -17 -28 -17 -40 A17 17 0 1 1 17 -40 C 17 -28 5 -17 0 -10 Z';
function Eyes({ narrow, look }: { narrow?: boolean; look?: { x: number[]; t: number[] } }) {
  return (
    <g>
      {[-5.5, 6].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={-42} rx="4.2" ry={narrow ? 3.2 : 5.2} fill={BONE} stroke={INK} strokeWidth="1.4" />
          <motion.circle cx={cx + 1.4} cy={-41.5} r="2.1" fill={INK} animate={look ? { x: look.x } : undefined} transition={look ? { x: tr(look.t) } : undefined} />
        </g>
      ))}
      {narrow && <path d="M-10 -47.5 L-1.5 -45.5 M2 -45.5 L10.5 -47.5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />}
    </g>
  );
}
function RunnerBody({ back }: { back: boolean }) {
  return (
    <g>
      <path d={BODY} fill={EMBER} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      {back ? (
        <>
          <path d="M-17.5 -40 A17.5 17.5 0 0 1 17.5 -40 L 17 -32 Q 0 -26 -17 -32 Z" fill={OXIDE} stroke={INK} strokeWidth="2" />
          <g transform="translate(-9 -36)">
            <rect x="-1.5" y="-1.5" width="21" height="21" rx="2" fill={BONE} stroke={INK} strokeWidth="1.6" />
            {[[0, 0], [12, 0], [0, 12], [6, 6], [12, 12], [6, 0], [0, 6], [15, 6], [9, 15]].map(([x, y], i) => <rect key={i} x={x} y={y} width={i < 3 ? 6 : 3} height={i < 3 ? 6 : 3} fill={INK} />)}
          </g>
        </>
      ) : (
        <path d="M-17.5 -38 A17.5 17.5 0 0 1 17.5 -38 L 13.5 -35 A13.5 13.5 0 0 0 -13.5 -35 Z" fill={OXIDE} stroke={INK} strokeWidth="2" />
      )}
    </g>
  );
}
function HunterBody() {
  return (
    <g>
      <path d={BODY} fill={BRASS} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M-15 -49 A15 11 0 0 1 15 -49 Z" fill={INK} />
      <rect x="-3" y="-50.5" width="27" height="4.5" rx="2" fill={INK} />
      <circle cx="0" cy="-53" r="2.6" fill={BRASS} stroke={INK} strokeWidth="1" />
      <rect x="11" y="-29" width="14" height="8" rx="2" fill={INK} />
      <rect x="23" y="-30" width="4" height="10" rx="1" fill={BONE} />
    </g>
  );
}

/* ---------------- pop-up campus ---------------- */
const BUILDINGS = [
  { x: 58, y: 330, w: 52, h: 62, c: G3, d: 0.95 },
  { x: 168, y: 296, w: 36, h: 112, c: G4, d: 1.0, clock: true },
  { x: 250, y: 330, w: 66, h: 70, c: G3, d: 1.05 },
  { x: 334, y: 455, w: 40, h: 56, c: G4, d: 1.1 },
  { x: 52, y: 560, w: 58, h: 60, c: G4, d: 1.15 },
  { x: 312, y: 662, w: 58, h: 56, c: G3, d: 1.2 },
];
function Building({ b }: { b: (typeof BUILDINGS)[number] }) {
  const x0 = b.x - b.w / 2, y0 = b.y - b.h;
  const wins: [number, number][] = [];
  for (let yy = y0 + 10; yy < b.y - 14; yy += 15) for (let xx = x0 + 8; xx < x0 + b.w - 10; xx += 13) wins.push([xx, yy]);
  return (
    <motion.g style={{ originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: [0, 0, 1.12, 1, 1, 0] }}
      transition={{ scaleY: tr([0, b.d, b.d + 0.18, b.d + 0.28, 8.0, 8.18], 'easeOut') }}>
      <rect x={x0 + 5} y={y0 + 5} width={b.w} height={b.h} fill="#000" opacity=".55" />
      <rect x={x0} y={y0} width={b.w} height={b.h} fill={b.c} stroke={INK} strokeWidth="2.6" />
      <rect x={x0} y={y0} width={b.w} height="7" fill={G1} stroke={INK} strokeWidth="2.6" />
      {wins.map(([wx, wy], i) => <rect key={i} x={wx} y={wy} width="6" height="7" fill={(i * 7) % 5 === 0 ? BRASS : (i * 3) % 4 === 0 ? BONE : G1} stroke={INK} strokeWidth="1.2" />)}
      {b.clock && <>
        <circle cx={b.x} cy={y0 + 18} r="10" fill={BONE} stroke={INK} strokeWidth="2.2" />
        <motion.line x1={b.x} y1={y0 + 18} x2={b.x} y2={y0 + 11} stroke={EMBER} strokeWidth="2.4" strokeLinecap="round" style={{ originX: 0.5, originY: 1 }} animate={{ rotate: [0, 0, 720] }} transition={{ rotate: tr([0, 1.2, 10], 'linear') }} />
      </>}
    </motion.g>
  );
}
function Panel({ x0, x1, from, to, foldAt, children }: { x0: number; x1: number; from: 'left' | 'right' | 'mid'; to?: number; foldAt: number; children?: React.ReactNode }) {
  const origin = from === 'left' ? 1 : from === 'right' ? 0 : 0.5;
  const open = from === 'left' ? 0.22 : from === 'right' ? 0.44 : 0;
  return (
    <motion.g style={{ originX: origin, originY: 0.5 }} initial={{ scaleX: from === 'mid' ? 1 : 0 }}
      animate={{ scaleX: from === 'mid' ? [1, 1] : [0, 0, 1, 1, 0] }}
      transition={{ scaleX: from === 'mid' ? tr([0, 10]) : tr([0, open, open + 0.24, foldAt, foldAt + 0.18], [0.3, 1.3, 0.6, 1] as any) }}>
      <rect x={x0} y={240} width={x1 - x0} height={460} fill={from === 'mid' ? G2 : G1} stroke={INK} strokeWidth="2" />
      <line x1={x0} y1={240} x2={x0} y2={700} stroke={INK} strokeWidth="2.4" />
      {children}
      {to}
    </motion.g>
  );
}

/* ---------------- the film ---------------- */
export default function Landing({ onDone }: { onDone: () => void }) {
  useTheme('neutral');
  const done = useRef(false);
  const [now, setNow] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    const t0 = performance.now();
    const el = () => (performance.now() - t0) / 1000;
    // try to start the score immediately (installed app on Android); otherwise it joins in sync on the first touch
    tryAutoplay().then((ok) => { if (done.current) return; if (ok) score(el()); else whenUnlocked(() => { const s = el(); if (s < 9.4 && !done.current) score(s); }); });
    if (reduce) { setNow(9); const t = setTimeout(finish, 1200); return () => clearTimeout(t); }
    const ts = MARKS.map((m) => setTimeout(() => setNow(m), m * 1000));
    ts.push(setTimeout(() => haptic.tap(), 4550), setTimeout(() => haptic.big(), 7600), setTimeout(finish, T * 1000));
    return () => ts.forEach(clearTimeout);
  }, []);

  // flips, leg cycles and the back view switch instantly, so they follow a coarse clock
  const runnerFace = now < 1.95 ? 1 : now < 2.55 ? -1 : now < 3.9 ? 1 : now < 5.6 ? -1 : now < 6.0 ? 1 : -1;
  const runnerRun = (now >= 1.95 && now < 2.2) || (now >= 2.55 && now < 2.75) || (now >= 3.05 && now < 4.2) || (now >= 5.6 && now < 7.3);
  const runnerBack = now >= 7.4;
  const huntersRun = now >= 5.6 && now < 7.3;
  const h2Face = now < 6.55 ? 1 : -1;

  // runner path (time → x, y)
  const R = { t: [0, 1.4, 1.58, 1.95, 2.2, 2.55, 2.75, 3.05, 3.3, 3.75, 4.2, 5.6, 6.0, 6.25, 6.45, 6.65, 7.0, 7.3, 7.8, 8.25, 10],
    x: [200, 200, 200, 200, 128, 128, 262, 262, 300, 325, 245, 245, 330, 300, 265, 215, 130, 112, 112, 160, 160],
    y: [-140, -140, 470, 470, 452, 452, 474, 474, 395, 512, 600, 600, 525, 430, 318, 345, 380, 455, 455, 150, 150] };
  const chase = (d: number) => ({ t: [6.0 + d, 6.25 + d, 6.45 + d, 6.65 + d, 7.0 + d], x: [330, 300, 265, 215, 130], y: [525, 430, 318, 345, 380] });
  const H3c = chase(0.3), H2c = chase(0.55);
  const tasks = [{ x: 300, y: 370, a: 3.3, slot: 0 }, { x: 325, y: 488, a: 3.75, slot: 1 }, { x: 245, y: 575, a: 4.2, slot: 2 }];

  return (
    <motion.div style={{ position: 'fixed', inset: 0, background: INK, zIndex: 900, overflow: 'hidden' }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.7, 0, 0.2, 1] } }}>
      {!reduce && (
        <motion.svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden
          animate={{ x: [0, 0, -5, 5, -3, 0, 0], scale: [1.08, 1.08, 1.08, 1.14, 1.14, 1.14, 1.04] }}
          transition={{ x: tr([0, 7.58, 7.62, 7.66, 7.7, 7.75, 10]), scale: tr([0, 5.6, 5.6, 6.2, 7.4, 8.1, 8.5]) }}>
          {/* moon */}
          <motion.g initial={{ opacity: 0, y: 20 }} animate={{ opacity: [0, 0, 1, 1, 0], y: [20, 20, 0, 0, -10] }} transition={{ opacity: tr([0, 0.6, 1.2, 8.1, 8.5]), y: tr([0, 0.6, 1.2, 8.1, 8.5]) }}>
            <circle cx="338" cy="130" r="24" fill={BONE} stroke={INK} strokeWidth="2.6" />
            <circle cx="350" cy="122" r="21" fill={INK} />
            {[[60, 110], [110, 160], [250, 90], [300, 190], [40, 200]].map(([x, y], i) => <motion.circle key={i} cx={x} cy={y} r="1.8" fill={BONE} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.6 + i * 0.3, repeat: Infinity }} />)}
          </motion.g>

          {/* task bar */}
          <motion.g initial={{ opacity: 0, y: -10 }} animate={{ opacity: [0, 0, 1, 1, 0], y: [-10, -10, 0, 0, -10] }} transition={{ opacity: tr([0, 2.95, 3.15, 8.0, 8.2]), y: tr([0, 2.95, 3.15, 8.0, 8.2]) }}>
            <rect x="108" y="186" width="188" height="18" rx="4" fill={G1} stroke={BONE} strokeWidth="2" />
            <motion.rect x="111" y="189" height="12" rx="2" fill={EMBER} initial={{ width: 0 }} animate={{ width: [0, 0, 60, 60, 121, 121, 182] }}
              transition={{ width: tr([0, 3.78, 3.9, 4.23, 4.35, 4.68, 4.8], 'backOut') }} />
            {[0, 1, 2].map((i) => <line key={i} x1={111 + 61 * (i + 1)} y1={189} x2={111 + 61 * (i + 1)} y2={201} stroke={INK} strokeWidth="2" opacity={i < 2 ? 1 : 0} />)}
          </motion.g>

          {/* the map: drops in, unfolds, folds away */}
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ y: -80, opacity: 0, scale: 0.9 }}
            animate={{ y: [-80, 0, 0, 80], opacity: [0, 1, 1, 0], scale: [0.9, 1, 1, 0.8] }} transition={{ y: tr([0, 0.2, 8.48, 8.7]), opacity: tr([0, 0.15, 8.48, 8.7]), scale: tr([0, 0.2, 8.48, 8.7]) }}>
            <rect x="30" y="246" width="352" height="460" fill="#000" opacity=".5" />
            <Panel x0={24} x1={142} from="left" foldAt={8.2}>
              <path d="M24 420 H142 M80 240 V700 M24 610 Q 90 590 142 640" stroke={BONE} strokeWidth="1.6" strokeDasharray="6 6" opacity=".35" fill="none" />
            </Panel>
            <Panel x0={142} x1={258} from="mid" foldAt={8.3}>
              <path d="M142 420 H258 M142 540 H258 M200 240 V700" stroke={BONE} strokeWidth="5" opacity=".14" fill="none" />
              <path d="M142 420 H258 M200 240 V700" stroke={BONE} strokeWidth="1.4" strokeDasharray="5 7" opacity=".4" fill="none" />
            </Panel>
            <Panel x0={258} x1={376} from="right" foldAt={8.3}>
              <path d="M258 420 H376 M310 240 V700 M258 560 Q 320 530 376 580" stroke={BONE} strokeWidth="1.6" strokeDasharray="6 6" opacity=".35" fill="none" />
              <circle cx="340" cy="300" r="20" fill="#1c2420" stroke={INK} strokeWidth="2" />
            </Panel>
          </motion.g>

          {/* play-zone fuse */}
          <motion.ellipse cx="200" cy="470" rx="166" ry="210" fill="none" stroke={EMBER} strokeWidth="3.5" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: [0, 0, 1, 1], opacity: [1, 1, 1, 0] }} transition={{ pathLength: tr([0, 0.55, 1.35, 10], 'easeInOut'), opacity: tr([0, 1.35, 8.05, 8.2]) }} />

          {/* pop-up campus */}
          {BUILDINGS.map((b, i) => <Building key={i} b={b} />)}
          {/* bin with a lid that becomes a disguise */}
          <motion.g style={{ originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: [0, 0, 1, 1, 0] }} transition={{ scaleY: tr([0, 1.1, 1.3, 8.0, 8.15], 'backOut') }}>
            <rect x="116" y="436" width="22" height="22" rx="3" fill={G4} stroke={INK} strokeWidth="2.4" />
          </motion.g>
          <motion.g initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x: [0, 0, 0, 0, 0, 0, 0, 0], y: [0, 0, 0, -64, -64, 6, 0, 0], opacity: [0, 0, 1, 1, 1, 1, 1, 0], rotate: [0, 0, 0, -8, 6, 0, 0, 0] }}
            transition={{ x: tr([0, 1.25, 1.3, 2.28, 2.5, 2.62, 2.7, 8.1]), y: tr([0, 1.25, 1.3, 2.28, 2.5, 2.62, 2.7, 8.1]), opacity: tr([0, 1.25, 1.3, 2.28, 2.5, 2.62, 2.7, 8.1]), rotate: tr([0, 1.25, 1.3, 2.28, 2.5, 2.62, 2.7, 8.1]) }}>
            <rect x="113" y="431" width="28" height="6" rx="2" fill={G3} stroke={INK} strokeWidth="2.2" />
            <rect x="124" y="427" width="6" height="4" rx="1" fill={INK} />
          </motion.g>

          {/* tasks */}
          {tasks.map((k) => {
            const tt = [0, 2.95, 3.12, k.a, k.a + 0.09, k.a + 0.18, k.a + 0.5, 10];
            const bx = 141 + 61 * k.slot;
            return (
              <motion.g key={k.slot} initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 1, 1, 1, 1, 0, 0], x: [k.x, k.x, k.x, k.x, k.x, k.x, bx, bx], y: [k.y, k.y, k.y - 4, k.y, k.y - 6, k.y - 10, 195, 195], scale: [0, 0, 1, 1, 0.1, 1, 0.3, 0.3] }}
                transition={{ opacity: tr(tt), x: tr(tt), y: tr(tt), scale: tr(tt) }}>
                <g>
                  <rect x="-11" y="-14" width="22" height="28" rx="3" fill={BONE} stroke={INK} strokeWidth="2.2" />
                  <path d="M-6 -6 H6 M-6 0 H6 M-6 6 H2" stroke={INK} strokeWidth="2" strokeLinecap="round" />
                  <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1] }} transition={{ opacity: tr([0, k.a + 0.09, k.a + 0.1, 10], 'linear') }}>
                    <rect x="-11" y="-14" width="22" height="28" rx="3" fill={SAGE} stroke={INK} strokeWidth="2.2" />
                    <path d="M-6 0 L-1.5 5 L7 -6" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </motion.g>
                </g>
              </motion.g>
            );
          })}

          {/* radar ping */}
          {[0, 0.3].map((d) => (
            <motion.circle key={d} cx="200" cy="470" fill="none" stroke={BRASS} strokeWidth="3" initial={{ r: 0, opacity: 0 }}
              animate={{ r: [0, 0, 280], opacity: [0, 0.95, 0] }} transition={{ r: tr([0, 5.0 + d, 5.75 + d], 'easeOut'), opacity: tr([0, 5.0 + d, 5.75 + d]) }} />
          ))}

          {/* hunters */}
          {[
            { land: [90, 350], at: 4.55, face: 1, beam: [[0, 4.55, 5.25, 5.4, 7.2, 8.0], [0, 0, 0, 58, 20, 20]], path: { t: [7.2], x: [64], y: [470] } },
            { land: [75, 622], at: 4.75, face: h2Face, beam: [[0, 4.75, 5.25, 5.4, 6.2, 8.0], [0, 0, 0, -7, 0, 0]], path: H2c },
            { land: [338, 662], at: 4.95, face: -1, beam: [[0, 4.95, 5.25, 5.4, 6.0, 7.38, 7.45, 8.0], [0, 0, 0, -32, 0, 0, 16, 16]], path: H3c, lunge: true },
          ].map((h, i) => {
            const base = [0, h.at - 0.25, h.at, h.at + 0.06, 5.6];
            const tt = [...base, ...h.path.t, ...(h.lunge ? [7.42] : []), 7.9, 8.15];
            const xs = [h.land[0], h.land[0], h.land[0], h.land[0], h.land[0], ...h.path.x, ...(h.lunge ? [164] : []), ...(h.lunge ? [164] : [h.path.x[h.path.x.length - 1]]), ...(h.lunge ? [164] : [h.path.x[h.path.x.length - 1]])];
            const ys = [-140, -140, h.land[1], h.land[1], h.land[1], ...h.path.y, ...(h.lunge ? [446] : []), ...(h.lunge ? [446] : [h.path.y[h.path.y.length - 1]]), ...(h.lunge ? [446] : [h.path.y[h.path.y.length - 1]])];
            const op = tt.map((t) => (t >= 8.15 ? 0 : 1));
            const sq = [0, h.at, h.at + 0.06, h.at + 0.16, 10];
            return (
              <motion.g key={i} initial={{ x: h.land[0], y: -140 }} animate={{ x: xs, y: ys, opacity: op }} transition={{ x: tr(tt), y: tr(tt), opacity: tr(tt) }}>
                <g transform="scale(1.4)">
                <ellipse cx="0" cy="1" rx="14" ry="3.6" fill="#000" opacity=".5" />
                <g transform={`scale(${h.face} 1)`}>
                  <g transform="translate(27 -25)">
                    <motion.g style={{ originX: 0, originY: 0.5 }} initial={{ rotate: 0, opacity: 0 }} animate={{ rotate: h.beam[1], opacity: h.beam[0].map((t) => (t >= 5.4 && t < 8.0 ? 1 : 0)) }}
                      transition={{ rotate: tr(h.beam[0]), opacity: tr(h.beam[0], 'linear') }}>
                      <polygon points="0,-4 150,-34 150,34 0,4" fill={BRASS} opacity=".32" />
                      <polygon points="0,-4 150,-34 150,34 0,4" fill="none" stroke={BRASS} strokeWidth="1.5" opacity=".7" />
                    </motion.g>
                  </g>
                  <motion.g style={{ originY: 1 }} animate={{ scaleY: [1, 1, 0.65, 1, 1], scaleX: [1, 1, 1.3, 1, 1] }} transition={{ scaleY: tr(sq, 'easeOut'), scaleX: tr(sq, 'easeOut') }}>
                    <Legs running={huntersRun} shoe={INK} />
                    <HunterBody />
                    <Eyes narrow />
                  </motion.g>
                </g>
                </g>
              </motion.g>
            );
          })}

          {/* the runner */}
          <motion.g initial={{ x: 200, y: -140 }} animate={{ x: R.x, y: R.y, rotate: R.t.map((t) => (t >= 8.25 ? 28 : 0)), opacity: R.t.map((t) => (t >= 8.25 ? 0 : 1)) }}
            transition={{ x: tr(R.t), y: tr(R.t), rotate: tr(R.t), opacity: tr(R.t) }}>
            <g transform="scale(1.4)">
            <motion.ellipse cx="0" cy="1" rx="14" ry="3.6" fill="#000" initial={{ opacity: 0.5 }} animate={{ opacity: [0.5, 0.5, 0, 0.5, 0.5, 0] }} transition={{ opacity: tr([0, 6.35, 6.45, 6.62, 7.75, 7.8]) }} />
            {/* reveal glow + alert */}
            <motion.circle cx="0" cy="-40" r="30" fill="none" stroke={EMBER} strokeWidth="3" initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1, 0.3, 1, 0.3, 1, 0], scale: [1, 1, 1.3, 1, 1.3, 1, 1.3, 1] }} transition={{ opacity: tr([0, 5.05, 5.15, 5.35, 5.55, 5.75, 5.95, 7.3]), scale: tr([0, 5.05, 5.15, 5.35, 5.55, 5.75, 5.95, 7.3]) }} />
            <motion.g initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 0, 1, 1, 0], y: [0, 0, -12, -12, -16], scale: [0.4, 0.4, 1.2, 1, 1] }}
              transition={{ opacity: tr([0, 5.05, 5.15, 5.55, 5.7]), y: tr([0, 5.05, 5.15, 5.55, 5.7], 'backOut'), scale: tr([0, 5.05, 5.15, 5.25, 5.7]) }}>
              <rect x="-4" y="-86" width="8" height="17" rx="3" fill={EMBER} stroke={INK} strokeWidth="2" />
              <circle cx="0" cy="-62" r="4" fill={EMBER} stroke={INK} strokeWidth="2" />
            </motion.g>
            <g transform={`scale(${runnerFace} 1)`}>
              <motion.g style={{ originY: 1 }}
                animate={{ scaleY: [1, 1, 0.62, 1.1, 1, 1, 1, 1, 1, 1, 0.16, 0.16], scaleX: [1, 1, 1.3, 0.9, 1, 1, 0.55, 0.55, 1, 1, 1.5, 1.5] }}
                transition={{ scaleY: tr([0, 1.58, 1.63, 1.72, 1.8, 2.78, 2.86, 3.0, 3.06, 7.72, 7.78, 10], 'easeOut'), scaleX: tr([0, 1.58, 1.63, 1.72, 1.8, 2.78, 2.86, 3.0, 3.06, 7.72, 7.78, 10], 'easeOut') }}>
                <Legs running={runnerRun} shoe={OXIDE} />
                <RunnerBody back={runnerBack} />
                {!runnerBack && <Eyes look={{ x: [0, 0, -3.5, 3.5, -3.5, 0, 0, 2, 2, 0], t: [0, 1.72, 1.78, 1.86, 1.94, 2.0, 2.86, 2.9, 3.0, 10] }} />}
                {/* sticker stamp after the scan */}
                {now >= 7.75 && <rect x="-24" y="-62" width="48" height="66" rx="6" fill="none" stroke={BONE} strokeWidth="3" />}
              </motion.g>
            </g>
            {/* scan line across the QR */}
            <motion.rect x="-14" width="28" height="3" fill={BRASS} initial={{ y: -48, opacity: 0 }} animate={{ y: [-48, -48, -48, -22, -48, -48], opacity: [0, 0, 1, 1, 1, 0] }}
              transition={{ y: tr([0, 7.45, 7.47, 7.58, 7.68, 7.72], 'linear'), opacity: tr([0, 7.45, 7.47, 7.58, 7.68, 7.72], 'linear') }} />
            </g>
          </motion.g>

          {/* lamppost in front of the hiding runner */}
          <motion.g style={{ originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: [0, 0, 1, 1, 0] }} transition={{ scaleY: tr([0, 1.15, 1.35, 8.0, 8.15], 'backOut') }}>
            <rect x="259" y="396" width="6" height="82" fill={INK} />
            <rect x="254" y="476" width="16" height="5" rx="2" fill={INK} />
            <path d="M262 396 h14 v5 h-14z" fill={INK} />
            <circle cx="278" cy="404" r="5.5" fill={BRASS} stroke={INK} strokeWidth="1.8" />
          </motion.g>

          {/* BEEP flash */}
          <motion.rect x="-50" y="-50" width={W + 100} height={H + 100} fill={BRASS} initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.35, 0] }} transition={{ opacity: tr([0, 7.6, 7.62, 7.8], 'linear') }} />
        </motion.svg>
      )}

      {/* the mark: two pin heads bounce together, then the wordmark and line */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: '8vh', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', height: 74 }}>
            {[EMBER, BRASS].map((c, i) => (
              <motion.span key={c} style={{ width: 70, height: 70, borderRadius: '50%', background: c, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}, 0 0 0 2px rgba(237,230,218,.0)`, marginLeft: i ? -6 : 0, zIndex: i ? 1 : 2 }}
                initial={{ opacity: 0, x: i ? 160 : -160, y: -60, scale: 0.6 }}
                animate={reduce || now >= 8.0 ? { opacity: 1, x: 0, y: [-60, 0, -22, 0, -6, 0], scale: [0.6, 1, 1, 1, 1, 1], scaleY: [1, 1, 1, 0.82, 1, 1] } : {}}
                transition={{ delay: reduce ? 0 : 0.45 + i * 0.06, duration: 0.75, x: { delay: reduce ? 0 : 0.45 + i * 0.06, duration: 0.42, ease: [0.3, 1.2, 0.6, 1] }, opacity: { delay: reduce ? 0 : 0.45, duration: 0.15 } }} />
            ))}
          </div>
          <motion.div className="logo-word" initial={{ opacity: 0, y: 26 }} animate={reduce || now >= 8.0 ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduce ? 0.1 : 0.85, type: 'spring', stiffness: 420, damping: 26 }}
            style={{ marginTop: 26, fontSize: 'clamp(84px, 27vw, 120px)', fontWeight: 900, color: BONE, lineHeight: 0.85, paddingRight: 8 }}>tag</motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={reduce || now >= 8.0 ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduce ? 0.2 : 1.1, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
            style={{ marginTop: 22, fontSize: 13, fontWeight: 750, letterSpacing: '0.18em', textTransform: 'uppercase', color: BRASS }}>Hide. Run. Don’t get caught.</motion.div>
        </div>
      </div>

      {/* film progress */}
      <div style={{ position: 'absolute', left: 28, right: 28, bottom: 'calc(env(safe-area-inset-bottom) + 24px)', height: 3, borderRadius: 2, background: 'rgba(237,230,218,.12)', overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: EMBER, transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 1.2 : T, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}
