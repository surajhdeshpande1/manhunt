// How close is the dot to where the player really is? Simulates runners (standing, walking, sprinting,
// zig-zagging, stopping dead) under realistic phone GPS error (slow drift + jitter + the odd wild fix +
// gaps), and compares raw GPS, the old position-only smoother and the new tracking filter.
// Run: npx esbuild tests/geo/filter.test.ts --bundle --platform=node --outfile=tests/.out/filter.cjs && node tests/.out/filter.cjs
import { makeGeoFilter, makeLegacyFilter, type Fix, type Reading } from '../../src/lib/geoFilter';

let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

const LAT0 = 16.18, LNG0 = 75.69, M = 111320, MX = M * Math.cos((LAT0 * Math.PI) / 180);
type Truth = { t: number; x: number; y: number; vx: number; vy: number };

/** one player's true path: a run of moves, each with a target speed and turns, under human acceleration limits */
function path(seconds: number): Truth[] {
  const moves: [number, number, number][] = []; // [duration s, speed m/s, turn every s (0 = straight)]
  let total = 0;
  while (total < seconds) {
    const r = rnd();
    const m: [number, number, number] = r < 0.18 ? [10 + rnd() * 25, 0, 0] // stand still
      : r < 0.4 ? [20 + rnd() * 30, 1.3 + rnd() * 0.4, rnd() < 0.5 ? 0 : 15] // walk
      : r < 0.65 ? [15 + rnd() * 25, 2.8 + rnd() * 0.8, rnd() < 0.5 ? 0 : 8] // jog
      : r < 0.85 ? [6 + rnd() * 12, 5.5 + rnd() * 1.5, 0] // sprint
      : [8 + rnd() * 10, 5 + rnd(), 3 + rnd() * 2]; // zig-zag sprint
    moves.push(m); total += m[0];
  }
  const out: Truth[] = [];
  let x = 0, y = 0, vx = 0, vy = 0, hd = rnd() * 2 * Math.PI, t = 0, nextTurn = 0;
  const dt = 0.1;
  for (const [dur, spd, turn] of moves) {
    const end = t + dur;
    nextTurn = t + (turn || 1e9);
    while (t < end && t < seconds) {
      if (t >= nextTurn) { hd += (rnd() < 0.5 ? -1 : 1) * (Math.PI / 3 + rnd() * Math.PI / 3); nextTurn = t + turn; }
      const tx = spd * Math.sin(hd), ty = spd * Math.cos(hd);
      const ax = tx - vx, ay = ty - vy, al = Math.hypot(ax, ay), lim = 3.5 * dt; // people reach ~3.5 m/s²
      if (al > lim) { vx += (ax / al) * lim; vy += (ay / al) * lim; } else { vx = tx; vy = ty; }
      x += vx * dt; y += vy * dt; t += dt;
      out.push({ t, x, y, vx, vy });
    }
  }
  return out;
}

type Sky = { name: string; acc: number; doppler: number; wild: number };
const SKIES: Sky[] = [
  { name: 'open sky (±5 m)', acc: 5, doppler: 0.95, wild: 0.01 },
  { name: 'campus / street (±10 m)', acc: 10, doppler: 0.9, wild: 0.015 },
  { name: 'trees / tall buildings (±20 m)', acc: 20, doppler: 0.6, wild: 0.03 },
];

