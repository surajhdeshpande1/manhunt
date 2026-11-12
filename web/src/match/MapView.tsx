import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { bboxOf, circlePolygon, closeRing, type LngLat, type Zone } from '../lib/geo';
import { selfieUrl } from '../lib/supabase';
import { cssVar } from '../lib/theme';
import { gCopyright, gSession, googleStyle, type GKind } from '../lib/gmaps';
import { OFM_STYLE, OSM_MAP, markProviderFailed, pickMap, rememberMap, satelliteStyle, startMap, usableMaps, type MapOpt, type Provider } from '../lib/basemaps';

const STYLE = OFM_STYLE;
const OUT_RED = '#c44536';
export type Marker = { id: string; lat: number; lng: number; selfie?: string | null; role?: 'runner' | 'hunter' | null; label?: string; title?: string; me?: boolean; stale?: boolean; alert?: boolean };
export type MapHandle = { fit: (pts?: LngLat[]) => void; flyTo: (lat: number, lng: number, zoom?: number) => void; setBasemap: (k: GKind) => void; basemap: () => GKind; google: () => boolean };
type Props = {
  themeKey: string; boundary?: LngLat[] | null; nogo?: LngLat[][]; zone?: Zone | null; zoneNext?: Zone | null;
  draft?: LngLat[] | null; draftKind?: 'boundary' | 'nogo'; markers?: Marker[]; me?: { lat: number; lng: number; acc: number } | null;
  onMapClick?: (p: LngLat) => void; interactive?: boolean; showMask?: boolean; className?: string; style?: React.CSSProperties;
  fitPad?: { top: number; bottom: number; left: number; right: number };
  /** starting basemap when Google is available (remembered per device once switched) */
  basemap?: GKind;
  /** show the built-in Map / Satellite switch */
  layerToggle?: boolean;
  /** lift the Google logo and data credits above sheets that cover the bottom of the map */
  chromeBottom?: number;
  /** freehand: one finger draws a shape, two fingers move the map */
  drawMode?: 'boundary' | 'nogo' | null;
  onStroke?: (pts: LngLat[]) => void;
};
const BLANK = { version: 8 as const, sources: {}, layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': '#141416' } }] };

const empty = { type: 'FeatureCollection', features: [] } as any;
const poly = (rings: LngLat[][]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } });
const fc = (features: any[]) => ({ type: 'FeatureCollection', features });

/** Calm, high-detail recolour of the OpenFreeMap "liberty" style.
 *  Keeps the real hierarchy: campus grounds, buildings with outlines, footpaths (dashed), road classes,
 *  parks, sports pitches, water and place / building / street names. Only icons and transit clutter go. */
