/// <reference lib="webworker" />
/* Builds an area pack off the main thread: { box } in, progress messages and { pack } out. */
import { latestRelease, readBox, type BBox } from './overture';
import { makePack } from './areaPack';

self.onmessage = async (e: MessageEvent<{ box: BBox }>) => {
  const { box } = e.data;
  const post = (m: any) => (self as any).postMessage(m);
  try {
    const release = await latestRelease();
    let bDone = 0, bTotal = 1, pDone = 0, pTotal = 1;
    const tell = () => post({ progress: Math.round(((bDone / Math.max(bTotal, 1)) * 0.8 + (pDone / Math.max(pTotal, 1)) * 0.2) * 100) });
    const [buildings, places] = await Promise.all([
      readBox('buildings', 'building', box, ['geometry'], (d, t) => { bDone = d; bTotal = t; tell(); }),
      readBox('places', 'place', box, ['geometry', 'names', 'basic_category', 'confidence'], (d, t) => { pDone = d; pTotal = t; tell(); }),
    ]);
    post({ pack: makePack(release, box, buildings, places) });
  } catch (err) {
    post({ error: String((err as Error)?.message ?? err) });
  }
};
