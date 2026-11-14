/**
 * Steadies raw GPS for TAG.
 *
 * Phones jitter by several metres even standing still, now and then throw a wild fix, and a plain average
 * trails behind anyone who is moving. This is a small Kalman filter that tracks position *and* velocity
 * (a "constant velocity" model), so a sprinting runner's dot keeps up with them instead of lagging metres
 * behind. Most phones also report their own speed and heading, measured from the Doppler shift of the
 * satellite signals, which is far steadier than differencing positions; that sharpens the track a lot.
 * But some phones report nonsense there (a speed stuck at 0, a random heading), so the speed is only used
 * once it has been checked against how far the phone actually moved over the last ~20 seconds.
 * Pure maths, no browser APIs, so it can be tested on its own (tests/geo/filter.test.ts).
 */
export type Fix = { lat: number; lng: number; acc: number; at: number };
/** a raw reading: `at` is our clock (ms); `t` the fix's own timestamp if trustworthy; speed m/s, heading degrees from north */
export type Reading = Fix & { t?: number; speed?: number | null; heading?: number | null };

const M_LAT = 111320;
export const FILTER = {
  sigmaA: 1.2,   // m/s², how hard a person on foot speeds up, slows down or turns (spectral density, see predict)
  tau: 12,       // s, a velocity we stop hearing about fades on this scale: people stop more than they coast
  sigmaV: 0.5,   // m/s, error of the phone's Doppler speed at a good fix (grows as the fix gets worse)
  gate: 16,      // squared Mahalanobis distance beyond which a reading counts as a wild one
  floor: 0.6,    // GPS errors are correlated over time, so never claim much better than the phone itself reports
  rScale: 1,     // turns a phone's "accuracy" (a 68% radius) into the per-axis error the filter weighs
  ring: 1.25,    // and turns the filter's per-axis error back into a radius for the ± ring
  forget: 0.93,  // how quickly the record of which track predicts better fades (~15 fixes)
  switchAt: 1,   // how clearly the speed-aided track must be winning (or losing) before the dot changes track
  scoreCap: 30,
  resetMs: 30000,
};

type Track = { x: number; y: number; vx: number; vy: number; p00: number; p01: number; p11: number };
const clone = (k: Track): Track => ({ ...k });

function predict(k: Track, dt: number, sigmaA: number, tau: number) {
  // move on at the current velocity, which slowly fades (an Ornstein-Uhlenbeck velocity)
  const d = Math.exp(-dt / tau), a = tau * (1 - d), q = sigmaA * sigmaA;
  k.x += k.vx * a; k.y += k.vy * a; k.vx *= d; k.vy *= d;
  const n00 = k.p00 + 2 * a * k.p01 + a * a * k.p11 + (q * dt * dt * dt) / 3;
  const n01 = d * (k.p01 + a * k.p11) + (q * dt * dt) / 2;
  const n11 = d * d * k.p11 + q * dt;
  k.p00 = n00; k.p01 = n01; k.p11 = n11;
}
function posUpdate(k: Track, zx: number, zy: number, R: number) {
  const s = k.p00 + R, k0 = k.p00 / s, k1 = k.p01 / s, ix = zx - k.x, iy = zy - k.y;
  k.x += k0 * ix; k.y += k0 * iy; k.vx += k1 * ix; k.vy += k1 * iy;
  const n00 = (1 - k0) * k.p00, n01 = (1 - k0) * k.p01, n11 = k.p11 - k1 * k.p01;
  k.p00 = n00; k.p01 = n01; k.p11 = n11;
}
function velUpdate(k: Track, vx: number, vy: number, R: number, gate: number) {
  const s = k.p11 + R, ix = vx - k.vx, iy = vy - k.vy;
  if ((ix * ix + iy * iy) / s > gate) return; // nobody on foot changes velocity that fast: a glitch
  const j0 = k.p01 / s, j1 = k.p11 / s;
  k.x += j0 * ix; k.y += j0 * iy; k.vx += j1 * ix; k.vy += j1 * iy;
  const n00 = k.p00 - j0 * k.p01, n01 = (1 - j1) * k.p01, n11 = (1 - j1) * k.p11;
  k.p00 = n00; k.p01 = n01; k.p11 = n11;
}

/** the velocity the phone measured, as east/north m/s, or null if it gave none */
function doppler(r: Reading): [number, number] | null {
  const s = r.speed;
  if (s == null || !Number.isFinite(s) || s < 0 || s > 60) return null;
  if (s < 0.2) return [0, 0];
  const h = r.heading;
  if (h == null || !Number.isFinite(h)) return null;
  const rad = (h * Math.PI) / 180;
  return [s * Math.sin(rad), s * Math.cos(rad)];
}