function recolor(map: MLMap) {
  const v = (n: string) => cssVar(n);
  const bg = v('--map-bg'), land = v('--map-land'), campus = v('--map-campus'), water = v('--map-water'), road = v('--map-road'), road2 = v('--map-road2'),
    path = v('--map-path'), build = v('--map-build'), buildLine = v('--map-build-line'), park = v('--map-park'), label = v('--map-label'), label2 = v('--map-label2');
  for (const l of map.getStyle().layers || []) {
    const id = l.id.toLowerCase();
    const set = (p: string, val: any) => { try { map.setPaintProperty(l.id, p as any, val); } catch { /* skip */ } };
    const lay = (p: string, val: any) => { try { map.setLayoutProperty(l.id, p as any, val); } catch { /* skip */ } };
    if (id.startsWith('tag-')) continue;
    switch (l.type) {
      case 'background': set('background-color', bg); break;
      case 'fill':
        if (/water|ocean|lake|river/.test(id)) { set('fill-color', water); set('fill-opacity', 1); }
        else if (/building/.test(id)) { try { map.setLayerZoomRange(l.id, 13, 24); } catch { /* skip */ } set('fill-color', build); set('fill-outline-color', buildLine); set('fill-opacity', 1); }
        else if (/school|university|college|hospital/.test(id)) { set('fill-color', campus); set('fill-opacity', 1); }
        else if (/pitch|track|stadium|sport/.test(id)) { set('fill-color', park); set('fill-opacity', 1); set('fill-outline-color', path); }
        else if (/park|grass|wood|forest|landcover|green|cemetery|golf|meadow|scrub|farm/.test(id)) { set('fill-color', park); set('fill-opacity', 0.9); }
        else if (/aeroway|pier|road|bridge|area/.test(id)) { set('fill-color', road); set('fill-opacity', 1); }
        else { set('fill-color', land); set('fill-opacity', 1); }
        break;
      case 'line':
        if (/water|river|stream|canal|drain/.test(id)) set('line-color', water);
        else if (/boundary|admin/.test(id)) { set('line-color', label2); set('line-opacity', 0.35); }
        else if (/casing/.test(id)) set('line-color', bg);
        else if (/service/.test(id)) set('line-color', road);
        else if (/path|pedestrian|footway|cycle|steps/.test(id)) { set('line-color', path); set('line-opacity', 0.9); }
        else if (/park_outline|pitch|landuse/.test(id)) { set('line-color', path); set('line-opacity', 0.4); }
        else if (/rail/.test(id)) { set('line-color', label2); set('line-opacity', 0.5); }
        else if (/motorway|trunk|primary|secondary|major/.test(id)) set('line-color', road2);
        else set('line-color', road);
        break;
      case 'fill-extrusion': lay('visibility', 'none'); break; // flat 2D buildings are drawn by the 'building' layer at every zoom
      case 'raster': case 'hillshade': lay('visibility', 'none'); break;
      case 'symbol':
        if (/shield|aerodrome|airport|transit|station|oneway|mountain|peak|ferry/.test(id)) { lay('visibility', 'none'); break; }
        set('text-color', /poi|housenum/.test(id) ? label2 : label); set('text-halo-color', bg); set('text-halo-width', 1.4);
        if (/poi/.test(id)) { set('icon-opacity', 0.55); }
        else set('icon-opacity', 0);
        break;
    }
  }
}

