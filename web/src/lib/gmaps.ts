/**
 * Google Maps tiles (Map Tiles API, 2D) drawn inside MapLibre, so every game layer keeps working.
 * Needs VITE_GOOGLE_MAPS_KEY at build time. Without it, or if Google refuses, the free map is used.
 */
export const GKEY: string | undefined = (import.meta as any).env?.VITE_GOOGLE_MAPS_KEY || undefined;
export type GKind = 'street' | 'satellite';
const V = 4;
const FAIL = 'tag-gmaps-fail';

// TAG ink: quiet graphite city, warm roads, every label kept
const NIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#141416' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b9b1a4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b0c' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a3a40' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#ede6da' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#1e1e22' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#34343b' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#151715' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1a1a1d' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9c9488' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -65 }, { lightness: -10 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#17221b' }] },
  { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: '#1f1c22' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2b2b31' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111113' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#d6cec0' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#36363d' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#4a3d2a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1c1610' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a2a30' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1820' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f6d80' }] },
];
const DAY = [
  { elementType: 'geometry', stylers: [{ color: '#efe9df' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#3a342c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#efe9df' }, { weight: 3 }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#e3dcd0' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#cbc2b3' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -45 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d5e1c9' }] },
  { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: '#e6ddd6' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d6cdbf' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#f4d7a6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#dcb574' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b6ccd8' }] },
];

export function googleBlocked() {
  if (!GKEY) return true;
  try { const t = Number(sessionStorage.getItem(FAIL) || 0); return Date.now() - t < 10 * 60e3; } catch { return false; }
}
function markFail() { try { sessionStorage.setItem(FAIL, String(Date.now())); } catch { /* ignore */ } }

/** A Map Tiles session is valid for ~2 weeks; reuse it across launches. */
export async function gSession(kind: GKind, day: boolean): Promise<string> {
  const id = `tag-gsess-${kind}-${kind === 'street' ? (day ? 'day' : 'night') : 'sat'}-v${V}`;
  try {
    const c = JSON.parse(localStorage.getItem(id) || 'null');
    if (c && Number(c.expiry) * 1000 > Date.now() + 3600e3) return c.session;
  } catch { /* ignore */ }
  const body: Record<string, unknown> = { mapType: kind === 'street' ? 'roadmap' : 'satellite', language: 'en-IN', region: 'IN', scale: 'scaleFactor2x', highDpi: true };
  if (kind === 'street') body.styles = day ? DAY : NIGHT;
  else body.layerTypes = ['layerRoadmap'];
  const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${GKEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { markFail(); throw new Error(`Google tiles refused (${r.status})`); }
  const j = await r.json();
  try { localStorage.setItem(id, JSON.stringify({ session: j.session, expiry: j.expiry })); } catch { /* ignore */ }
  return j.session as string;
}
export function googleStyle(session: string, kind: GKind) {
  return {
    version: 8 as const,
    sources: { g: { type: 'raster' as const, tiles: [`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${GKEY}`], tileSize: 256, maxzoom: kind === 'satellite' ? 19 : 21 } },
    layers: [{ id: 'g-base', type: 'raster' as const, source: 'g', paint: { 'raster-fade-duration': 150 } }],
  };
}
/** The data attribution Google asks us to show for the current view. */
export async function gCopyright(session: string, zoom: number, b: { n: number; s: number; e: number; w: number }) {
  try {
    const u = `https://tile.googleapis.com/tile/v1/viewport?session=${session}&key=${GKEY}&zoom=${Math.max(0, Math.round(zoom))}&north=${b.n}&south=${b.s}&east=${b.e}&west=${b.w}`;
    const r = await fetch(u); if (!r.ok) return '';
    return String((await r.json()).copyright || '');
  } catch { return ''; }
}
export function basemapPref(fallback: GKind): GKind { try { const v = localStorage.getItem('tag-basemap'); return v === 'street' || v === 'satellite' ? v : fallback; } catch { return fallback; } }
export function saveBasemapPref(k: GKind) { try { localStorage.setItem('tag-basemap', k); } catch { /* ignore */ } }
