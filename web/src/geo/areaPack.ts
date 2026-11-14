/**
 * An "area pack": every building outline and named place around a play area, built from Overture's open data
 * by the host's device and saved once on the server, so every player loads the same small file.
 */
import { AREAS } from '../lib/cityLayers';
import type { BBox } from './overture';

export type AreaPack = { v: 1; release: string; bbox: BBox; b: number[][][]; p: [number, number, string, string][] };
type LngLat = { lng: number; lat: number } | [number, number];

const GROUPS: [string, RegExp][] = [
  ['learn', /learning|college|universit|school|education|librar|academ|institut|training|coaching/],
  ['health', /hospital|clinic|diagnost|pharmac|doctor|dentist|medical|health|laborator|ayurved/],
  ['food', /restaurant|cafe|coffee|food|bakery|sweet|dhaba|juice|bar\b|eatery|snack/],
  ['worship', /worship|temple|mosque|church|mandir|religio|gurudwara|shrine/],
  ['money', /bank|financ|atm|credit|insurance/],
  ['stay', /hotel|lodg|hostel|guest|resort|accommodation/],
  ['gov', /government|police|post_office|court|municipal|fire_station|public_service|office/],
  ['shop', /store|shop|market|mall|dealer|retail|supermarket|boutique|showroom|service|repair|gas_station|fuel/],
];
export const groupOf = (cat: string | null | undefined) => GROUPS.find(([, rx]) => rx.test(cat || ''))?.[0] ?? 'other';

const pt = (p: LngLat): [number, number] => (Array.isArray(p) ? p : [p.lng, p.lat]);
/** box around the play area plus a margin in metres (default 300 m) */
export function areaBox(boundary: LngLat[], marginM = 300): BBox {
  const xs = boundary.map((p) => pt(p)[0]), ys = boundary.map((p) => pt(p)[1]);
  const lat = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dLat = marginM / 111320, dLng = marginM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [Math.min(...xs) - dLng, Math.min(...ys) - dLat, Math.max(...xs) + dLng, Math.max(...ys) + dLat];
}
/** stable short id for a boundary, so a changed area gets a new file */
export function boundaryKey(boundary: LngLat[]) {
  let h = 0x811c9dc5;
  for (const p of boundary) for (const v of pt(p)) {
    const s = v.toFixed(6);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(36);
}
/** true when TAG already ships detail for the whole box */
export const shippedCovers = (b: BBox) => AREAS.some((a) => b[0] >= a.bounds[0] && b[1] >= a.bounds[1] && b[2] <= a.bounds[2] && b[3] <= a.bounds[3]);

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
function rings(g: any): number[][][] {
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.map((poly: number[][][]) => poly.map((ring) => ring.flatMap(([x, y]) => [r6(x), r6(y)])));
}
/** compact a list of Overture rows into a pack */
export function makePack(release: string, bbox: BBox, buildings: any[], places: any[]): AreaPack {
  const b: number[][][] = [];
  for (const r of buildings) for (const poly of rings(r.geometry)) if (poly[0]?.length >= 8) b.push(poly);
  const p: AreaPack['p'] = [];
  for (const r of places) {
    const name = r.names?.primary; const g = r.geometry;
    if (!name || (r.confidence ?? 0) < 0.5 || g?.type !== 'Point') continue;
    p.push([r6(g.coordinates[0]), r6(g.coordinates[1]), String(name).replace(/\s+/g, ' ').trim().slice(0, 64), groupOf(r.basic_category ?? r.categories?.primary)]);
  }
  return { v: 1, release, bbox, b, p };
}
/** GeoJSON for the map */
export function packToGeoJSON(pack: AreaPack) {
  const unflat = (ring: number[]) => { const out: number[][] = []; for (let i = 0; i < ring.length; i += 2) out.push([ring[i], ring[i + 1]]); return out; };
  return {
    buildings: { type: 'FeatureCollection' as const, features: pack.b.map((poly) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: poly.map(unflat) } })) },
    places: { type: 'FeatureCollection' as const, features: pack.p.map(([x, y, n, g]) => ({ type: 'Feature' as const, properties: { n, g, r: 1 }, geometry: { type: 'Point' as const, coordinates: [x, y] } })) },
  };
}
