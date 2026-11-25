export type LngLat = [number, number];
export type Zone = { lat: number; lng: number; r: number };

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toR = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * toR) / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(((lng2 - lng1) * toR) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function circlePolygon(z: Zone, steps = 72): LngLat[] {
  const pts: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push([z.lng + (z.r * Math.sin(t)) / (111320 * Math.cos((z.lat * Math.PI) / 180)), z.lat + (z.r * Math.cos(t)) / 110540]);
  }
  return pts;
}
export function closeRing(p: LngLat[]): LngLat[] {
  if (p.length < 3) return p;
  const [a, b] = [p[0], p[p.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? p : [...p, a];
}
export function bboxOf(points: LngLat[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of points) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [[w, s], [e, n]];
}
export function polyAreaM2(p: LngLat[]) {
  if (p.length < 3) return 0;
  const lat0 = p[0][1], k = 111320 * Math.cos((lat0 * Math.PI) / 180);
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * k * (y2 * 110540) - x2 * k * (y1 * 110540);
  }
  return Math.abs(a / 2);
}

/* ---------- how much room you have before the edge (mirrors the server's tag_violation) ---------- */
const M_LAT = 111320;
/** inside a ring? (lng/lat treated as flat: fine at play-area scale) */
export function inRing(lat: number, lng: number, ring: LngLat[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** metres from a point to the nearest edge of a ring */
export function ringEdgeDist(lat: number, lng: number, ring: LngLat[]) {
  const mx = M_LAT * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ax = (a[0] - lng) * mx, ay = (a[1] - lat) * M_LAT, bx = (b[0] - lng) * mx, by = (b[1] - lat) * M_LAT;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
/**
 * Metres you can still go before the server starts the out-of-bounds countdown: the boundary, the safe zone (during
 * the hunt) or a no-go area, each with the room's buffer. Negative means already past it. Null when there's nothing to check.
 */
export function roomLeft(lat: number, lng: number, o: { boundary?: LngLat[] | null; zone?: Zone | null; nogo?: LngLat[][] | null; buffer: number; hunt: boolean }) {
  let left = Infinity;
  if (o.boundary && o.boundary.length >= 3) {
    const d = ringEdgeDist(lat, lng, o.boundary);
    left = Math.min(left, inRing(lat, lng, o.boundary) ? d + o.buffer : o.buffer - d);
  }
  if (o.hunt && o.zone) left = Math.min(left, o.zone.r + o.buffer - haversine(lat, lng, o.zone.lat, o.zone.lng));
  for (const ring of o.nogo ?? []) {
    if (ring.length < 3) continue;
    const d = ringEdgeDist(lat, lng, ring);
    left = Math.min(left, inRing(lat, lng, ring) ? o.buffer - d : d + o.buffer);
  }
  return Number.isFinite(left) ? left : null;
}
