/**
 * Detail TAG ships itself, on top of whichever map is showing (not Google, which has its own):
 * every building outline and named place in the play areas, from Overture Maps' open data
 * (buildings: OpenStreetMap + Google Open Buildings + Microsoft; places: Overture). No keys, no accounts.
 * Files live in public/geo/<area>/ and are built with the scripts in web/tools/geo (see its README).
 */
import type maplibregl from 'maplibre-gl';

export type CityMode = 'night' | 'day' | 'photo';
type Area = { id: string; bounds: [number, number, number, number] };
/** lon/lat boxes covered by the shipped data */
export const AREAS: Area[] = [{ id: 'bagalkot', bounds: [75.62, 16.14, 75.74, 16.22] }]; // Bagalkot, Navanagar, Vidyagiri (BEC)

const ATTR_BUILDINGS = '<a href="https://overturemaps.org/" target="_blank" rel="noopener">© Overture Maps Foundation</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · Google Open Buildings · Microsoft';
const ATTR_PLACES = 'Places: <a href="https://overturemaps.org/" target="_blank" rel="noopener">Overture Maps Foundation</a>';

/** dot colour by kind of place, in TAG's palette */
const GROUP_COLOR: any = ['match', ['get', 'g'],
  'learn', '#c9a227', 'health', '#c4422b', 'food', '#d9541e', 'worship', '#e08a2b',
  'money', '#6f8fb3', 'stay', '#9c7bc4', 'gov', '#9aa59a', 'shop', '#6fae84', '#a8a29a'];

/** Building outlines, drawn under TAG's zone layers (`beforeId`). */
export function addBuildings(m: maplibregl.Map, mode: CityMode, beforeId?: string) {
  const origin = location.origin;
  const line = mode === 'photo' ? 'rgba(255,255,255,0.55)' : mode === 'day' ? 'rgba(11,11,12,0.34)' : 'rgba(237,230,218,0.32)';
  const fill = mode === 'photo' ? 'rgba(255,255,255,0.05)' : mode === 'day' ? 'rgba(11,11,12,0.08)' : 'rgba(237,230,218,0.075)';
  for (const a of AREAS) {
    const src = `tag-bldg-${a.id}`;
    if (!m.getSource(src)) m.addSource(src, { type: 'vector', tiles: [`${origin}/geo/${a.id}/{z}/{x}/{y}.pbf`], minzoom: 12, maxzoom: 16, bounds: a.bounds, attribution: ATTR_BUILDINGS });
    const at = beforeId && m.getLayer(beforeId) ? beforeId : undefined;
    m.addLayer({ id: `${src}-fill`, type: 'fill', source: src, 'source-layer': 'buildings', minzoom: 14, paint: { 'fill-color': fill } }, at);
    m.addLayer({ id: `${src}-line`, type: 'line', source: src, 'source-layer': 'buildings', minzoom: 14,
      paint: { 'line-color': line, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 17, 1, 20, 1.6] } }, at);
  }
}

/** Named places: a coloured dot from zoom 14, the name from zoom 15 (only when the map style has fonts). */
export function addPlaces(m: maplibregl.Map, mode: CityMode) {
  const origin = location.origin;
  const st = m.getStyle() as any;
  // borrow a font the current map style really serves; prefer an upright regular face over italics
  const fonts: any[] = (st?.layers ?? []).filter((l: any) => l.type === 'symbol' && Array.isArray(l.layout?.['text-font'])).map((l: any) => l.layout['text-font']);
  const plain = (f: any) => f.every((x: any) => typeof x === 'string') && f.some((x: string) => /regular/i.test(x)) && !f.some((x: string) => /italic|bold/i.test(x));
  const font = fonts.find(plain) ?? fonts.find((f) => f.every((x: any) => typeof x === 'string') && !f.some((x: string) => /italic/i.test(x))) ?? fonts[0];
  for (const a of AREAS) {
    const src = `tag-places-${a.id}`;
    if (!m.getSource(src)) m.addSource(src, { type: 'geojson', data: `${origin}/geo/${a.id}/places.json`, attribution: ATTR_PLACES });
    m.addLayer({ id: `${src}-dot`, type: 'circle', source: src, minzoom: 14,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.6, 18, 5.2], 'circle-color': GROUP_COLOR,
        'circle-stroke-color': mode === 'day' ? '#ffffff' : '#0b0b0c', 'circle-stroke-width': 1.2 } });
    if (st?.glyphs && font) {
      m.addLayer({ id: `${src}-label`, type: 'symbol', source: src, minzoom: 15,
        layout: { 'text-field': ['get', 'n'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10.5, 18, 12.5],
          'text-offset': [0, 0.85], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true, 'symbol-sort-key': ['-', 1, ['get', 'r']] },
        paint: { 'text-color': mode === 'day' ? '#2a2723' : '#ede6da', 'text-halo-color': mode === 'day' ? 'rgba(255,255,255,0.92)' : 'rgba(11,11,12,0.92)', 'text-halo-width': 1.4 } });
    }
  }
}