/** what the phone reports, about once a second */
type Phone = 'good' | 'random heading' | 'speed stuck at 0';
function readings(tr: Truth[], sky: Sky, speedOn: boolean, phone: Phone = 'good') {
  const sig = sky.acc / 1.51; // phones quote a 68% radius; per-axis sigma of a 2-D Gaussian
  const sc = 0.75 * sig, sw = 0.66 * sig, tau = 20;
  let ex = gauss() * sc, ey = gauss() * sc, last = 0;
  const out: { r: Reading; truth: Truth }[] = [];
  let next = 1;
  for (const p of tr) {
    if (p.t < next) continue;
    const dt = p.t - last; last = p.t;
    const f = Math.exp(-dt / tau), g = Math.sqrt(1 - f * f) * sc;
    ex = ex * f + g * gauss(); ey = ey * f + g * gauss();
    let nx = p.x + ex + sw * gauss(), ny = p.y + ey + sw * gauss();
    if (rnd() < sky.wild) { const a = rnd() * 2 * Math.PI, d = 30 + rnd() * 90; nx += d * Math.sin(a); ny += d * Math.cos(a); }
    const acc = sky.acc * (0.8 + rnd() * 0.5);
    let speed: number | null = null, heading: number | null = null;
    if (speedOn && rnd() < sky.doppler) {
      const mvx = p.vx + gauss() * 0.25, mvy = p.vy + gauss() * 0.25, s = Math.hypot(mvx, mvy);
      if (phone === 'speed stuck at 0') { speed = 0; heading = null; }
      else if (Math.hypot(p.vx, p.vy) < 0.3) { speed = Math.abs(gauss() * 0.1); heading = null; }
      else { speed = s; heading = phone === 'random heading' ? rnd() * 360 : ((Math.atan2(mvx, mvy) * 180) / Math.PI + 360) % 360; }
    }
    const at = Math.round(p.t * 1000);
    out.push({ r: { lat: LAT0 + ny / M, lng: LNG0 + nx / MX, acc, at, t: at, speed, heading }, truth: p });
    // mostly 1 Hz, sometimes a hiccup, now and then a dropout of several seconds
    next = p.t + (rnd() < 0.04 ? 4 + rnd() * 8 : 0.8 + rnd() * 0.5);
  }
  return out;
}

const err = (f: Fix, p: Truth) => Math.hypot((f.lng - LNG0) * MX - p.x, (f.lat - LAT0) * M - p.y);
type Stat = { all: number[]; moving: number[]; within: number; n: number };
const stat = (): Stat => ({ all: [], moving: [], within: 0, n: 0 });
const pct = (a: number[], q: number) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const rms = (a: number[]) => Math.sqrt(a.reduce((u, v) => u + v * v, 0) / Math.max(1, a.length));

let failed = 0;
const RUNS = Number(process.env.RUNS || 60);
const CONDITIONS: [Sky, Phone][] = [...SKIES.map((k): [Sky, Phone] => [k, 'good']), [SKIES[1], 'random heading'], [SKIES[1], 'speed stuck at 0']];
for (const [sky, phone] of CONDITIONS) {
  const S: Record<string, Stat> = { raw: stat(), old: stat(), 'new, no speed': stat(), new: stat() };
  for (let run = 0; run < RUNS; run++) {
    seed = 1000 + run * 7919;
    const tr = path(600);
    const rs = readings(tr, sky, true, phone);
    const fs: Record<string, (r: Reading) => Fix> = {
      raw: (r) => r, old: makeLegacyFilter(), 'new, no speed': makeGeoFilter({ useSpeed: false }), new: makeGeoFilter(),
    };
    for (const { r, truth } of rs) {
      for (const k of Object.keys(fs)) {
        const f = fs[k](r);
        if (truth.t < 15) continue; // let every filter settle
        const e = err(f, truth), st = S[k];
        st.all.push(e); st.n++; if (e <= f.acc) st.within++;
        if (Math.hypot(truth.vx, truth.vy) > 2.5) st.moving.push(e);
      }
    }
  }
  console.log(`\n${sky.name}${phone === 'good' ? '' : `, a phone whose speed reading is broken (${phone})`}  (${RUNS} players × 10 min)`);
  console.log('  filter          typical  95% of the time  worst 1%   while running  inside its ± ring');
  for (const [k, st] of Object.entries(S)) {
    console.log(`  ${k.padEnd(15)} ${rms(st.all).toFixed(1).padStart(6)} m ${pct(st.all, 0.95).toFixed(1).padStart(9)} m ${pct(st.all, 0.99).toFixed(1).padStart(9)} m ${rms(st.moving).toFixed(1).padStart(9)} m ${(100 * st.within / st.n).toFixed(0).padStart(12)}%`);
  }
  const n = S.new, o = S.old, raw = S.raw;
  // closer than the old smoother and than raw GPS, and its ± ring at least as honest as the old one's
  const ok = rms(n.all) < rms(o.all) && rms(n.moving) < rms(o.moving) && pct(n.all, 0.95) < pct(raw.all, 0.95) && pct(n.all, 0.99) < pct(raw.all, 0.99) && n.within / n.n >= o.within / o.n;
  if (!ok) { failed++; console.log('  FAIL: the new filter must beat the old one and raw GPS here'); }
}
console.log(failed ? `\n${failed} condition(s) failed` : '\nPASS: the new filter is closer than the old one and than raw GPS in every condition');
process.exit(failed ? 1 : 0);
