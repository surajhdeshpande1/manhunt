import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { bboxOf, circlePolygon, closeRing, type LngLat, type Zone } from '../lib/geo';
import { selfieUrl } from '../lib/supabase';
import { cssVar } from '../lib/theme';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export type Marker = { id: string; lat: number; lng: number; selfie?: string | null; role?: 'runner' | 'hunter' | null; label?: string; me?: boolean; stale?: boolean; alert?: boolean };
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
  el.innerHTML = `<div class="tm-pin"><div class="tm-img"></div></div><div class="tm-label"></div>`;
  return el;
}
function updateMarkerEl(el: HTMLElement, m: Marker) {
  el.dataset.role = m.role || ''; el.dataset.me = m.me ? '1' : ''; el.dataset.stale = m.stale ? '1' : ''; el.dataset.alert = m.alert ? '1' : '';
  const img = el.querySelector('.tm-img') as HTMLElement;
  const url = selfieUrl(m.selfie);
  const bg = url ? `url("${url}")` : '';
  if (img.dataset.bg !== bg) { img.style.backgroundImage = bg; img.dataset.bg = bg; img.textContent = url ? '' : (m.label || '?').slice(0, 2).toUpperCase(); }
  (el.querySelector('.tm-label') as HTMLElement).textContent = m.me ? 'YOU' : m.label || '';
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
      recolor(m);
      const accent = cssVar('--accent'), danger = cssVar('--danger'), text = cssVar('--text'), bg = cssVar('--bg');
      m.addSource('tag-mask', { type: 'geojson', data: empty });
      m.addSource('tag-boundary', { type: 'geojson', data: empty });
      m.addSource('tag-nogo', { type: 'geojson', data: empty });
      m.addSource('tag-zone', { type: 'geojson', data: empty });
      m.addSource('tag-zone-next', { type: 'geojson', data: empty });
      m.addSource('tag-draft', { type: 'geojson', data: empty });
      m.addSource('tag-acc', { type: 'geojson', data: empty });
      m.addLayer({ id: 'tag-mask', type: 'fill', source: 'tag-mask', paint: { 'fill-color': bg, 'fill-opacity': 0.62 } });
      m.addLayer({ id: 'tag-boundary-fill', type: 'fill', source: 'tag-boundary', paint: { 'fill-color': accent, 'fill-opacity': 0.05 } });
      m.addLayer({ id: 'tag-boundary-line', type: 'line', source: 'tag-boundary', paint: { 'line-color': accent, 'line-width': 2.5, 'line-opacity': 0.95 } });
      m.addLayer({ id: 'tag-nogo-fill', type: 'fill', source: 'tag-nogo', paint: { 'fill-color': danger, 'fill-opacity': 0.22 } });
      m.addLayer({ id: 'tag-nogo-line', type: 'line', source: 'tag-nogo', paint: { 'line-color': danger, 'line-width': 1.5, 'line-dasharray': [2, 1.5] } });
      m.addLayer({ id: 'tag-zone-line', type: 'line', source: 'tag-zone', paint: { 'line-color': text, 'line-width': 2, 'line-opacity': 0.9 } });
      m.addLayer({ id: 'tag-zone-next-line', type: 'line', source: 'tag-zone-next', paint: { 'line-color': accent, 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } });
      m.addLayer({ id: 'tag-acc', type: 'fill', source: 'tag-acc', paint: { 'fill-color': accent, 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'tag-draft-fill', type: 'fill', source: 'tag-draft', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': accent, 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'tag-draft-line', type: 'line', source: 'tag-draft', filter: ['!=', '$type', 'Point'], paint: { 'line-color': accent, 'line-width': 2, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'tag-draft-pts', type: 'circle', source: 'tag-draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': bg, 'circle-stroke-color': accent, 'circle-stroke-width': 2.5 } });
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
      recolor(m);
      const accent = cssVar('--accent'), danger = cssVar('--danger'), text = cssVar('--text'), bg = cssVar('--bg');
      const s = (l: string, k: string, v: string) => { try { m.setPaintProperty(l, k as any, v); } catch { /* */ } };
      s('tag-mask', 'fill-color', bg); s('tag-boundary-fill', 'fill-color', accent); s('tag-boundary-line', 'line-color', accent);
      s('tag-nogo-fill', 'fill-color', danger); s('tag-nogo-line', 'line-color', danger); s('tag-zone-line', 'line-color', text);
      s('tag-zone-next-line', 'line-color', accent); s('tag-acc', 'fill-color', accent);
      s('tag-draft-fill', 'fill-color', accent); s('tag-draft-line', 'line-color', accent); s('tag-draft-pts', 'circle-stroke-color', accent); s('tag-draft-pts', 'circle-color', bg);
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
    const hole = zone ? circlePolygon(zone) : boundary && boundary.length >= 3 ? closeRing(boundary) : null;
    src('tag-mask')?.setData(showMask !== false && hole ? poly([[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], [...hole].reverse()]) as any : empty);
    src('tag-acc')?.setData(me && me.acc ? poly([circlePolygon({ lat: me.lat, lng: me.lng, r: me.acc }, 40)]) as any : empty);
    if (draft && draft.length) {
      const feats: any[] = draft.map((pt) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pt } }));
      if (draft.length >= 3) feats.push(poly([closeRing(draft)]));
      else if (draft.length === 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft } });
      src('tag-draft')?.setData(fc(feats) as any);
      try {
        const c = draftKind === 'nogo' ? cssVar('--danger') : cssVar('--accent');
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
.tag-marker .tm-pin { width:38px; height:44px; background:var(--accent); clip-path:polygon(0 0,100% 0,100% 78%,50% 100%,0 78%); padding:2px; filter: drop-shadow(0 4px 8px rgba(0,0,0,.45)); }
.tag-marker[data-role="runner"] .tm-pin { background:#ff6214; }
.tag-marker[data-role="hunter"] .tm-pin { background:#ffd000; }
.tag-marker .tm-img { width:100%; height:34px; background:#222 center/cover; clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px)); display:grid; place-items:center; font:700 12px 'Barlow Condensed'; color:#fff; }
.tag-marker .tm-label { margin-top:2px; padding:1px 5px; background:var(--bg); color:var(--text); font:700 10px/1.3 'Barlow Condensed'; letter-spacing:.12em; text-transform:uppercase; white-space:nowrap; }
.tag-marker[data-me="1"] .tm-pin { animation: tmPulse 1.6s ease-in-out infinite; }
.tag-marker[data-stale="1"] { opacity:.45; }
.tag-marker[data-alert="1"] .tm-pin { background:var(--danger); animation: tmPulse .6s ease-in-out infinite; }
@keyframes tmPulse { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tag-marker-css')) {
  const s = document.createElement('style'); s.id = 'tag-marker-css'; s.textContent = css; document.head.appendChild(s);
}
