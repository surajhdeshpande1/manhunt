/**
 * Every base map TAG can draw under the game, all free:
 *  - Map: OpenStreetMap via OpenFreeMap (no key, no limits, always available)
 *  - Satellite: Esri World Imagery and MapTiler Satellite (free accounts; keys set in Vercel),
 *    drawn with OpenStreetMap roads and names on top so the photo still reads like a map
 *  - Google map and satellite, only if a Google key is set
 * A provider that fails (bad key, quota used up, offline) is skipped for 10 minutes and the next one takes over.
 */
import { GKEY, basemapPref, googleBlocked, markFail as markGoogleFail, saveBasemapPref, type GKind } from './gmaps';

const env = (import.meta as any).env ?? {};
export const ARCGIS_KEY: string | undefined = env.VITE_ARCGIS_KEY || undefined;
export const MAPTILER_KEY: string | undefined = env.VITE_MAPTILER_KEY || undefined;
export const OFM_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export type Provider = 'osm' | 'google' | 'esri' | 'maptiler';
export type MapOpt = { id: string; kind: GKind; provider: Provider; source: string };

const ALL: MapOpt[] = [
  { id: 'osm', kind: 'street', provider: 'osm', source: 'OpenStreetMap' },
  { id: 'g-street', kind: 'street', provider: 'google', source: 'Google' },
  { id: 'esri', kind: 'satellite', provider: 'esri', source: 'Esri' },
  { id: 'maptiler', kind: 'satellite', provider: 'maptiler', source: 'MapTiler' },
  { id: 'g-sat', kind: 'satellite', provider: 'google', source: 'Google' },
];
export const OSM_MAP = ALL[0];
/** when nothing was chosen on this phone: the most detailed source that's set up */
const PRIORITY: Record<GKind, Provider[]> = { street: ['google', 'osm'], satellite: ['google', 'esri', 'maptiler'] };

const FAIL = 'tag-map-fail-';
export function providerFailed(p: Provider) {
  if (p === 'osm') return false;
  if (p === 'google') return googleBlocked();
  try { return Date.now() - Number(sessionStorage.getItem(FAIL + p) || 0) < 10 * 60e3; } catch { return false; }
}
export function markProviderFailed(p: Provider) {
  if (p === 'osm') return;
  if (p === 'google') { markGoogleFail(); return; }
  try { sessionStorage.setItem(FAIL + p, String(Date.now())); } catch { /* private mode */ }
}

const configured = (o: MapOpt) => o.provider === 'osm' || (o.provider === 'google' && !!GKEY) || (o.provider === 'esri' && !!ARCGIS_KEY) || (o.provider === 'maptiler' && !!MAPTILER_KEY);
/** maps that are set up and not currently failing */
export const usableMaps = () => ALL.filter((o) => configured(o) && !providerFailed(o.provider));
export const hasSatellite = () => usableMaps().some((o) => o.kind === 'satellite');

const choiceKey = (k: GKind) => `tag-map-${k}`;
export function pickMap(kind: GKind): MapOpt {
  const u = usableMaps();
  let saved: string | null = null;
  try { saved = localStorage.getItem(choiceKey(kind)); } catch { /* ignore */ }
  const mine = u.find((o) => o.id === saved && o.kind === kind);
  if (mine) return mine;
  for (const pr of PRIORITY[kind]) { const o = u.find((x) => x.kind === kind && x.provider === pr); if (o) return o; }
  return ALL[0]; // no satellite set up: plain map
}
export function startMap(fallbackKind: GKind) { return pickMap(basemapPref(fallbackKind)); }
export function rememberMap(o: MapOpt) {
  saveBasemapPref(o.kind);
  try { localStorage.setItem(choiceKey(o.kind), o.id); } catch { /* ignore */ }
}

/* ---------- satellite + OpenStreetMap roads and names on top ---------- */
function imagery(p: Provider) {
  if (p === 'esri') return {
    tiles: [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_KEY}`], tileSize: 256, maxzoom: 19,
    attribution: 'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> · Esri, Maxar, Earthstar Geographics and the GIS User Community',
  };
  return {
    tiles: [`https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`], tileSize: 512, maxzoom: 20,
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a>',
  };
}

let libertyCache: Promise<any> | null = null;
const liberty = () => (libertyCache ??= fetch(OFM_STYLE).then((r) => { if (!r.ok) throw new Error('style ' + r.status); return r.json(); }).catch((e) => { libertyCache = null; throw e; }));

export async function satelliteStyle(p: 'esri' | 'maptiler') {
  const sat = { type: 'raster' as const, ...imagery(p) };
  let base: any = null;
  try { base = await liberty(); } catch { /* labels are a bonus; the photo alone still works */ }
  const layers: any[] = [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0b0c' } }, { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 150 } }];
  if (base) {
    for (const l of base.layers as any[]) {
      const id = String(l.id).toLowerCase();
      if (l.type === 'line' && /^(road|bridge|tunnel|highway)/.test(id) && !/casing|rail|ferry|transit|aerialway/.test(id)) {
        layers.push({ ...l, paint: { ...l.paint, 'line-color': 'rgba(255,255,255,0.62)', 'line-opacity': 0.8 } });
      } else if (l.type === 'symbol' && base.glyphs && !/housenumber|aeroway|airport|rail|transit|shield/.test(id)) {
        layers.push({ ...l, paint: { ...l.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.88)', 'text-halo-width': 1.6, 'text-halo-blur': 0.4 } });
      }
    }
  }
  return {
    version: 8 as const, name: 'tag-satellite',
    ...(base?.glyphs ? { glyphs: base.glyphs } : {}),
    ...(base?.sprite ? { sprite: base.sprite } : {}),
    sources: { ...(base ? base.sources : {}), sat },
    layers,
  };
}
