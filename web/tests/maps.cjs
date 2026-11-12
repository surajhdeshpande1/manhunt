// Multi-map check: satellite from Esri loads, a refusing MapTiler key falls back to Esri, Map returns to OpenStreetMap.
// Needs a dev server started with stand-in keys:  VITE_ARCGIS_KEY=x VITE_MAPTILER_KEY=y npx vite --port 5174
const { setup, png, chromium, devices } = require('./mock.cjs');
const GREEN = png(256, 256, [46, 120, 60]);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.18, longitude: 75.6899, accuracy: 6 });
  await setup(ctx, { room: 'admin-lobby' });
  let esri = 0, mt = 0;
  await ctx.route(/ibasemaps-api\.arcgis\.com/, (r) => { esri++; r.fulfill({ contentType: 'image/png', body: GREEN }); });
  await ctx.route(/api\.maptiler\.com/, (r) => { mt++; r.fulfill({ status: 403, contentType: 'text/plain', body: 'Invalid key' }); });
  const p = await ctx.newPage(); const errs = [];
  const reqs = []; p.on('request', (r) => { const u = r.url(); if (/arcgis|maptiler|openfreemap/.test(u)) reqs.push(u.slice(0, 90)); });
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && /\[map\]/.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5174/room/r1'); await p.waitForTimeout(2500);
  await p.getByRole('tab', { name: /area/i }).first().click(); await p.waitForTimeout(3000);
  const btns = async () => (await p.locator('button[aria-pressed]').allInnerTexts()).map((t) => t.trim()).join(' | ');
  console.log('reqs:', reqs.slice(0, 8).join('\n  '));
  console.log('after open  :', await btns(), '| esri tiles', esri);
  await p.locator('.maplibregl-map').first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 140)); await p.waitForTimeout(600);
  await p.locator('.maplibregl-map').first().screenshot({ path: __dirname + '/shots/maps-1.png' });
  const attr = await p.locator('.maplibregl-ctrl-attrib-inner').first().textContent({ timeout: 3000 }).catch(() => '(none)');
  console.log('attribution :', attr.replace(/\s+/g, ' ').slice(0, 120));
  await p.getByRole('button', { name: 'Satellite from MapTiler' }).click(); await p.waitForTimeout(7000);
  await p.screenshot({ path: __dirname + '/shots/maps-1b.png' });
  console.log('after MT 403:', await btns(), '| maptiler reqs', mt, '| esri tiles', esri);
  await p.getByRole('button', { name: 'Map', exact: true }).click(); await p.waitForTimeout(1500);
  console.log('after Map   :', await btns());
  await p.screenshot({ path: __dirname + '/shots/maps-2.png' });
  console.log('errors', errs);
  await b.close();
})();
