import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { scoreSurround, tryAutoplay, whenUnlocked } from '../lib/sound';

/**
 * Opening film — "Surrounded", 10 seconds, every launch. Overhead, spacious, then all adrenaline.
 *
 *  0.0  Darkness. An ember pulse with a heartbeat — it is the runner's hood, seen from above.
 *  1.0  The camera rises: a lone runner in a vast, empty plaza inside the glowing play zone.
 *  1.35 Four torches click on at the edges, one by one.
 *  2.2  The hunters walk in from four sides, beams sweeping. The runner turns, looking for a way out. Heartbeat quickens.
 *  4.4  Every beam locks on. One breath of silence.
 *  4.6  BREAK. The runner bursts through the gap; two hunters lunge and crash into each other. Drums drop.
 *  5.0  Sprint across the plaza, an ember light trail behind, the camera tracking; all four hunters regroup and give chase.
 *  7.65 Cornered against the edge of the zone. The beams converge — a brass flash —
 *  8.3  the TAG mark. “Hide. Run. Don’t get caught.”
 * 10.0  Into the app.
 */
const T = 10;
const INK = '#0b0b0c', BONE = '#ede6da', EMBER = '#d9541e', BRASS = '#c9a227', OXIDE = '#b23a2b';
const G1 = '#17171a', G2 = '#1f1f23', G5 = '#3e3e46';
const tr = (times: number[], ease: any = 'easeInOut') => ({ duration: T, times: times.map((t) => t / T), ease });
const MARKS = [1.0, 1.35, 1.55, 1.75, 1.95, 2.2, 4.4, 4.6, 4.95, 5.0, 5.6, 7.65, 8.0, 8.3];

type K = { t: number[]; x: number[]; y: number[]; a: number[]; at?: number[] };
// N, E, S, W
const HUNTERS: (K & { beam: number; dizzy?: boolean })[] = [
  { beam: 1.35, t: [0, 1.0, 2.2, 4.4, 4.6, 5.6, 6.4, 7.0, 7.65, 10], x: [0, 0, 0, 0, 0, 120, 130, 60, -70, -70], y: [-330, -330, -330, -125, -125, -150, -240, -250, -300, -300],
    at: [0, 2.2, 2.8, 3.4, 4.0, 4.4, 4.6, 5.3, 6.0, 6.8, 7.65, 10], a: [180, 180, 160, 200, 170, 180, 140, 100, 20, -90, -105, -105] },
  { beam: 1.55, dizzy: true, t: [0, 2.2, 4.4, 4.6, 4.95, 5.6, 6.6, 7.65, 10], x: [175, 175, 112, 112, 72, 72, 150, -110, -110], y: [0, 0, 0, 0, 58, 58, -60, -275, -275],
    at: [0, 2.2, 2.9, 3.6, 4.4, 4.6, 4.95, 5.6, 6.1, 7.0, 7.65, 10], a: [-90, -90, -110, -70, -90, -130, -130, -40, -10, -60, -70, -70] },
  { beam: 1.75, dizzy: true, t: [0, 2.2, 4.4, 4.6, 4.95, 5.6, 6.8, 7.65, 10], x: [0, 0, 0, 0, 58, 58, 60, -175, -175], y: [330, 330, 125, 125, 72, 72, -80, -270, -270],
    at: [0, 2.2, 3.0, 3.7, 4.4, 4.6, 4.95, 5.6, 6.2, 7.2, 7.65, 10], a: [0, 0, 20, -20, 0, 40, 40, 80, 0, -30, 20, 20] },
  { beam: 1.95, t: [0, 2.2, 4.4, 4.6, 5.8, 7.0, 7.65, 10], x: [-175, -175, -112, -112, -180, -230, -230, -230], y: [0, 0, 0, 0, -120, -240, -310, -310],
    at: [0, 2.2, 2.7, 3.3, 3.9, 4.4, 4.6, 5.8, 7.0, 7.65, 10], a: [90, 90, 110, 70, 100, 90, 70, 20, 10, 60, 60] },
];