/** Pins slide to their new spot instead of teleporting between position updates. */
function glide(inst: maplibregl.Marker, lng: number, lat: number) {
  const from = inst.getLngLat(); const run = ((inst as any)._glide = ((inst as any)._glide ?? 0) + 1);
  const dLng = lng - from.lng, dLat = lat - from.lat; const far = Math.hypot(dLng, dLat);
  if (far < 1e-7) return;
  if (far > 0.004 || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { inst.setLngLat([lng, lat]); return; }
  const t0 = performance.now(), dur = 900;
  const step = (now: number) => {
    if ((inst as any)._glide !== run) return;
    const t = Math.min(1, (now - t0) / dur), e = 1 - (1 - t) ** 3;
    inst.setLngLat([from.lng + dLng * e, from.lat + dLat * e]);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
    setBasemap: (k) => { const o = pickMap(k); rememberMap(o); apply(o); },
    basemap: () => curRef.current.kind,
    google: () => !!sess.current,
  }));

  const [gOn, setGOn] = useState(false);
  const [cur, setCur] = useState<MapOpt>(() => startMap(p.basemap ?? 'street'));
  const [credit, setCredit] = useState('');
  const sess = useRef<string | null>(null);
  const curRef = useRef(cur);
  const satErr = useRef<{ n: number; ok: boolean; prov: Provider | null }>({ n: 0, ok: false, prov: null });
  const attr = useRef<maplibregl.AttributionControl | null>(null);

  /** free sources must show their credits; Google's are drawn by us (logo + live copyright line) */
  function setAttribution(on: boolean) {
    const m = map.current; if (!m) return;
    if (on && !attr.current) { attr.current = new maplibregl.AttributionControl({ compact: true }); m.addControl(attr.current, 'bottom-right'); }
    else if (!on && attr.current) { try { m.removeControl(attr.current); } catch { /* already gone */ } attr.current = null; }
  }
  /** a source that fails is skipped for a while and the next best one of the same kind takes over */
  function fallFrom(o: MapOpt) {
    markProviderFailed(o.provider);
    const next = pickMap(o.kind);
    if ((import.meta as any).env?.DEV) console.warn('[map] fallback', o.id, '->', next.provider === o.provider ? 'osm' : next.id);
    apply(next.provider === o.provider ? OSM_MAP : next);
  }
  async function apply(o: MapOpt) {
    const m = map.current; if (!m) return;
    curRef.current = o; setCur(o);
    if (o.provider === 'google') return applyGoogle(o);
    sess.current = null; setGOn(false); setCredit(''); setAttribution(true);
    if (o.provider === 'osm') { m.setStyle(STYLE, { diff: false }); return; }
    satErr.current = { n: 0, ok: false, prov: o.provider };
    try {
      const st = await satelliteStyle(o.provider);
      if (map.current !== m || curRef.current !== o) return;
      m.setStyle(st as any, { diff: false });
    } catch { if (map.current === m && curRef.current === o) fallFrom(o); }
  }
  async function applyGoogle(o: MapOpt) {
    const m = map.current; if (!m) return;
    try {
      const day = document.documentElement.dataset.day === '1';
      const sid = await gSession(o.kind, day);
      if (map.current !== m || curRef.current !== o) return;
      sess.current = sid; setAttribution(false); satErr.current = { n: 0, ok: false, prov: 'google' };
      m.setStyle(googleStyle(sid, o.kind) as any, { diff: false });
      setGOn(true);
    } catch {
      if (map.current !== m || curRef.current !== o) return;
      sess.current = null; setGOn(false);
      fallFrom(o);
    }
  }

  useEffect(() => {
    const first = curRef.current;
    const m = new maplibregl.Map({
      container: box.current!, style: first.provider === 'osm' ? STYLE : (BLANK as any), center: [75.6905, 16.1805], zoom: 15, maxZoom: 20, attributionControl: false,
      interactive: p.interactive !== false, pitchWithRotate: false, dragRotate: false, maxPitch: 0,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    if (first.provider === 'osm') setAttribution(true); else apply(first);
    // if the base map can't load (offline, tile server down), fall back to a plain backdrop so every game layer still shows
    let styled = false;
    const fallback = () => { if (!styled && map.current === m) { styled = true; m.setStyle(BLANK as any, { diff: false }); } };
    const fbTimer = window.setTimeout(fallback, 7000);
    m.on('error', (e: any) => {
      if ((import.meta as any).env?.DEV) console.warn('[map]', e?.sourceId ?? '', String(e?.error?.message ?? e?.error ?? '').slice(0, 200));
      if (e?.sourceId === 'sat' || e?.sourceId === 'g') {
        const s = satErr.current, o = curRef.current;
        if (!s.ok && s.prov && o.provider === s.prov && ++s.n >= 3) { s.prov = null; fallFrom(o); }
        return;
      }
      if (!styled && !m.isStyleLoaded() && /fetch|style|network|load/i.test(String(e?.error?.message ?? ''))) fallback();
    });
    m.on('sourcedata', (e: any) => { if ((e?.sourceId === 'sat' || e?.sourceId === 'g') && e.tile) satErr.current.ok = true; });
    m.on('style.load', () => {
      styled = true; clearTimeout(fbTimer);
      const srcs = (m.getStyle().sources as any) || {};
      const isGoogle = !!srcs.g, isSat = !!srcs.sat;
      const isBlank = !isGoogle && !isSat && (m.getStyle().layers || []).length === 1;
      if (!isGoogle && !isSat && !isBlank) recolor(m);
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
      m.addLayer({ id: 'tag-mask', type: 'fill', source: 'tag-mask', paint: { 'fill-color': OUT_RED, 'fill-opacity': isGoogle || isSat ? 0.22 : 0.16 } });
      m.addLayer({ id: 'tag-mask-b', type: 'fill', source: 'tag-mask-b', paint: { 'fill-color': OUT_RED, 'fill-opacity': isGoogle || isSat ? 0.18 : 0.12 } });
      m.addLayer({ id: 'tag-boundary-line-casing', type: 'line', source: 'tag-boundary', paint: { 'line-color': '#0b0b0c', 'line-width': 5, 'line-opacity': 0.55 } });
      m.addLayer({ id: 'tag-boundary-line', type: 'line', source: 'tag-boundary', paint: { 'line-color': OUT_RED, 'line-width': 3 } });
      m.addLayer({ id: 'tag-nogo-fill', type: 'fill', source: 'tag-nogo', paint: { 'fill-color': OUT_RED, 'fill-opacity': 0.38 } });
      m.addLayer({ id: 'tag-nogo-line', type: 'line', source: 'tag-nogo', paint: { 'line-color': '#9b1208', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      m.addLayer({ id: 'tag-zone-casing', type: 'line', source: 'tag-zone', paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 } });
      m.addLayer({ id: 'tag-zone-line', type: 'line', source: 'tag-zone', paint: { 'line-color': '#0f172a', 'line-width': 3 } });
      m.addLayer({ id: 'tag-zone-next-line', type: 'line', source: 'tag-zone-next', paint: { 'line-color': '#0f172a', 'line-width': 2, 'line-dasharray': [2.5, 2], 'line-opacity': 0.85 } });
      m.addLayer({ id: 'tag-acc', type: 'fill', source: 'tag-acc', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.16 } });
      m.addLayer({ id: 'tag-acc-line', type: 'line', source: 'tag-acc', paint: { 'line-color': '#3b82f6', 'line-width': 1.5, 'line-opacity': 0.7 } });
      m.addLayer({ id: 'tag-draft-fill', type: 'fill', source: 'tag-draft', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': accent, 'fill-opacity': 0.18 } });
      m.addLayer({ id: 'tag-draft-line', type: 'line', source: 'tag-draft', filter: ['!=', '$type', 'Point'], paint: { 'line-color': accent, 'line-width': 3.5, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'tag-draft-pts', type: 'circle', source: 'tag-draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': accent, 'circle-stroke-width': 3 } });
      ready.current = true;
      sync();
    });
    m.on('click', (e) => { if (!props.current.drawMode) props.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]); });
    // Google asks for its data credits to match what's on screen
    let ct = 0, lastC = 0;
    m.on('moveend', () => {
      if (!sess.current) return;
      clearTimeout(ct);
      ct = window.setTimeout(async () => {
        if (!sess.current || Date.now() - lastC < 4000) return; lastC = Date.now();
        const b = m.getBounds();
        setCredit(await gCopyright(sess.current, m.getZoom(), { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() }));
      }, 1200);
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current!);
    return () => { clearTimeout(ct); clearTimeout(fbTimer); ro.disconnect(); markers.current.forEach((mk) => mk.remove()); markers.current.clear(); m.remove(); map.current = null; ready.current = false; attr.current = null; };
  }, []);

  // ---------- freehand drawing ----------
  useEffect(() => {
    const m = map.current, el = box.current; if (!m || !el) return;
    const mode = p.drawMode;
    if (!mode) { m.cooperativeGestures.disable(); m.dragPan.enable(); m.doubleClickZoom.enable(); el.classList.remove('tag-drawing'); return; }
    m.cooperativeGestures.enable(); m.doubleClickZoom.disable(); el.classList.add('tag-drawing');
    const touches = new Set<number>();
    let stroke: LngLat[] | null = null, pid = -1;
    const at = (e: PointerEvent): LngLat => { const r = el.getBoundingClientRect(); const ll = m.unproject([e.clientX - r.left, e.clientY - r.top]); return [ll.lng, ll.lat]; };
    const preview = (pts: LngLat[]) => {
      const src = m.getSource('tag-draft') as GeoJSONSource | undefined; if (!src) return;
      src.setData((pts.length >= 2 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } } : empty) as any);
      try { const c = mode === 'nogo' ? OUT_RED : cssVar('--accent'); m.setPaintProperty('tag-draft-line', 'line-color', c); } catch { /* */ }
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); stroke = [at(e)]; pid = e.pointerId; return; }
      touches.add(e.pointerId);
      if (touches.size === 1) { stroke = [at(e)]; pid = e.pointerId; }
      else { stroke = null; pid = -1; preview([]); } // second finger: they're moving the map
    };
    const move = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== pid) return;
      if (e.pointerType === 'mouse') { e.stopPropagation(); e.preventDefault(); }
      const q = at(e), last = stroke[stroke.length - 1];
      const a = m.project(last as any), b = m.project(q as any);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 3) return;
      stroke.push(q); preview(stroke);
    };
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (!stroke || e.pointerId !== pid) return;
      const pts = stroke; stroke = null; pid = -1; preview([]);
      if (pts.length >= 6) props.current.onStroke?.(pts);
    };
    el.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [p.drawMode]);

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
    } else if (!props.current.drawMode) src('tag-draft')?.setData(empty);

    // markers
    const want = new Set<string>();
    for (const mk of props.current.markers || []) {
      want.add(mk.id);
      let inst = markers.current.get(mk.id);
      if (!inst) {
        const el = markerEl(mk);
        inst = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([mk.lng, mk.lat]).addTo(m);
        markers.current.set(mk.id, inst);
      } else glide(inst, mk.lng, mk.lat);
      updateMarkerEl(inst.getElement(), mk);
    }
    for (const [id, inst] of markers.current) if (!want.has(id)) { inst.remove(); markers.current.delete(id); }

    if (!fitted.current && boundary && boundary.length >= 3) {
      const b = bboxOf(boundary); if (b) { m.fitBounds(b, { padding: pad(), duration: 0, maxZoom: 18 }); fitted.current = true; }
    } else if (!fitted.current && me) { m.jumpTo({ center: [me.lng, me.lat], zoom: 16.5 }); fitted.current = true; }
  }
  useEffect(sync);

  const kind = cur.kind;
  const day = typeof document !== 'undefined' && document.documentElement.dataset.day === '1' && kind === 'street';
  const opts = usableMaps();
  const srcOpts = opts.filter((o) => o.kind === kind);
  const cb = p.chromeBottom ?? 0;
  return (
    <div className={`tag-map ${p.className ?? ''}`} style={{ position: 'absolute', inset: 0, ['--cb' as any]: `${cb}px`, ...p.style }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {gOn && (
        <>
          <img src={day ? '/gmaps-logo-light.svg' : '/gmaps-logo-dark.svg'} alt="Google Maps" height={18}
            style={{ position: 'absolute', left: 10, bottom: cb + 6, height: 18, width: 'auto', pointerEvents: 'none', zIndex: 3 }} />
          {credit && <div style={{ position: 'absolute', right: 4, bottom: cb + 3, maxWidth: '62%', padding: '1px 5px', borderRadius: 3, fontSize: 9.5, lineHeight: 1.3, color: day ? '#3a342c' : '#d6cec0',
            background: day ? 'rgba(239,233,223,.8)' : 'rgba(11,11,12,.6)', zIndex: 3, pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{credit}</div>}
        </>
      )}
      {p.layerToggle && opts.length > 1 && (
        <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
          <div className="row" style={{ gap: 2, padding: 3, borderRadius: 9, background: 'rgba(11,11,12,.82)', boxShadow: '0 0 0 1px rgba(237,230,218,.14)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            {(['street', 'satellite'] as GKind[]).filter((k) => opts.some((o) => o.kind === k)).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { const o = pickMap(k); rememberMap(o); apply(o); }}
                style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: kind === k ? '#0b0b0c' : '#ede6da', background: kind === k ? '#ede6da' : 'transparent', transition: 'background .2s, color .2s' }}>
                {k === 'street' ? 'Map' : 'Satellite'}
              </button>
            ))}
          </div>
          {srcOpts.length > 1 && (
            <div className="row" style={{ gap: 2, padding: 2, borderRadius: 8, background: 'rgba(11,11,12,.72)', boxShadow: '0 0 0 1px rgba(237,230,218,.12)' }}>
              {srcOpts.map((o) => (
                <button key={o.id} type="button" aria-pressed={cur.id === o.id} aria-label={`${kind === 'street' ? 'Map' : 'Satellite'} from ${o.source}`} onClick={() => { rememberMap(o); apply(o); }}
                  style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 750, color: cur.id === o.id ? '#0b0b0c' : '#cfc6b8', background: cur.id === o.id ? '#c9a227' : 'transparent' }}>
                  {o.source}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// marker styles (injected once)
const css = `
.tag-marker { display:flex; flex-direction:column; align-items:center; pointer-events:none; transition: transform .25s; }
.tag-marker .tm-pin { position:relative; width:42px; height:42px; border-radius:9px; background:var(--accent); padding:3px; box-shadow:0 0 0 2px #0b0b0c, 0 8px 18px -6px rgba(0,0,0,.6); }
.tag-marker .tm-pin::after { content:''; position:absolute; inset:-3px; border-radius:10px; border:2px solid currentColor; opacity:0; color:inherit; }
.tag-marker[data-role="runner"] .tm-pin { background:#d9541e; color:#d9541e; }
.tag-marker[data-role="hunter"] .tm-pin { background:#c9a227; color:#c9a227; }
.tag-marker .tm-img { width:100%; height:100%; background:#222 center/cover; border-radius:6px; display:grid; place-items:center; font:800 12px 'Inter Variable', system-ui; color:#fff; }
.tag-marker .tm-label { margin-top:7px; padding:2px 7px; border-radius:4px; background:rgba(11,11,12,.88); color:#ede6da; font:700 11px/1.35 'Inter Variable', system-ui; white-space:nowrap; box-shadow:0 0 0 1px rgba(237,230,218,.18); }
.tag-marker .tm-title { margin-top:3px; padding:1px 6px; border-radius:3px; box-shadow:0 0 0 1.5px #0b0b0c; font:800 9px/1.3 'Archivo Variable', system-ui; font-stretch:80%; letter-spacing:.08em; text-transform:uppercase; color:#000; background:#c9a227; }
.tag-marker[data-role="runner"] .tm-title { background:#d9541e; color:#0b0b0c; }
.tag-marker[data-me="1"] .tm-pin::after { animation: tmRing 2s cubic-bezier(.22,1,.36,1) infinite; }
.tag-marker[data-stale="1"] { opacity:.45; }
.tag-marker[data-alert="1"] .tm-pin { background:var(--danger); color:var(--danger); }
.tag-marker[data-alert="1"] .tm-pin::after { animation: tmRing .9s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes tmRing { 0% { transform:scale(1); opacity:.9; } 100% { transform:scale(2.1); opacity:0; } }
/* role life: runners glow like embers, hunters send sonar pings */
.tag-marker[data-role="runner"] .tm-pin { animation: tmEmber 1.6s ease-in-out infinite; }
.tag-marker[data-role="hunter"] .tm-pin::before { content:''; position:absolute; inset:-3px; border-radius:10px; border:2px solid #c9a227; animation: tmSonar 2.4s cubic-bezier(.2,.8,.3,1) infinite; }
@keyframes tmEmber { 0%,100% { transform:scale(1); } 50% { transform:scale(1.06); } }
@keyframes tmSonar { 0% { transform:scale(1); opacity:.95; } 100% { transform:scale(2.8); opacity:0; } }
/* freehand drawing: one finger draws (no page scroll), two fingers move the map */
.tag-drawing .maplibregl-canvas-container, .tag-drawing .maplibregl-canvas { touch-action: none !important; cursor: crosshair !important; }
.tag-drawing .maplibregl-cooperative-gesture-screen { display: none !important; }
/* map credits stay visible above any sheet covering the bottom of the map */
.tag-map .maplibregl-ctrl-bottom-right { bottom: var(--cb, 0px); }
.tag-map .maplibregl-ctrl-attrib { font-size: 10px; background: rgba(11,11,12,.66) !important; color: #d6cec0 !important; }
.tag-map .maplibregl-ctrl-attrib a { color: #ede6da !important; }
@media (prefers-reduced-motion: reduce) { .tag-marker .tm-pin, .tag-marker .tm-pin::before, .tag-marker .tm-pin::after { animation:none !important; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tag-marker-css')) {
  const s = document.createElement('style'); s.id = 'tag-marker-css'; s.textContent = css; document.head.appendChild(s);
}
