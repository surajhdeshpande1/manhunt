// Place search hands over between providers: with Esri and MapTiler keys set, a refused Esri (no geocoding
// permission) falls to MapTiler, a refused MapTiler falls to Photon, and the right credit shows.
// Needs a dev server with stand-in keys:  VITE_ARCGIS_KEY=x VITE_MAPTILER_KEY=y npx vite --port 5174
const { setup, devices, chromium } = require('./mock.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.1805, longitude: 75.6905, accuracy: 6 });
  await setup(ctx, { room: 'admin-lobby' });
  const tried = [];
  await ctx.route(/^https:\/\/[^/]*arcgis\.com\//, (r) => {
    if (/geocode-api/.test(r.request().url())) { tried.push('esri'); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: { code: 403, message: 'User does not have permissions' } }) }); }
    return r.abort();
  });
  await ctx.route(/api\.maptiler\.com/, (r) => { if (/geocoding/.test(r.request().url())) tried.push('maptiler'); r.fulfill({ status: 403, contentType: 'text/plain', body: 'Invalid key' }); });
  await ctx.route(/photon\.komoot\.io/, (r) => { tried.push('photon'); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{ geometry: { coordinates: [75.65, 16.17] }, properties: { name: 'Vidyagiri Bus Stand', city: 'Bagalkot' } }] }) }); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5174/room/r1'); await sleep(2500);
  await p.getByText('Area', { exact: true }).first().click(); await sleep(1500);
  await p.getByRole('combobox', { name: 'Find a place on the map' }).fill('vidyagiri bus'); await sleep(2500);
  const list = (await p.locator('#place-results').innerText()).replace(/\s+/g, ' ');
  const pass = tried.join('>') === 'esri>maptiler>photon' && /Vidyagiri Bus Stand/.test(list) && /Search by Photon/.test(list) && !errs.length;
  console.log('providers tried:', tried.join(' → '), '| result shown:', /Vidyagiri Bus Stand/.test(list), '| credit:', (/Search[^·]*·[^|]*contributors/.exec(list) || ['?'])[0]);
  console.log(pass ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(pass ? 0 : 1);
})();