/* ---- smooth motion: Catmull-Rom through timed waypoints, sampled 25×/s, heading from velocity ---- */
const DT = 0.04;
type Track = { t: number[]; x: number[]; y: number[]; a: number[] };
function track(pts: [number, number, number][], end = T): Track {
  const at = (time: number) => {
    if (time <= pts[0][0]) return [pts[0][1], pts[0][2]];
    if (time >= pts[pts.length - 1][0]) return [pts[pts.length - 1][1], pts[pts.length - 1][2]];
    let i = 0; while (pts[i + 1][0] < time) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const u = (time - p1[0]) / (p2[0] - p1[0]), u2 = u * u, u3 = u2 * u;
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
    return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
  };
  const out: Track = { t: [], x: [], y: [], a: [] }; let last = 0;
  for (let s = 0; s <= end + 1e-6; s += DT) {
    const [x, y] = at(s), [x2, y2] = at(s + 0.06);
    let a = Math.hypot(x2 - x, y2 - y) > 0.8 ? (Math.atan2(x2 - x, -(y2 - y)) * 180) / Math.PI : last;
    while (a - last > 180) a -= 360; while (a - last < -180) a += 360;
    last = a; out.t.push(s / T); out.x.push(x); out.y.push(y); out.a.push(a);
  }
  return out;
}
const lin = (tr2: Track) => ({ duration: T, times: tr2.t, ease: 'linear' as const });
// runner: still until 4.6, then the break and the sprint
const RT = track([[0, 0, 0], [4.6, 0, 0], [4.8, 40, 40], [5.05, 110, 120], [5.35, 200, 150], [5.75, 270, 50], [6.2, 250, -110], [6.6, 180, -215], [7.0, 40, -300], [7.35, -80, -345], [7.65, -150, -365], [10, -150, -365]]);
// the runner's head-turns while surrounded override the heading before 4.6
const RLOOK = { t: [0, 2.2, 2.5, 2.9, 3.4, 3.9, 4.4, 4.6], a: [0, 0, -50, 40, -20, 120, 135, 135] };
const runnerAngle = RT.a.map((a, i) => {
  const s = RT.t[i] * T;
  if (s <= 4.6) { let k = 0; while (k < RLOOK.t.length - 1 && RLOOK.t[k + 1] <= s) k++; const k2 = Math.min(k + 1, RLOOK.t.length - 1); const u = RLOOK.t[k2] === RLOOK.t[k] ? 0 : (s - RLOOK.t[k]) / (RLOOK.t[k2] - RLOOK.t[k]); const e = u * u * (3 - 2 * u); return RLOOK.a[k] + (RLOOK.a[k2] - RLOOK.a[k]) * e; }
  if (s >= 7.65) { const u = Math.min(1, (s - 7.65) / 0.25); return a + (-175 - a) * u * u * (3 - 2 * u); }
  return a;
});
// camera follows a lagged runner and zooms on its own schedule
const CAMS = { t: [0, 1.0, 2.1, 4.4, 4.6, 5.0, 5.8, 6.6, 7.3, 7.65, 8.05, 10], s: [3.4, 3.4, 1.0, 1.32, 1.32, 1.4, 1.3, 1.24, 1.3, 1.55, 2.3, 2.3] };
const camScale = (s: number) => { let k = 0; while (k < CAMS.t.length - 2 && CAMS.t[k + 1] <= s) k++; const u = Math.min(1, Math.max(0, (s - CAMS.t[k]) / (CAMS.t[k + 1] - CAMS.t[k]))); const e = u * u * (3 - 2 * u); return CAMS.s[k] + (CAMS.s[k + 1] - CAMS.s[k]) * e; };
const CAMT = (() => {
  const s: number[] = [], x: number[] = [], y: number[] = [];
  RT.t.forEach((tt, i) => {
    const sec = tt * T; let n = 0, px = 0, py = 0;
    for (let j = i; j >= 0 && (i - j) * DT <= 0.35; j--) { px += RT.x[j]; py += RT.y[j]; n++; }
    const sc = camScale(sec); s.push(sc); x.push(-sc * (px / n)); y.push(-sc * (py / n));
  });
  return { s, x, y };
})();
// trail = the runner's own path from 4.6 on, revealed exactly as it moves
const TI0 = RT.t.findIndex((v) => v * T >= 4.6), TI1 = RT.t.findIndex((v) => v * T >= 7.65);
const TRAILPTS = RT.x.slice(TI0, TI1 + 1).map((x, i) => [x, RT.y[TI0 + i]]);
const TRAIL = 'M' + TRAILPTS.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
const TRAILLEN = (() => { const c = [0]; for (let i = 1; i < TRAILPTS.length; i++) c.push(c[i - 1] + Math.hypot(TRAILPTS[i][0] - TRAILPTS[i - 1][0], TRAILPTS[i][1] - TRAILPTS[i - 1][1])); return c.map((v) => v / c[c.length - 1]); })();

