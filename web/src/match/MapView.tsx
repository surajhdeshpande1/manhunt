import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { bboxOf, circlePolygon, closeRing, type LngLat, type Zone } from '../lib/geo';
import { selfieUrl } from '../lib/supabase';
import { cssVar } from '../lib/theme';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OUT_RED = '#ff453a';
export type Marker = { id: string; lat: number; lng: number; selfie?: string | null; role?: 'runner' | 'hunter' | null; label?: string; title?: string; me?: boolean; stale?: boolean; alert?: boolean };
export type MapHandle = { fit: (pts?: LngLat[]) => void; flyTo: (lat: number, lng: number, zoom?: number) => void };
type Props = {
  themeKey: string; boundary?: LngLat[] | null; nogo?: LngLat[][]; zone?: Zone | null; zoneNext?: Zone | null;
  draft?: LngLat[] | null; draftKind?: 'boundary' | 'nogo'; markers?: Marker[]; me?: { lat: number; lng: number; acc: number } | null;
  onMapClick?: (p: LngLat) => void; interactive?: boolean; showMask?: boolean; className?: string; style?: React.CSSProperties;
  fitPad?: { top: number; bottom: number; left: number; right: number };
};

const empty = { type: 'FeatureCollection', features: [] } as any;
const poly = (rings: LngLat[][]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } });
const fc = (features: any[]) => ({ type: 'FeatureCollection', features });

function recolor(map: MLMap) {
  const v = (n: string) => cssVar(n);
  const bg = v('--map-bg'), water = v('--map-water'), road = v('--map-road'), road2 = v('--map-road2'), build = v('--map-build'), park = v('--map-park'), label = v('--map-label');
  for (const l of map.getStyle().layers || []) {
    const id = l.id.toLowerCase();
    const set = (p: string, val: any) => { try { map.setPaintProperty(l.id, p as any, val); } catch { /* skip */ } };
    const hide = () => { try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch { /* skip */ } };
    if (id.startsWith('tag-')) continue;
    switch (l.type) {
      case 'background': set('background-color', bg); break;
      case 'fill':
        if (/water|ocean|lake|river/.test(id)) set('fill-color', water);
        else if (/building/.test(id)) { set('fill-color', build); set('fill-outline-color', road); }
        else if (/park|grass|wood|forest|landcover|green|cemetery|pitch|golf/.test(id)) { set('fill-color', park); set('fill-opacity', 0.8); }
        else if (/aeroway|pier|road|bridge/.test(id)) set('fill-color', road);
        else { set('fill-color', bg); set('fill-opacity', 0.6); }
        break;
      case 'line':
        if (/water|river|stream|canal/.test(id)) set('line-color', water);
        else if (/boundary|admin/.test(id)) { set('line-color', road); set('line-opacity', 0.6); }
        else if (/motorway|trunk|primary|major/.test(id)) set('line-color', road2);
        else set('line-color', road);
        if (/casing/.test(id)) set('line-color', bg);
        break;
      case 'fill-extrusion': hide(); break;
      case 'raster': case 'hillshade': hide(); break;
      case 'symbol':
        if (/poi|shield|aerodrome|airport|transit|station|oneway|mountain/.test(id)) { hide(); break; }
        set('text-color', label); set('text-halo-color', bg); set('text-halo-width', 1.2); set('icon-opacity', 0);
        break;
    }
  }
}

function markerEl(m: Marker) {
  const el = document.createElement('div');
  el.className = 'tag-marker';
  el.innerHTML = `<div class="tm-pin"><div class="tm-img"></div></div><div class="tm-label"></div><div class="tm-title"></div>`;
  return el;
}
function updateMarkerEl(el: HTMLElement, m: Marker) {
  el.dataset.role = m.role || ''; el.dataset.me = m.me ? '1' : ''; el.dataset.stale = m.stale ? '1' : ''; el.dataset.alert = m.alert ? '1' : '';
  const img = el.querySelector('.tm-img') as HTMLElement;
  const url = selfieUrl(m.selfie);
  const bg = url ? `url("${url}")` : '';
  if (img.dataset.bg !== bg) { img.style.backgroundImage = bg; img.dataset.bg = bg; img.textContent = url ? '' : (m.label || '?').slice(0, 2).toUpperCase(); }
  (el.querySelector('.tm-label') as HTMLElement).textContent = m.me ? 'YOU' : m.label || '';
  const t = el.querySelector('.tm-title') as HTMLElement; t.textContent = m.title || ''; t.style.display = m.title ? '' : 'none';
}

