// Area pack pipeline against a stand-in internet: Overture's catalogue and range reads are served from local files.
// Run: npx esbuild tests/geo/pack.test.ts --bundle --platform=node --format=esm --outfile=tests/.out/pack.mjs && node tests/.out/pack.mjs <buildings.parquet> <places.parquet>
import { openSync, readSync, fstatSync } from 'node:fs';
import { readBox, latestRelease } from '../../src/geo/overture';
import { makePack, packToGeoJSON, areaBox } from '../../src/geo/areaPack';

const [bPath, pPath] = process.argv.slice(2);
const files: Record<string, string> = { 'https://test.s3/b.parquet': bPath, 'https://test.s3/p.parquet': pPath };
const size = (p: string) => fstatSync(openSync(p, 'r')).size;
const json = (o: any) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const coll = (item: string) => ({ extent: { spatial: { bbox: [[-180, -90, 180, 90], [74.6, 14.6, 76.9, 17.0]] } }, links: [{ rel: 'item', href: item }] });
let bytes = 0;
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (url.endsWith('/catalog.json')) return json({ latest: '2026-10-21.0' });
  if (url.endsWith('/buildings/building/collection.json')) return json(coll('https://stac.test/b.json'));
  if (url.endsWith('/places/place/collection.json')) return json(coll('https://stac.test/p.json'));
  if (url === 'https://stac.test/b.json') return json({ assets: { aws: { href: 'https://test.s3/b.parquet', 'file:size': size(bPath) } } });
  if (url === 'https://stac.test/p.json') return json({ assets: { aws: { href: 'https://test.s3/p.parquet', 'file:size': size(pPath) } } });
  const path = files[url];
  if (path) {
    const range = String(init?.headers?.Range ?? init?.headers?.range ?? new Headers(init?.headers).get('range') ?? '');
    const m = /bytes=(\d+)-(\d+)/.exec(range); if (!m) throw new Error('no range for ' + url);
    const a = +m[1], b = +m[2]; const buf = Buffer.alloc(b - a + 1); readSync(openSync(path, 'r'), buf, 0, buf.length, a); bytes += buf.length;
    return new Response(buf, { status: 206, headers: { 'content-range': `bytes ${a}-${b}/${size(path)}` } });
  }
  throw new Error('unexpected fetch ' + url);
};
// a campus-sized play area around BEC
const boundary = [[75.6585, 16.1690], [75.6660, 16.1690], [75.6660, 16.1765], [75.6585, 16.1765]] as [number, number][];
const box = areaBox(boundary);
const t0 = Date.now();
const [buildings, places] = await Promise.all([
  readBox('buildings', 'building', box, ['geometry']),
  readBox('places', 'place', box, ['geometry', 'names', 'basic_category', 'confidence']),
]);
const pack = makePack(await latestRelease(), box, buildings, places);
const geo = packToGeoJSON(pack);
const str = JSON.stringify(pack);
console.log(`box ${box.map((v) => v.toFixed(4)).join(',')} | ${Date.now() - t0} ms | read ${(bytes / 1e6).toFixed(1)} MB`);
console.log(`pack: ${pack.b.length} buildings, ${pack.p.length} places, ${(str.length / 1e3).toFixed(0)} KB | geojson features ${geo.buildings.features.length}/${geo.places.features.length}`);
console.log('places:', pack.p.slice(0, 8).map((p) => `${p[2]} [${p[3]}]`).join(' · '));
const inBox = pack.b.every((poly) => poly[0].every((v, i) => (i % 2 ? v > box[1] - 0.01 && v < box[3] + 0.01 : v > box[0] - 0.01 && v < box[2] + 0.01)));
if (!pack.b.length || !pack.p.length || !inBox) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