const interp = (ts: number[], vs: number[], s: number) => { let k = 0; while (k < ts.length - 2 && ts[k + 1] <= s) k++; const u = Math.min(1, Math.max(0, (s - ts[k]) / (ts[k + 1] - ts[k]))); const e = u * u * (3 - 2 * u); return vs[k] + (vs[k + 1] - vs[k]) * e; };
const HT = HUNTERS.map((h) => {
  const tk = track(h.t.map((tt, i) => [tt, h.x[i], h.y[i]] as [number, number, number]));
  const a = tk.a.map((va, i) => {
    const s = tk.t[i] * T;
    if (s < 4.6) return interp(h.at!, h.a, s);
    if (s >= 7.65) { const fa = (Math.atan2(-150 - tk.x[i], -(-365 - tk.y[i])) * 180) / Math.PI; let d = fa - va; while (d > 180) d -= 360; while (d < -180) d += 360; return va + d * Math.min(1, (s - 7.65) / 0.2); }
    return va;
  });
  // keep the rotation continuous where the look phase hands over to the run heading
  for (let i = 1; i < a.length; i++) { while (a[i] - a[i - 1] > 180) a[i] -= 360; while (a[i] - a[i - 1] < -180) a[i] += 360; }
  return { ...tk, a };
});

/* ---------------- top-down characters, facing up, centred on (0,0) ---------------- */
const Pivot = () => <circle r="340" fill="none" stroke="none" />; // keeps the group's box centred so rotation pivots on the figure
function RunnerTD({ mode }: { mode: 'stand' | 'run' }) {
  return (
    <g className={`td ${mode}`}>
      <g className="ftL"><ellipse cx="-6" cy="0" rx="4.2" ry="7" fill={OXIDE} stroke={INK} strokeWidth="2" /></g>
      <g className="ftR"><ellipse cx="6" cy="0" rx="4.2" ry="7" fill={OXIDE} stroke={INK} strokeWidth="2" /></g>
      <g className="armL"><ellipse cx="-17" cy="0" rx="5" ry="8.5" fill={EMBER} stroke={INK} strokeWidth="2" /><circle cx="-17" cy="-8" r="3.6" fill={BONE} stroke={INK} strokeWidth="1.5" /></g>
      <g className="armR"><ellipse cx="17" cy="0" rx="5" ry="8.5" fill={EMBER} stroke={INK} strokeWidth="2" /><circle cx="17" cy="-8" r="3.6" fill={BONE} stroke={INK} strokeWidth="1.5" /></g>
      <ellipse cx="0" cy="0" rx="15.5" ry="10.5" fill={EMBER} stroke={INK} strokeWidth="2.5" />
      <circle cx="0" cy="1" r="10.5" fill="#c24a19" stroke={INK} strokeWidth="2.2" />
      <ellipse cx="0" cy="-6" rx="5.5" ry="3.4" fill={INK} />
    </g>
  );
}
function HunterTD({ mode, beam }: { mode: 'stand' | 'walk' | 'run' | 'dizzy'; beam: boolean }) {
  return (
    <g>
      {beam && <g>
        <polygon points="13,-36 -82,-330 108,-330" fill={BRASS} opacity=".12" />
        <polyline points="-82,-330 13,-36 108,-330" fill="none" stroke={BRASS} strokeWidth="1.6" opacity=".55" strokeLinejoin="round" />
      </g>}
      <g className={`td ${mode === 'dizzy' ? 'dizzy' : mode}`}>
        <g className="ftL"><ellipse cx="-7" cy="0" rx="4.6" ry="7.5" fill={INK} stroke={INK} strokeWidth="2" /></g>
        <g className="ftR"><ellipse cx="7" cy="0" rx="4.6" ry="7.5" fill={INK} stroke={INK} strokeWidth="2" /></g>
        <g className="armL"><ellipse cx="-19" cy="0" rx="5.5" ry="9" fill={G5} stroke={INK} strokeWidth="2" /></g>
        <rect x="9" y="-24" width="9" height="24" rx="4.5" fill={G5} stroke={INK} strokeWidth="2" />
        <rect x="9.5" y="-36" width="7" height="12" rx="1.5" fill={BRASS} stroke={INK} strokeWidth="1.8" />
        <ellipse cx="0" cy="0" rx="17.5" ry="11" fill={G5} stroke={INK} strokeWidth="2.5" />
        <circle cx="0" cy="1" r="11" fill={BRASS} stroke={INK} strokeWidth="2.2" />
        <rect x="-8.5" y="-15" width="17" height="6" rx="3" fill={INK} />
        <circle cx="0" cy="2" r="2.6" fill={BONE} />
      </g>
    </g>
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
    tryAutoplay().then((ok) => { if (done.current) return; if (ok) scoreSurround(el()); else whenUnlocked(() => { const s = el(); if (s < 9.4 && !done.current) scoreSurround(s); }); });
    if (reduce) { setNow(9); const t = setTimeout(finish, 1200); return () => clearTimeout(t); }
    const ts = MARKS.map((m) => setTimeout(() => setNow(m), m * 1000));
    ts.push(setTimeout(() => haptic.tap(), 4600), setTimeout(() => haptic.tap(), 4980), setTimeout(() => haptic.big(), 8050), setTimeout(finish, T * 1000));
    return () => ts.forEach(clearTimeout);
  }, []);

  const runnerMode = now >= 4.6 && now < 7.65 ? 'run' : 'stand';
  const huntMode = (h: (typeof HUNTERS)[number]) => (h.dizzy && now >= 4.95 && now < 5.6 ? 'dizzy' : now >= 4.6 && now < 7.65 ? 'run' : now >= 2.2 && now < 4.4 ? 'walk' : 'stand');
  const showLogo = reduce || now >= 8.3;
  const impact = now >= 8.0 ? 3 : now >= 4.95 ? 2 : now >= 4.6 ? 1 : 0;
  const shake = useAnimationControls();
  useEffect(() => { if (impact) shake.start({ x: [0, -10, 9, -6, 4, 0], y: [0, 6, -7, 4, -2, 0], scale: [1.035, 1], transition: { duration: impact === 3 ? 0.5 : 0.34, ease: 'easeOut' } }); }, [impact, shake]);

  return (
    <motion.div style={{ position: 'fixed', inset: 0, background: INK, zIndex: 900, overflow: 'hidden' }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.7, 0, 0.2, 1] } }}>
      {!reduce && (
        <motion.div style={{ position: 'absolute', inset: -14 }} animate={shake}>
        <svg viewBox="-200 -430 400 860" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <motion.g initial={{ scale: CAMT.s[0], x: 0, y: 0 }} animate={{ scale: CAMT.s, x: CAMT.x, y: CAMT.y }} transition={{ scale: lin(RT), x: lin(RT), y: lin(RT) }}>
            <rect x="-3000" y="-3000" width="6000" height="6000" fill="none" />

            {/* the plaza: calm concentric paving, four lamp pools, the play zone */}
            <circle r="560" fill={G1} />
            {[110, 220, 330].map((r) => <circle key={r} r={r} fill="none" stroke={G2} strokeWidth="2" />)}
            {[0, 45, 90, 135].map((a) => <line key={a} x1={Math.cos((a * Math.PI) / 180) * -330} y1={Math.sin((a * Math.PI) / 180) * -330} x2={Math.cos((a * Math.PI) / 180) * 330} y2={Math.sin((a * Math.PI) / 180) * 330} stroke={G2} strokeWidth="1.5" />)}
            {[[-250, -250], [250, -250], [250, 250], [-250, 250]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="70" fill={BONE} opacity=".035" /><circle cx={x} cy={y} r="6" fill={BRASS} stroke={INK} strokeWidth="2" /></g>)}
            <circle r="960" fill="none" stroke={INK} strokeWidth="1120" opacity=".6" />
            <motion.circle fill="none" stroke={EMBER} strokeWidth="4" initial={{ r: 440, opacity: 0 }} animate={{ r: [440, 440, 405, 400], opacity: [0, 0, 0.85, 0.85] }}
              transition={{ r: tr([0, 1.0, 2.2, 10]), opacity: tr([0, 1.0, 1.6, 10]) }} />
            {Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; return <line key={i} x1={Math.cos(a) * 410} y1={Math.sin(a) * 410} x2={Math.cos(a) * 422} y2={Math.sin(a) * 422} stroke={EMBER} strokeWidth="2" opacity=".5" />; })}

            {/* the ember light trail */}
            <motion.path d={TRAIL} fill="none" stroke={EMBER} strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, ...TRAILLEN, 1], opacity: [0, 0, 0.9, 0.9, 0.3] }}
              transition={{ pathLength: { duration: T, times: [0, ...RT.t.slice(TI0, TI1 + 1), 1], ease: 'linear' }, opacity: tr([0, 4.59, 4.62, 8.0, 8.3], 'linear') }} />

            {/* heartbeat pulses around the runner while it is still */}
            {[0.15, 1.05, 2.2, 2.85, 3.4, 3.85, 4.15, 4.35].map((s, i) => (
              <motion.circle key={i} cx="0" cy="0" fill="none" stroke={EMBER} strokeWidth={i < 2 ? 2 : 2.5} initial={{ r: 12, opacity: 0 }}
                animate={{ r: [12, 12, i < 2 ? 34 : 60], opacity: [0, 0.9, 0] }} transition={{ r: tr([0, s, s + 0.7], 'easeOut'), opacity: tr([0, s, s + 0.7]) }} />
            ))}

            {/* hunters */}
            {HUNTERS.map((h, i) => (
              <motion.g key={i} initial={{ x: HT[i].x[0], y: HT[i].y[0] }} animate={{ x: HT[i].x, y: HT[i].y }} transition={{ x: lin(HT[i]), y: lin(HT[i]) }}>
                <motion.g initial={{ rotate: HT[i].a[0] }} animate={{ rotate: HT[i].a }} transition={{ rotate: lin(HT[i]) }}>
                  <Pivot />
                  <HunterTD mode={huntMode(h) as any} beam={now >= h.beam} />
                </motion.g>
              </motion.g>
            ))}

            {/* the crash: dizzy stars over the two hunters who collided */}
            {now >= 4.95 && now < 5.6 && (
              <motion.g initial={{ rotate: 0, scale: 0.4 }} animate={{ rotate: 360, scale: 1 }} transition={{ duration: 0.65, ease: 'linear' }} style={{ x: 65, y: 65 }}>
                <Pivot />
                {[0, 120, 240].map((a) => <path key={a} transform={`rotate(${a}) translate(0 -26)`} d="M0 -6 L1.8 -1.8 L6 0 L1.8 1.8 L0 6 L-1.8 1.8 L-6 0 L-1.8 -1.8 Z" fill={BONE} stroke={INK} strokeWidth="1.2" />)}
              </motion.g>
            )}

            {/* runner */}
            <motion.g initial={{ x: 0, y: 0 }} animate={{ x: RT.x, y: RT.y }} transition={{ x: lin(RT), y: lin(RT) }}>
              <motion.g initial={{ rotate: 0 }} animate={{ rotate: runnerAngle }} transition={{ rotate: lin(RT) }}>
                <Pivot />
                <RunnerTD mode={runnerMode as any} />
              </motion.g>
            </motion.g>

            {/* beams converge: the brass flash from the runner */}
            <motion.circle cx="-150" cy="-365" fill={BRASS} initial={{ r: 0, opacity: 0 }} animate={{ r: [0, 0, 18, 700], opacity: [0, 0, 1, 1] }}
              transition={{ r: tr([0, 7.75, 8.0, 8.35], [0.7, 0, 0.9, 0.4] as any), opacity: tr([0, 7.75, 7.8, 10], 'linear') }} />
          </motion.g>
        </svg>
        </motion.div>
      )}

      {/* cinema finish: vignette, grain, the white-hot frame of the breakout, letterbox bars */}
      {!reduce && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(0,0,0,.72) 100%)' }} />}
      {!reduce && <div className="film-grain" />}
      {!reduce && now >= 4.6 && now < 4.95 && <motion.div initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ position: 'absolute', inset: 0, background: BONE, pointerEvents: 'none', mixBlendMode: 'overlay' }} />}
      {!reduce && [0, 1].map((i) => (
        <motion.div key={i} style={{ position: 'absolute', left: 0, right: 0, [i ? 'bottom' : 'top']: 0, height: '9vh', background: '#000', transformOrigin: i ? 'bottom' : 'top', pointerEvents: 'none' }}
          initial={{ scaleY: 0 }} animate={{ scaleY: now >= 1.0 && now < 8.0 ? 1 : 0 }} transition={{ duration: now >= 8.0 ? 0.25 : 0.9, ease: [0.7, 0, 0.2, 1] }} />
      ))}

      {/* the mark */}
      <motion.div style={{ position: 'absolute', inset: 0, background: INK }} initial={{ clipPath: 'circle(0% at 50% 45%)' }}
        animate={showLogo ? { clipPath: 'circle(80% at 50% 45%)' } : {}} transition={{ duration: reduce ? 0 : 0.55, ease: [0.7, 0, 0.2, 1] }} />
      {showLogo && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: '8vh', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex' }}>
              {[EMBER, BRASS].map((c, i) => (
                <motion.span key={c} style={{ width: 64, height: 64, borderRadius: '50%', background: c, marginLeft: i ? -4 : 0, boxShadow: `0 0 0 3px ${INK}` }}
                  initial={{ scale: 0, x: i ? -40 : 40 }} animate={{ scale: [0, 1.2, 0.94, 1], x: 0 }} transition={{ delay: reduce ? 0 : 0.18 + i * 0.07, duration: 0.6, ease: [0.3, 1.3, 0.6, 1] }} />
              ))}
            </div>
            <div style={{ position: 'relative', marginTop: 24 }}>
              {!reduce && [EMBER, BRASS].map((c, i) => (
                <motion.div key={c} aria-hidden className="logo-word" initial={{ opacity: 0, x: i ? 46 : -46 }} animate={{ opacity: [0, 0.9, 0], x: [i ? 46 : -46, 0, 0] }} transition={{ delay: 0.4, duration: 0.42, times: [0, 0.7, 1], ease: 'easeOut' }}
                  style={{ position: 'absolute', inset: 0, fontSize: 'clamp(84px, 27vw, 120px)', fontWeight: 900, color: c, lineHeight: 0.85, paddingRight: 8, mixBlendMode: 'screen' }}>tag</motion.div>
              ))}
              <motion.div className="logo-word" initial={{ opacity: 0, scale: 1.5, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ delay: reduce ? 0.1 : 0.62, duration: reduce ? 0.2 : 0.28, ease: [0.2, 1.4, 0.4, 1] }}
                style={{ fontSize: 'clamp(84px, 27vw, 120px)', fontWeight: 900, color: BONE, lineHeight: 0.85, paddingRight: 8 }}>tag</motion.div>
              {!reduce && <motion.span aria-hidden initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 3.2], opacity: [0, 0.7, 0] }} transition={{ delay: 0.62, duration: 0.7, ease: 'easeOut' }}
                style={{ position: 'absolute', left: '50%', top: '50%', width: 160, height: 160, margin: -80, borderRadius: '50%', border: `2px solid ${BONE}`, pointerEvents: 'none' }} />}
            </div>
            <div style={{ marginTop: 22, fontSize: 13, fontWeight: 750, letterSpacing: '0.18em', textTransform: 'uppercase', color: BRASS, display: 'flex', gap: '0.5em' }}>
              {['Hide.', 'Run.', 'Don’t get caught.'].map((w, i) => (
                <motion.span key={w} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0.2 : 0.85 + i * 0.16, duration: 0.3, ease: [0.2, 0.9, 0.25, 1] }}>{w}</motion.span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* film progress */}
      <div style={{ position: 'absolute', left: 28, right: 28, bottom: 'calc(env(safe-area-inset-bottom) + 24px)', height: 3, borderRadius: 2, background: 'rgba(237,230,218,.12)', overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: EMBER, transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 1.2 : T, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}