export const MapView = forwardRef<MapHandle, Props>(function MapView(p, ref) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const fitted = useRef(false);
  const props = useRef(p);
  props.current = p;
  const pad = () => {
    if (props.current.fitPad) return props.current.fitPad;
    const h = box.current?.clientHeight ?? 400, w = box.current?.clientWidth ?? 400;
    return { top: Math.round(h * 0.1), bottom: Math.round(h * 0.1), left: Math.round(w * 0.08), right: Math.round(w * 0.08) };
  };

  useImperativeHandle(ref, () => ({
    fit: (pts) => {
      const b = bboxOf(pts || props.current.boundary || []);
      if (b && map.current) map.current.fitBounds(b, { padding: pad(), duration: 600, maxZoom: 18 });
    },
    flyTo: (lat, lng, zoom = 17) => map.current?.flyTo({ center: [lng, lat], zoom, duration: 700 }),
  }));

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!, style: STYLE, center: [75.6905, 16.1805], zoom: 15, attributionControl: { compact: true },
      interactive: p.interactive !== false, pitchWithRotate: false, dragRotate: false, maxPitch: 0,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    m.on('style.load', () => {
      const accent = cssVar('--accent');
      m.addSource('tag-mask', { type: 'geojson', data: empty });
      m.addSource('tag-mask-b', { type: 'geojson', data: empty });
      m.addSource('tag-boundary', { type: 'geojson', data: empty });
      m.addSource('tag-nogo', { type: 'geojson', data: empty });
      m.addSource('tag-zone', { type: 'geojson', data: empty });
      m.addSource('tag-zone-next', { type: 'geojson', data: empty });
      m.addSource('tag-draft', { type: 'geojson', data: empty });
      m.addSource('tag-acc', { type: 'geojson', data: empty });
      // everything players must stay out of is tinted translucent red; the map stays readable underneath
      m.addLayer({ id: 'tag-mask', type: 'fill', source: 'tag-mask', paint: { 'fill-color': OUT_RED, 'fill-opacity': 0.16 } });
      m.addLayer({ id: 'tag-mask-b', type: 'fill', source: 'tag-mask-b', paint: { 'fill-color': OUT_RED, 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'tag-boundary-line-casing', type: 'line', source: 'tag-boundary', paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.85 } });
      m.addLayer({ id: 'tag-boundary-line', type: 'line', source: 'tag-boundary', paint: { 'line-color': OUT_RED, 'line-width': 3 } });
      m.addLayer({ id: 'tag-nogo-fill', type: 'fill', source: 'tag-nogo', paint: { 'fill-color': OUT_RED, 'fill-opacity': 0.38 } });
      m.addLayer({ id: 'tag-nogo-line', type: 'line', source: 'tag-nogo', paint: { 'line-color': '#9b1208', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      m.addLayer({ id: 'tag-zone-casing', type: 'line', source: 'tag-zone', paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 } });
      m.addLayer({ id: 'tag-zone-line', type: 'line', source: 'tag-zone', paint: { 'line-color': '#0f172a', 'line-width': 3 } });
      m.addLayer({ id: 'tag-zone-next-line', type: 'line', source: 'tag-zone-next', paint: { 'line-color': '#0f172a', 'line-width': 2, 'line-dasharray': [2.5, 2], 'line-opacity': 0.85 } });
      m.addLayer({ id: 'tag-acc', type: 'fill', source: 'tag-acc', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.14 } });
      m.addLayer({ id: 'tag-draft-fill', type: 'fill', source: 'tag-draft', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': accent, 'fill-opacity': 0.18 } });
      m.addLayer({ id: 'tag-draft-line', type: 'line', source: 'tag-draft', filter: ['!=', '$type', 'Point'], paint: { 'line-color': accent, 'line-width': 3, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'tag-draft-pts', type: 'circle', source: 'tag-draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': accent, 'circle-stroke-width': 3 } });
      ready.current = true;
      sync();
    });
    m.on('click', (e) => props.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]));
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current!);
    return () => { ro.disconnect(); markers.current.forEach((mk) => mk.remove()); markers.current.clear(); m.remove(); map.current = null; ready.current = false; };
  }, []);

  // theme switch: recolour base map + overlays
  useEffect(() => {
    const m = map.current; if (!m || !ready.current) return;
    requestAnimationFrame(() => {
      const accent = cssVar('--accent');
      const s = (l: string, k: string, v: string) => { try { m.setPaintProperty(l, k as any, v); } catch { /* */ } };
      s('tag-draft-fill', 'fill-color', accent); s('tag-draft-line', 'line-color', accent); s('tag-draft-pts', 'circle-stroke-color', accent);
    });
  }, [p.themeKey]);

  function sync() {
    const m = map.current; if (!m || !ready.current) return;
    const { boundary, nogo, zone, zoneNext, draft, draftKind, me, showMask } = props.current;
    const src = (id: string) => m.getSource(id) as GeoJSONSource | undefined;
    src('tag-boundary')?.setData(boundary && boundary.length >= 3 ? poly([closeRing(boundary)]) as any : empty);
    src('tag-nogo')?.setData(fc((nogo || []).filter((r) => r.length >= 3).map((r) => poly([closeRing(r)]))) as any);
    src('tag-zone')?.setData(zone ? poly([circlePolygon(zone)]) as any : empty);
    src('tag-zone-next')?.setData(zoneNext ? poly([circlePolygon(zoneNext)]) as any : empty);
    // darken everything outside the live zone (or outside the boundary when there is no zone yet)
    // tint everything outside the safe zone AND everything outside the boundary (overlap reads darker)
    const world: LngLat[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const ring = boundary && boundary.length >= 3 ? closeRing(boundary) : null;
    src('tag-mask')?.setData(showMask !== false && zone ? poly([world, [...circlePolygon(zone)].reverse()]) as any : empty);
    src('tag-mask-b')?.setData(showMask !== false && ring ? poly([world, [...ring].reverse()]) as any : empty);
    src('tag-acc')?.setData(me && me.acc ? poly([circlePolygon({ lat: me.lat, lng: me.lng, r: me.acc }, 40)]) as any : empty);
    if (draft && draft.length) {
      const feats: any[] = draft.map((pt) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pt } }));
      if (draft.length >= 3) feats.push(poly([closeRing(draft)]));
      else if (draft.length === 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft } });
      src('tag-draft')?.setData(fc(feats) as any);
      try {
        const c = draftKind === 'nogo' ? OUT_RED : cssVar('--accent');
        m.setPaintProperty('tag-draft-line', 'line-color', c); m.setPaintProperty('tag-draft-fill', 'fill-color', c); m.setPaintProperty('tag-draft-pts', 'circle-stroke-color', c);
      } catch { /* */ }
    } else src('tag-draft')?.setData(empty);

    // markers
    const want = new Set<string>();
    for (const mk of props.current.markers || []) {
      want.add(mk.id);
      let inst = markers.current.get(mk.id);
      if (!inst) {
        const el = markerEl(mk);
        inst = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([mk.lng, mk.lat]).addTo(m);
        markers.current.set(mk.id, inst);
      } else inst.setLngLat([mk.lng, mk.lat]);
      updateMarkerEl(inst.getElement(), mk);
    }
    for (const [id, inst] of markers.current) if (!want.has(id)) { inst.remove(); markers.current.delete(id); }

    if (!fitted.current && boundary && boundary.length >= 3) {
      const b = bboxOf(boundary); if (b) { m.fitBounds(b, { padding: pad(), duration: 0, maxZoom: 18 }); fitted.current = true; }
    } else if (!fitted.current && me) { m.jumpTo({ center: [me.lng, me.lat], zoom: 16.5 }); fitted.current = true; }
  }
  useEffect(sync);

  return <div ref={box} className={p.className} style={{ position: 'absolute', inset: 0, ...p.style }} />;
});

