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