export function makeGeoFilter(opts: Partial<typeof FILTER> & { useSpeed?: boolean; debug?: (score: number) => void } = {}) {
  const P = { ...FILTER, ...opts };
  const useSpeed = opts.useSpeed ?? true;
  let o: { lat: number; lng: number; mx: number } | null = null; // flat-earth origin; fine across any play area
  // Two tracks run side by side. A uses positions only and never misleads. B also uses the phone's own speed.
  // Each new fix scores how well each track predicted it; B is shown only while it has recently been the
  // better predictor, so a phone whose speed reading is broken just falls back to A.
  let A: Track, B: Track;
  let last = 0, rejects = 0;
  let score = 0, useB = false; // log-likelihood ratio of B over A, with memory of ~1/(1-P.forget) fixes
  const toXY = (r: Fix): [number, number] => [(r.lng - o!.lng) * o!.mx, (r.lat - o!.lat) * M_LAT];
  const start = (r: Reading, acc: number, t: number) => {
    o = { lat: r.lat, lng: r.lng, mx: M_LAT * Math.cos((r.lat * Math.PI) / 180) };
    A = { x: 0, y: 0, vx: 0, vy: 0, p00: (acc * P.rScale) ** 2, p01: 0, p11: 4 }; // up to ~2 m/s either way
    const v = useSpeed ? doppler(r) : null;
    B = v ? { ...A, vx: v[0], vy: v[1], p11: (P.sigmaV + acc / 40) ** 2 } : clone(A);
    last = t; rejects = 0;
    score = Math.min(score, 0); useB = false; // after a restart B has to earn its place again
  };
  const out = (acc: number, at: number): Fix => {
    const k = useB ? B : A;
    return { lat: o!.lat + k.y / M_LAT, lng: o!.lng + k.x / o!.mx, acc: Math.max(P.ring * Math.sqrt(k.p00), acc * P.floor), at };
  };
  /** log-likelihood of a fix under a track's prediction (2-D, isotropic) */
  const ll = (k: Track, zx: number, zy: number, R: number) => {
    const s = k.p00 + R, ix = zx - k.x, iy = zy - k.y;
    return -Math.log(s) - (ix * ix + iy * iy) / (2 * s);
  };
  return (r: Reading): Fix => {
    const acc = Math.max(3, r.acc || 50);
    const t = r.t ?? r.at;
    if (!o || t - last > P.resetMs || t < last - 1000) { start(r, acc, t); return { lat: r.lat, lng: r.lng, acc, at: r.at }; }
    if (t <= last) return out(acc, r.at); // the same fix delivered twice
    const dt = Math.min(P.resetMs / 1000, (t - last) / 1000);
    last = t;
    predict(A, dt, P.sigmaA, P.tau); predict(B, dt, P.sigmaA, P.tau);

    // a fix wildly off what the track says is possible is ignored, unless the phone keeps insisting
    const [zx, zy] = toXY(r);
    const R = (acc * P.rScale) ** 2, s = A.p00 + R, ix = zx - A.x, iy = zy - A.y;
    if ((ix * ix + iy * iy) / s > P.gate && Math.hypot(ix, iy) > 2 * acc + 10) {
      if (++rejects > 3) { start(r, acc, t); return { lat: r.lat, lng: r.lng, acc, at: r.at }; }
      return out(acc, r.at);
    }
    rejects = 0;
    if (useSpeed) {
      score = Math.max(-P.scoreCap, Math.min(P.scoreCap, score * P.forget + ll(B, zx, zy, R) - ll(A, zx, zy, R)));
      if (score > P.switchAt) useB = true; else if (score < -P.switchAt) useB = false;
      opts.debug?.(score);
    }
    posUpdate(A, zx, zy, R);
    if (useSpeed) {
      const v = doppler(r);
      if (v) velUpdate(B, v[0], v[1], (P.sigmaV + acc / 40) ** 2, P.gate);
      posUpdate(B, zx, zy, R);
    }
    return out(acc, r.at);
  };
}

/** The filter TAG used before (position only, no velocity), kept for the comparison test. */
export function makeLegacyFilter() {
  let s: { lat: number; lng: number; v: number; at: number } | null = null;
  let rejects = 0;
  return (raw: Fix): Fix => {
    const acc = Math.max(3, raw.acc || 50);
    if (!s || raw.at - s.at > 30000) { s = { lat: raw.lat, lng: raw.lng, v: acc * acc, at: raw.at }; rejects = 0; return { ...raw, acc }; }
    const dt = Math.max(0.2, (raw.at - s.at) / 1000);
    const mLng = M_LAT * Math.cos((s.lat * Math.PI) / 180);
    const d = Math.hypot((raw.lat - s.lat) * M_LAT, (raw.lng - s.lng) * mLng);
    if (d > 9 * dt + 2.5 * acc + 15 && rejects < 3) { rejects++; return { lat: s.lat, lng: s.lng, acc: Math.max(Math.sqrt(s.v), acc * 0.5), at: raw.at }; }
    rejects = 0;
    const v = s.v + (4 * dt) ** 2;
    const k = v / (v + acc * acc);
    s = { lat: s.lat + k * (raw.lat - s.lat), lng: s.lng + k * (raw.lng - s.lng), v: (1 - k) * v, at: raw.at };
    return { lat: s.lat, lng: s.lng, acc: Math.max(Math.sqrt(s.v), acc * 0.6), at: raw.at };
  };
}

/** How good the location is, for the warnings players see. */
export type Quality = 'ok' | 'weak' | 'coarse' | 'lost';
export const COARSE_M = 500; // a phone sharing only an "approximate" location reports a kilometre or more
export function rateFix(fix: Fix | null, rawAcc: number | null, sinceStart: number, maxAcc: number, now = Date.now()): Quality | 'waiting' {
  if (!fix) return 'waiting';
  if (now - fix.at > 15000) return 'lost';
  if (fix.acc <= maxAcc) return 'ok';
  if (rawAcc != null && rawAcc >= COARSE_M) return sinceStart >= 10000 ? 'coarse' : 'waiting';
  return 'weak';
}