/* ---------- area packs: the same look, fed from a pack built for any play area on Earth ---------- */
const EMPTY = { type: 'FeatureCollection', features: [] } as any;
export function addAreaLayers(m: maplibregl.Map, mode: CityMode, beforeId?: string) {
  if (!m.getSource('tag-area-b')) m.addSource('tag-area-b', { type: 'geojson', data: EMPTY, attribution: ATTR_BUILDINGS });
  if (!m.getSource('tag-area-p')) m.addSource('tag-area-p', { type: 'geojson', data: EMPTY, attribution: ATTR_PLACES });
  const line = mode === 'photo' ? 'rgba(255,255,255,0.55)' : mode === 'day' ? 'rgba(11,11,12,0.34)' : 'rgba(237,230,218,0.32)';
  const fill = mode === 'photo' ? 'rgba(255,255,255,0.05)' : mode === 'day' ? 'rgba(11,11,12,0.08)' : 'rgba(237,230,218,0.075)';
  const at = beforeId && m.getLayer(beforeId) ? beforeId : undefined;
  m.addLayer({ id: 'tag-area-b-fill', type: 'fill', source: 'tag-area-b', minzoom: 13, paint: { 'fill-color': fill } }, at);
  m.addLayer({ id: 'tag-area-b-line', type: 'line', source: 'tag-area-b', minzoom: 13,
    paint: { 'line-color': line, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 17, 1, 20, 1.6] } }, at);
  const st = m.getStyle() as any;
  const fonts: any[] = (st?.layers ?? []).filter((l: any) => l.type === 'symbol' && Array.isArray(l.layout?.['text-font'])).map((l: any) => l.layout['text-font']);
  const font = fonts.find((f) => f.every((x: any) => typeof x === 'string') && f.some((x: string) => /regular/i.test(x)) && !f.some((x: string) => /italic|bold/i.test(x))) ?? fonts[0];
  m.addLayer({ id: 'tag-area-p-dot', type: 'circle', source: 'tag-area-p', minzoom: 14,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.6, 18, 5.2], 'circle-color': GROUP_COLOR,
      'circle-stroke-color': mode === 'day' ? '#ffffff' : '#0b0b0c', 'circle-stroke-width': 1.2 } });
  if (st?.glyphs && font) {
    m.addLayer({ id: 'tag-area-p-label', type: 'symbol', source: 'tag-area-p', minzoom: 15,
      layout: { 'text-field': ['get', 'n'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10.5, 18, 12.5],
        'text-offset': [0, 0.85], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true },
      paint: { 'text-color': mode === 'day' ? '#2a2723' : '#ede6da', 'text-halo-color': mode === 'day' ? 'rgba(255,255,255,0.92)' : 'rgba(11,11,12,0.92)', 'text-halo-width': 1.4 } });
  }
}
export function setAreaData(m: maplibregl.Map, geo: { buildings: any; places: any } | null) {
  (m.getSource('tag-area-b') as any)?.setData(geo?.buildings ?? EMPTY);
  (m.getSource('tag-area-p') as any)?.setData(geo?.places ?? EMPTY);
}
