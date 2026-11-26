// Play-area editor: "Find a place" search, the familiar street map, the locate button and a single "you" dot.
// Names TAG ships answer instantly; map search (Photon here, answered by a stand-in) follows; picking a result
// flies the map there and drops a pin. Needs the dev server: npx vite --port 5173
const { setup, devices, chromium } = require('./mock.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.1805, longitude: 75.6905, accuracy: 6 });
  await setup(ctx, { room: 'admin-lobby' });
  const photon = [];
  await ctx.route(/photon\.komoot\.io/, (r) => {
    photon.push(r.request().url());
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [
      { geometry: { coordinates: [75.6563, 16.1747] }, properties: { name: 'Basaveshwar Engineering College', street: 'Vidyagiri Main Road', city: 'Bagalkot', state: 'Karnataka', extent: [75.651, 16.178, 75.660, 16.171] } },
      { geometry: { coordinates: [75.6965, 16.1865] }, properties: { name: 'Engineering College Road', city: 'Bagalkot', state: 'Karnataka' } },
    ] }) });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5173/room/r1'); await sleep(3000);
  await p.getByText('Area', { exact: true }).first().click(); await sleep(1800);
  const checks = [];
  const ok = (name, pass, info = '') => { checks.push(pass); console.log(pass ? 'ok  ' : 'FAIL', name, info); };

  const box = p.getByRole('combobox', { name: 'Find a place on the map' });
  ok('search box shown', (await box.count()) === 1);
  ok('locate button', (await p.locator('[aria-label="Go to my location"]').count()) === 1);
  ok('one "you" dot, no extra pin', (await p.locator('.tag-me').count()) <= 1 && (await p.locator('.tag-marker[data-me="1"]').count()) === 0);
  await box.click(); await sleep(400); await box.fill('engineering col'); await sleep(300);
  const instant = (await p.getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  ok('names TAG ships show at once', instant.length > 0, `(${instant.length}, e.g. "${(instant[0] || '').slice(0, 50)}")`);
  await sleep(1600);
  const all = (await p.getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const list = (await p.locator('#place-results').innerText()).replace(/\s+/g, ' ');
  ok('map search results follow', all.some((t) => /Vidyagiri Main Road/.test(t)), `(${all.length} results)`);
  ok('search credit shown', /Photon · © OpenStreetMap contributors/.test(list));
  ok('one map search per query', photon.length === 1 && /lat=16\.\d+&lon=75\.\d+/.test(photon[0]), `(${photon.length} calls, biased to the map centre)`);
  await p.getByRole('option', { name: /Basaveshwar Engineering College Vidyagiri/ }).click(); await sleep(1600);
  ok('picking drops a pin on the place', (await p.locator('.tag-marker[data-place="1"]').count()) === 1);
  ok('no repeat search after picking', photon.length === 1);
  await p.getByRole('button', { name: 'Clear search' }).click(); await sleep(400);
  ok('clearing removes the pin', (await p.locator('.tag-marker[data-place="1"]').count()) === 0);
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  const pass = checks.every(Boolean);
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
})();
