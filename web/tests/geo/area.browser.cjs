// Area packs in a real browser, against the production build: the host's phone reads Overture's open data
// (served here from local copies of the needed byte ranges), builds the pack on a background thread,
// shows it on the area editor's map and saves it for the players.
// Needs the preview server (npm run build && npx vite preview --port 4173) and the two parquet stand-ins:
//   node tests/geo/area.browser.cjs <buildings.parquet> <places.parquet>
const fs = require('fs');
const { setup, state, devices, chromium, OUT } = require('../mock.cjs');

const [bPath, pPath] = process.argv.slice(2);
if (!bPath || !pPath) { console.log('usage: node tests/geo/area.browser.cjs <buildings.parquet> <places.parquet>'); process.exit(2); }
const FILES = { 'https://overture.test/b.parquet': bPath, 'https://overture.test/p.parquet': pPath };
// a play area just west of the Bagalkot box TAG ships, so the app has to fetch it like anywhere else on Earth
const AREA = [[75.6068, 16.1688], [75.6132, 16.1688], [75.6136, 16.1752], [75.6070, 16.1756]];
const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
const coll = (item) => ({ extent: { spatial: { bbox: [[-180, -90, 180, 90], [74.6, 14.6, 76.9, 17.0]] } }, links: [{ rel: 'item', href: item }] });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.172, longitude: 75.61, accuracy: 6 });
  await setup(ctx, { room: 'admin-lobby' });
  let bytes = 0, uploaded = null, catalog = 0;
  await ctx.route(/stac\.overturemaps\.org/, (r) => {
    const u = r.request().url(); catalog++;
    if (u.endsWith('/catalog.json')) return r.fulfill(json({ latest: '2026-10-21.0' }));
    if (u.endsWith('/buildings/building/collection.json')) return r.fulfill(json(coll('https://stac.overturemaps.org/test/b.json')));
    if (u.endsWith('/places/place/collection.json')) return r.fulfill(json(coll('https://stac.overturemaps.org/test/p.json')));
    if (u.endsWith('/test/b.json')) return r.fulfill(json({ assets: { aws: { href: 'https://overture.test/b.parquet', 'file:size': fs.statSync(bPath).size } } }));
    if (u.endsWith('/test/p.json')) return r.fulfill(json({ assets: { aws: { href: 'https://overture.test/p.parquet', 'file:size': fs.statSync(pPath).size } } }));
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.route(/overture\.test/, (r) => {
    const path = FILES[r.request().url()];
    const m = /bytes=(\d+)-(\d+)/.exec(r.request().headers()['range'] || '');
    if (!path || !m) return r.fulfill({ status: 400, body: 'range required' });
    const a = +m[1], z = +m[2], buf = Buffer.alloc(z - a + 1);
    fs.readSync(fs.openSync(path, 'r'), buf, 0, buf.length, a); bytes += buf.length;
    return r.fulfill({ status: 206, headers: { 'content-range': `bytes ${a}-${z}/${fs.statSync(path).size}`, 'access-control-allow-origin': '*' }, body: buf });
  });
  await ctx.route(/supabase\.co\/storage\/v1\/object\/(public\/)?areas\//, (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"404","error":"not_found","message":"Object not found"}' });
    uploaded = { url: r.request().url(), body: r.request().postDataBuffer() };
    return r.fulfill(json({ Key: 'areas/rooms/x.json' }));
  });
  await ctx.route(/\/rpc\/room_state/, (r) => {
    const s = state('admin-lobby');
    s.room.boundary = AREA; s.room.nogo = []; s.room.zone = { lat: 16.1722, lng: 75.6101, r: 380 };
    return r.fulfill(json(s));
  });

  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:4173/room/r1');
  await p.waitForTimeout(2000);
  await p.getByRole('tab', { name: /^Area/ }).first().click();
  const t0 = Date.now();
  let line = '';
  while (Date.now() - t0 < 150_000) {
    line = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    if (/buildings and [\d,]+ named places shown/.test(line) || /Couldn't fetch building data/.test(line)) break;
    await p.waitForTimeout(1000);
  }
  const shown = /([\d,]+) buildings and ([\d,]+) named places shown[^.]*/.exec(line);
  console.log('editor says  :', shown ? shown[0] : (/Couldn't fetch building data[^.]*/.exec(line) || ['(nothing)'])[0]);
  console.log('took         :', ((Date.now() - t0) / 1000).toFixed(1), 's,', (bytes / 1e6).toFixed(1), 'MB of map data read,', catalog, 'catalogue requests');
  let pack = null;
  // the storage client sends the file as a multipart form: pull the JSON part out
  try { const txt = uploaded.body.toString('utf8'); pack = JSON.parse(txt.slice(txt.indexOf('{"v":'), txt.lastIndexOf('}') + 1)); } catch { /* not there */ }
  console.log('saved for all:', uploaded ? `${uploaded.url.split('/areas/')[1]} · ${(uploaded.body.length / 1e3).toFixed(0)} KB · ${pack?.b?.length} buildings, ${pack?.p?.length} places` : 'no upload');
  // zoom the editor's map in on the area to see the outlines
  await p.screenshot({ path: OUT + 'area-pack.png' });
  console.log('page errors  :', errors.length ? errors : 'none');
  const ok = !!shown && +shown[1].replace(/,/g, '') > 200 && pack && pack.v === 1 && pack.b.length === +shown[1].replace(/,/g, '') && !errors.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