// marker styles (injected once)
const css = `
.tag-marker { display:flex; flex-direction:column; align-items:center; pointer-events:none; transition: transform .25s; }
.tag-marker .tm-pin { position:relative; width:42px; height:42px; border-radius:9px; background:var(--accent); padding:3px; box-shadow:0 0 0 2.5px #14110f, 3px 3px 0 2.5px #14110f; }
.tag-marker .tm-pin::after { content:''; position:absolute; inset:-3px; border-radius:10px; border:2px solid currentColor; opacity:0; color:inherit; }
.tag-marker[data-role="runner"] .tm-pin { background:#ff6a1a; color:#ff6a1a; }
.tag-marker[data-role="hunter"] .tm-pin { background:#ffd400; color:#ffd400; }
.tag-marker .tm-img { width:100%; height:100%; background:#222 center/cover; border-radius:6px; display:grid; place-items:center; font:800 12px 'Inter Variable', system-ui; color:#fff; }
.tag-marker .tm-label { margin-top:7px; padding:2px 7px; border-radius:4px; background:#14110f; color:#fff2e0; font:800 11px/1.35 'Inter Variable', system-ui; white-space:nowrap; box-shadow:0 0 0 1.5px #fff2e0; }
.tag-marker .tm-title { margin-top:3px; padding:1px 6px; border-radius:3px; box-shadow:0 0 0 1.5px #14110f; font:800 9px/1.3 'Archivo Variable', system-ui; font-stretch:80%; letter-spacing:.08em; text-transform:uppercase; color:#000; background:#ffd400; }
.tag-marker[data-role="runner"] .tm-title { background:#ff6a1a; color:#170700; }
.tag-marker[data-me="1"] .tm-pin::after { animation: tmRing 2s cubic-bezier(.22,1,.36,1) infinite; }
.tag-marker[data-stale="1"] { opacity:.45; }
.tag-marker[data-alert="1"] .tm-pin { background:var(--danger); color:var(--danger); }
.tag-marker[data-alert="1"] .tm-pin::after { animation: tmRing .9s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes tmRing { 0% { transform:scale(1); opacity:.9; } 100% { transform:scale(2.1); opacity:0; } }
/* role life: runners glow like embers, hunters send sonar pings */
.tag-marker[data-role="runner"] .tm-pin { animation: tmEmber 1.6s ease-in-out infinite; }
.tag-marker[data-role="hunter"] .tm-pin::before { content:''; position:absolute; inset:-3px; border-radius:10px; border:3px solid #ffd400; animation: tmSonar 2.4s cubic-bezier(.2,.8,.3,1) infinite; }
@keyframes tmEmber { 0%,100% { transform:translate(0,0); box-shadow:0 0 0 2.5px #14110f, 3px 3px 0 2.5px #14110f; } 50% { transform:translate(-2px,-2px); box-shadow:0 0 0 2.5px #14110f, 5px 5px 0 2.5px #e8361f; } }
@keyframes tmSonar { 0% { transform:scale(1); opacity:.95; } 100% { transform:scale(2.8); opacity:0; } }
@media (prefers-reduced-motion: reduce) { .tag-marker .tm-pin, .tag-marker .tm-pin::before, .tag-marker .tm-pin::after { animation:none !important; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tag-marker-css')) {
  const s = document.createElement('style'); s.id = 'tag-marker-css'; s.textContent = css; document.head.appendChild(s);
}
