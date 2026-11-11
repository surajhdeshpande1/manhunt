import pc from 'polygon-clipping';
import type { LngLat } from './geo';

type XY = [number, number];
const area = (r: XY[]) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
function segDist(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function dp(pts: XY[], tol: number): XY[] {
  if (pts.length < 3) return pts;
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > max) { max = d; idx = i; } }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

/**
 * Turns a finger stroke into a clean play-area outline: closes it, untangles any place where the line
 * crossed itself (keeping the biggest piece), and smooths the jitter down to at most `maxPts` corners.
 * Returns null if the shape is too small to play in.
 */
export function strokeToPolygon(raw: LngLat[], maxPts = 120): LngLat[] | null {
  if (raw.length < 6) return null;
  const [lng0, lat0] = raw[0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  let xy: XY[] = raw.map(([x, y]) => [(x - lng0) * kx, (y - lat0) * ky]);
  xy = xy.filter((p, i) => i === 0 || Math.hypot(p[0] - xy[i - 1][0], p[1] - xy[i - 1][1]) > 0.4);
  if (xy.length < 4) return null;
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  if (Math.max(...xs) - Math.min(...xs) < 10 || Math.max(...ys) - Math.min(...ys) < 10) return null;
  const ring: XY[] = [...xy, xy[0]];
  let pieces: XY[][][];
  try { pieces = pc.union([ring] as any) as unknown as XY[][][]; } catch { pieces = [[ring]]; }
  let best: XY[] | null = null, bestA = 0;
  for (const poly of pieces) { const r = poly[0]; const a = Math.abs(area(r)); if (a > bestA) { bestA = a; best = r; } }
  if (!best || bestA < 120) return null;
  let tol = 0.8, out = dp(best, tol);
  while (out.length > maxPts && tol < 60) { tol *= 1.4; out = dp(best, tol); }
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out = out.slice(0, -1);
  if (out.length < 3) return null;
  return out.map(([x, y]) => [lng0 + x / kx, lat0 + y / ky] as LngLat);
}
