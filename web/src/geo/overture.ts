/**
 * Reads Overture Maps' open GeoParquet straight from their public bucket, fetching only the byte ranges
 * that cover a box (HTTP range requests; the bucket allows browser access). Works anywhere on Earth,
 * no keys or accounts. Buildings: OpenStreetMap + Google Open Buildings + Microsoft (ODbL). Places: CDLA-Permissive-2.0.
 */
import { asyncBufferFromUrl, cachedAsyncBuffer, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export type BBox = [number, number, number, number]; // west, south, east, north
const STAC = 'https://stac.overturemaps.org';

async function getJSON(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
let release: Promise<string> | null = null;
export const latestRelease = () =>
  (release ??= getJSON(`${STAC}/catalog.json`).then((c) => String(c.latest)).catch((e) => { release = null; throw e; }));

const collections = new Map<string, Promise<any>>();
/** the files of a theme whose extent touches the box */
async function filesFor(theme: string, type: string, box: BBox) {
  const rel = await latestRelease();
  const key = `${rel}/${theme}/${type}`;
  if (!collections.has(key)) collections.set(key, getJSON(`${STAC}/${key}/collection.json`).catch((e) => { collections.delete(key); throw e; }));
  const c = await collections.get(key);
  const boxes: number[][] = c.extent.spatial.bbox; // [0] is the whole collection, [i] is item i-1
  const items = (c.links as any[]).filter((l) => l.rel === 'item');
  const hits: string[] = [];
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    if (b[0] <= box[2] && b[2] >= box[0] && b[1] <= box[3] && b[3] >= box[1] && items[i - 1]) hits.push(items[i - 1].href);
  }
  return Promise.all(hits.map(async (href) => {
    const it = await getJSON(href);
    const a = it.assets.aws;
    return { url: String(a.href), size: Number(a['file:size']) };
  }));
}

const hit = (b: any, box: BBox) => b && b.xmin <= box[2] && b.xmax >= box[0] && b.ymin <= box[3] && b.ymax >= box[1];

/** every row of a theme inside the box; reads only the row groups whose bbox statistics touch it */
export async function readBox(theme: string, type: string, box: BBox, columns: string[], onProgress?: (done: number, total: number) => void) {
  const files = await filesFor(theme, type, box);
  const plans: { file: any; md: any; ranges: [number, number][] }[] = [];
  for (const f of files) {
    const file = cachedAsyncBuffer(await asyncBufferFromUrl({ url: f.url, byteLength: f.size }));
    const md = await parquetMetadataAsync(file);
    const ranges: [number, number][] = [];
    let row = 0;
    for (const rg of md.row_groups) {
      const n = Number(rg.num_rows);
      const st = (p: string) => rg.columns.find((c: any) => c.meta_data?.path_in_schema?.join('.') === p)?.meta_data?.statistics;
      const xmin = st('bbox.xmin'), xmax = st('bbox.xmax'), ymin = st('bbox.ymin'), ymax = st('bbox.ymax');
      const known = [xmin, xmax, ymin, ymax].every((s) => s && s.min_value != null && s.max_value != null);
      if (known && Number(xmin!.min_value) <= box[2] && Number(xmax!.max_value) >= box[0] && Number(ymin!.min_value) <= box[3] && Number(ymax!.max_value) >= box[1]) ranges.push([row, row + n]);
      row += n;
    }
    plans.push({ file, md, ranges });
  }
  const total = plans.reduce((a, p) => a + p.ranges.length, 0);
  let done = 0;
  onProgress?.(done, total);
  const out: any[] = [];
  for (const p of plans) {
    for (const [rowStart, rowEnd] of p.ranges) {
      const rows = await parquetReadObjects({ file: p.file, metadata: p.md, rowStart, rowEnd, columns: ['bbox', ...columns], compressors });
      for (const r of rows) if (hit(r.bbox, box)) out.push(r);
      onProgress?.(++done, total);
    }
  }
  return out;
}
