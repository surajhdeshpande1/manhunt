/**
 * Find a place by name, so a host can jump the map straight to it while drawing a play area.
 *  - Names TAG already has (the town data it ships, and the area pack on screen) answer instantly, even offline.
 *  - Everything else comes from a geocoder: Esri or MapTiler when their key is set, otherwise Photon
 *    (OpenStreetMap data, free, no key). A provider that fails hands over to the next one.
 * Results near the map's centre come first.
 */
import { ARCGIS_KEY, MAPTILER_KEY } from './basemaps';
import { AREAS } from './cityLayers';
import { haversine } from './geo';
import type { AreaPack } from '../geo/areaPack';

export type Place = {
  name: string; detail: string; lat: number; lng: number;
  /** west, south, east, north: the whole site when the geocoder knows it (a campus, a park) */
  box?: [number, number, number, number];
  from: 'tag' | 'web';
};
type Near = { lat: number; lng: number } | null;

const KIND: Record<string, string> = {
  learn: 'College or school', health: 'Hospital or clinic', food: 'Food and drink', worship: 'Place of worship',
  money: 'Bank or ATM', stay: 'Hotel or hostel', gov: 'Office', shop: 'Shop or service', other: 'Place',
};
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------- names TAG already has ---------- */
type Local = { n: string; k: string; g: string; x: number; y: number };
let shipped: Promise<Local[]> | null = null;
function shippedNames(): Promise<Local[]> {
  return (shipped ??= Promise.all(AREAS.map((a) =>
    fetch(`/geo/${a.id}/places.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
    .then((all) => all.flatMap((fc: any) => (fc?.features ?? []).flatMap((f: any) => {
      const n = String(f.properties?.n ?? '').trim(); const c = f.geometry?.coordinates;
      return n && Array.isArray(c) ? [{ n, k: norm(n), g: String(f.properties?.g ?? 'other'), x: +c[0], y: +c[1] }] : [];
    }))));
}
/** every word typed must start a word of the name ("eng col" finds "Engineering College") */
function score(k: string, words: string[]) {
  const parts = k.split(' ');
  let s = 0;
  for (const w of words) {
    if (parts.some((p) => p === w)) s += 3;
    else if (parts.some((p) => p.startsWith(w))) s += 2;
    else if (k.includes(w)) s += 1;
    else return 0;
  }
  return k.startsWith(words[0]) ? s + 1 : s;
}
export async function searchLocal(q: string, near: Near, packs: (AreaPack | null | undefined)[]): Promise<Place[]> {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const pool: Local[] = [...await shippedNames()];
  for (const pk of packs) if (pk) for (const [x, y, n, g] of pk.p) pool.push({ n, k: norm(n), g, x, y });
  const seen = new Set<string>();
  const hits: { p: Local; s: number; d: number }[] = [];
  for (const p of pool) {
    const s = score(p.k, words); if (!s) continue;
    const key = `${p.k}|${p.x.toFixed(4)}|${p.y.toFixed(4)}`; if (seen.has(key)) continue; seen.add(key);
    hits.push({ p, s, d: near ? haversine(near.lat, near.lng, p.y, p.x) : 0 });
  }
  hits.sort((a, b) => b.s - a.s || a.d - b.d);
  return hits.slice(0, 5).map(({ p, d }) => ({
    name: p.n, detail: `${KIND[p.g] ?? KIND.other}${near && d > 0 ? ` · ${d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`} away` : ''}`,
    lat: p.y, lng: p.x, from: 'tag' as const,
  }));
}

/* ---------- geocoders ---------- */
const uniq = (xs: (string | undefined | null)[]) => xs.filter((x, i, a): x is string => !!x && a.indexOf(x) === i);

async function photon(q: string, near: Near, signal: AbortSignal): Promise<Place[]> {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q); u.searchParams.set('limit', '7'); u.searchParams.set('lang', 'en');
  if (near) { u.searchParams.set('lat', near.lat.toFixed(5)); u.searchParams.set('lon', near.lng.toFixed(5)); }
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('photon ' + r.status);
  const j = await r.json();
  return (j.features ?? []).map((f: any) => {
    const p = f.properties ?? {}; const [lng, lat] = f.geometry?.coordinates ?? [];
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const name = p.name || street || p.city || p.county || 'Place';
    const e = p.extent; // [west, north, east, south]
    return {
      name, detail: uniq([p.name && street ? street : null, p.district, p.locality, p.city ?? p.town ?? p.village, p.state]).join(', '),
      lat: +lat, lng: +lng, box: Array.isArray(e) && e.length === 4 ? [e[0], e[3], e[2], e[1]] as Place['box'] : undefined, from: 'web' as const,
    };
  }).filter((p: Place) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

async function esri(q: string, near: Near, signal: AbortSignal): Promise<Place[]> {
  const u = new URL('https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates');
  u.searchParams.set('f', 'json'); u.searchParams.set('singleLine', q); u.searchParams.set('maxLocations', '7');
  u.searchParams.set('outFields', 'PlaceName,Place_addr,Type');
  if (near) u.searchParams.set('location', `${near.lng},${near.lat}`);
  u.searchParams.set('token', ARCGIS_KEY!);
  const r = await fetch(u, { signal });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('esri ' + (j.error?.code ?? r.status));
  return (j.candidates ?? []).map((c: any) => {
    const a = c.attributes ?? {}; const x = c.extent;
    return {
      name: a.PlaceName || String(c.address ?? '').split(',')[0] || 'Place', detail: a.Place_addr || c.address || '',
      lat: +c.location?.y, lng: +c.location?.x, box: x ? [x.xmin, x.ymin, x.xmax, x.ymax] as Place['box'] : undefined, from: 'web' as const,
    };
  }).filter((p: Place) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

async function maptiler(q: string, near: Near, signal: AbortSignal): Promise<Place[]> {
  const u = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`);
  u.searchParams.set('key', MAPTILER_KEY!); u.searchParams.set('limit', '7'); u.searchParams.set('language', 'en');
  if (near) u.searchParams.set('proximity', `${near.lng},${near.lat}`);
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('maptiler ' + r.status);
  const j = await r.json();
  return (j.features ?? []).map((f: any) => ({
    name: f.text || String(f.place_name ?? '').split(',')[0] || 'Place',
    detail: String(f.place_name ?? '').split(',').slice(1).join(',').trim(),
    lat: +f.center?.[1], lng: +f.center?.[0], box: Array.isArray(f.bbox) && f.bbox.length === 4 ? f.bbox as Place['box'] : undefined, from: 'web' as const,
  })).filter((p: Place) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** the best geocoder that's set up; on failure the next one answers. `credit` must be shown with the results. */
export async function searchWeb(q: string, near: Near, signal: AbortSignal): Promise<{ places: Place[]; credit: string }> {
  const chain: [typeof photon, string][] = [];
  if (ARCGIS_KEY) chain.push([esri, 'Search powered by Esri']);
  if (MAPTILER_KEY) chain.push([maptiler, 'Search © MapTiler © OpenStreetMap contributors']);
  chain.push([photon, 'Search by Photon · © OpenStreetMap contributors']);
  let last: unknown = null;
  for (const [run, credit] of chain) {
    try { return { places: await run(q, near, signal), credit }; }
    catch (e) { if (signal.aborted) throw e; last = e; }
  }
  throw last ?? new Error('search failed');
}

/** local hits first, then the geocoder's, without repeating a place that's in both */
export function mergePlaces(local: Place[], web: Place[]): Place[] {
  const out = [...local];
  for (const w of web) {
    if (out.some((l) => norm(l.name) === norm(w.name) && haversine(l.lat, l.lng, w.lat, w.lng) < 150)) continue;
    out.push(w);
  }
  return out.slice(0, 9);
}
