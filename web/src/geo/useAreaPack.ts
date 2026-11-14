import { useEffect, useMemo, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import { DEMO } from '../demo/mode';
import { areaBox, boundaryKey, shippedCovers, type AreaPack } from './areaPack';
import type { BBox } from './overture';

type LngLat = { lng: number; lat: number } | [number, number];
const mem = new Map<string, AreaPack>();

/** Build a pack for a box on a background thread. */
export function buildPack(box: BBox, onProgress?: (pct: number) => void): Promise<AreaPack> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./areaWorker.ts', import.meta.url), { type: 'module' });
    const stop = setTimeout(() => { w.terminate(); reject(new Error('timed out')); }, 180_000);
    w.onmessage = (e) => {
      const d = e.data;
      if (typeof d.progress === 'number') onProgress?.(d.progress);
      if (d.pack) { clearTimeout(stop); w.terminate(); resolve(d.pack); }
      if (d.error) { clearTimeout(stop); w.terminate(); reject(new Error(d.error)); }
    };
    w.onerror = (e) => { clearTimeout(stop); w.terminate(); reject(new Error(e.message || 'worker failed')); };
    w.postMessage({ box });
  });
}

/** One download per area even when several maps on screen want it at once; the first to finish saves it for everyone. */
type Job = { p: Promise<AreaPack>; pct: number; subs: Set<(v: number) => void> };
const jobs = new Map<string, Job>();
function buildShared(key: string, box: BBox, save: string | null, onProgress: (v: number) => void) {
  let j = jobs.get(key);
  if (!j) {
    const job: Job = { pct: 0, subs: new Set(), p: Promise.resolve(null as unknown as AreaPack) };
    job.p = buildPack(box, (v) => { job.pct = v; job.subs.forEach((f) => f(v)); })
      .then(async (pack) => {
        mem.set(key, pack);
        if (save && !DEMO) {
          await supabase.storage.from('areas').upload(save, new Blob([JSON.stringify(pack)], { type: 'application/json' }),
            { upsert: true, contentType: 'application/json', cacheControl: '31536000' }).catch(() => undefined);
        }
        return pack;
      })
      .finally(() => jobs.delete(key));
    jobs.set(key, job); j = job;
  }
  const job = j;
  job.subs.add(onProgress); onProgress(job.pct);
  return { p: job.p, off: () => { job.subs.delete(onProgress); } };
}
const isPack = (p: any): p is AreaPack => !!p && p.v === 1 && Array.isArray(p.b) && Array.isArray(p.p) && Array.isArray(p.bbox);
/** the phone asked apps to go easy on data: don't start a big download without being asked */
const saveData = () => typeof navigator !== 'undefined' && (navigator as any).connection?.saveData === true;

export type PackStatus = 'idle' | 'loading' | 'building' | 'ready' | 'error';
/**
 * Buildings and named places for a room's play area, anywhere in the world.
 * Players load the saved pack; the host's device builds and saves it when there isn't one yet.
 * Areas TAG already ships detail for (Bagalkot) need no pack.
 */
export function useAreaPack(roomId: string | undefined, boundary: LngLat[] | null | undefined, isHost: boolean) {
  const [pack, setPack] = useState<AreaPack | null>(null);
  const [status, setStatus] = useState<PackStatus>('idle');
  const [progress, setProgress] = useState(0);
  const sig = boundary && boundary.length >= 3 ? JSON.stringify(boundary) : '';
  useEffect(() => {
    if (!roomId || !sig) { setPack(null); setStatus('idle'); return; }
    const pts: LngLat[] = JSON.parse(sig);
    const box = areaBox(pts);
    if (shippedCovers(box)) { setPack(null); setStatus('idle'); return; }
    const key = `${roomId}-${boundaryKey(pts)}`;
    if (mem.has(key)) { setPack(mem.get(key)!); setStatus('ready'); return; }
    let dead = false, retry: ReturnType<typeof setTimeout> | null = null, tries = 0;
    const url = `${SUPABASE_URL}/storage/v1/object/public/areas/rooms/${key}.json`;
    const load = async () => {
      setStatus('loading');
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (r.ok) {
          const p = (await r.json()) as AreaPack;
          if (dead) return;
          if (isPack(p)) { mem.set(key, p); setPack(p); setStatus('ready'); return; }
        }
      } catch { /* offline or not there yet */ }
      if (dead) return;
      if (!isHost) { // the host's device is still building it: look again shortly
        setStatus('idle');
        if (++tries < 12) retry = setTimeout(load, 15_000);
        return;
      }
      // already holding a pack that covers this area (a small edit, or the view loaded while drawing it)? reuse it
      const cover = [...mem.values()].find((q) => q.bbox[0] <= box[0] && q.bbox[1] <= box[1] && q.bbox[2] >= box[2] && q.bbox[3] >= box[3]);
      if (cover) {
        mem.set(key, cover); setPack(cover); setStatus('ready');
        if (!DEMO) supabase.storage.from('areas').upload(`rooms/${key}.json`, new Blob([JSON.stringify(cover)], { type: 'application/json' }),
          { upsert: true, contentType: 'application/json', cacheControl: '31536000' }).catch(() => undefined);
        return;
      }
      if (saveData()) { setStatus('idle'); return; }
      setStatus('building'); setProgress(0);
      const job = buildShared(key, box, `rooms/${key}.json`, (v) => { if (!dead) setProgress(v); });
      off = job.off;
      try {
        const p = await job.p;
        if (!dead) { setPack(p); setStatus('ready'); }
      } catch { if (!dead) setStatus('error'); }
    };
    let off: (() => void) | null = null;
    load();
    return () => { dead = true; if (retry) clearTimeout(retry); off?.(); };
  }, [roomId, sig, isHost]);
  return { pack, status, progress };
}

/** A one-off pack for whatever the map is showing (used while drawing a new area); kept for this session only. */
export function useViewPack() {
  const [pack, setPack] = useState<AreaPack | null>(null);
  const [status, setStatus] = useState<PackStatus>('idle');
  const [progress, setProgress] = useState(0);
  const run = useMemo(() => async (box: BBox) => {
    const key = box.map((v) => v.toFixed(3)).join(',');
    if (mem.has(key)) { setPack(mem.get(key)!); setStatus('ready'); return; }
    setStatus('building'); setProgress(0);
    const job = buildShared(key, box, null, setProgress);
    try { const p = await job.p; setPack(p); setStatus('ready'); }
    catch { setStatus('error'); }
    finally { job.off(); }
  }, []);
  return { pack, status, progress, run };
}
