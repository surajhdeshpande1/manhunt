// Developer DEMO plays like the real app: you as yourself, the hunter radio with bots talking, Scan QR with the
// nearest runners to scan (real distance rule), runner chat, MY QR, tasks, and Call never dials.
// Nothing reaches the real backend except the developer-session check. Needs the dev server: npx vite --port 5173
const { chromium, devices } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** tap through the role reveal and any full-screen moment until the demo tab is reachable */
async function through(p, ms = 14000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = p.getByRole('button', { name: /^(Go hide|Enter hunter lobby)$/ });
    if (await b.count() && await b.first().isVisible().catch(() => false)) { await b.first().click().catch(() => {}); await sleep(900); continue; }
    const blocked = await p.evaluate(() => {
      if (document.querySelector('div[style*="z-index: 700"]')) return true; // the role reveal
      const el = document.querySelector('[aria-label="Open demo controls"]'); if (!el) return true;
      const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(top && (top === el || el.contains(top)));
    });
    if (!blocked) return true;
    await p.mouse.click(200, 120).catch(() => {}); await sleep(800);
  }
  return false;
}
async function demo(p, label) {
  await through(p);
  await p.getByRole('button', { name: 'Open demo controls' }).click(); await sleep(600);
  await p.getByRole('button', { name: label }).click(); await sleep(1200);
  if (await p.getByRole('dialog', { name: 'Demo controls' }).isVisible().catch(() => false)) { await p.keyboard.press('Escape'); await sleep(600); }
  await sleep(1200); await through(p);
}
const text = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.1805, longitude: 75.6905, accuracy: 5 });
  await ctx.addInitScript(() => {
    sessionStorage.setItem('tag-demo', '1'); sessionStorage.setItem('tag-skip-intro', '1');
    localStorage.setItem('tag-dev-token', 'test-token'); localStorage.setItem('tag-perm-done', '1');
    localStorage.setItem('tag-demo-me', JSON.stringify({ username: 'suraj', full_name: 'Suraj H. Deshpande', college: 'Basaveshwar Engineering College', branch: 'ISE', year: 3, selfie_path: null }));
  });
  const real = new Set();
  await ctx.route(/supabase\.co/, (r) => { const u = r.request().url(); real.add(u.replace(/^.*\/(rest|functions)\/v1\//, '').split('?')[0]); r.fulfill({ status: 200, contentType: 'application/json', body: /dev_check/.test(u) ? 'true' : 'null' }); });
  await ctx.route(/^https:\/\/[^/]*(openfreemap|photon|arcgis|maptiler|overturemaps|livekit)/, (r) => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const checks = [];
  const ok = (name, pass, info = '') => { checks.push(pass); console.log(pass ? 'ok  ' : 'FAIL', name, info); };

  await p.goto('http://localhost:5173/home'); await sleep(3500);
  ok('you play as yourself (@suraj)', /suraj/i.test(await text(p)));

  // ---- hunter: radio, then the hunt and a scan ----
  await demo(p, 'As hunter'); await sleep(800);
  const join = p.getByRole('button', { name: /^Join radio$/ }).first();
  if (await join.count()) { await join.click(); await sleep(1500); }
  ok('hunter radio joins', /Hold to talk/i.test(await text(p)));
  let heard = '';
  for (let i = 0; i < 45 && !heard; i++) { await sleep(1000); heard = (/(\S+) talking…/.exec(await text(p)) || [''])[0]; }
  ok('a hunter bot talks on the radio', !!heard, heard ? `("${heard}")` : '(none within 45 s)');
  await demo(p, 'Skip hide timer'); await sleep(1500); await through(p);
  await demo(p, 'Runner next to me');
  await p.locator('[aria-label="Scan a runner\'s QR to catch them"]').first().click(); await sleep(2500);
  const targets = (await p.getByRole('button', { name: /^Scan @/ }).allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  ok('scanner lists runners to scan', targets.length > 0, `(${targets.join('; ')})`);
  if (targets.length) { await p.getByRole('button', { name: /^Scan @/ }).first().click(); await sleep(1800); }
  const res = await text(p);
  ok('catch confirmed by the distance rule', /@\S+ caught/.test(res) && /Confirmed at \d+ m/.test(res), (/Confirmed at \d+ m/.exec(res) || /Too far[^.]*\./.exec(res) || [''])[0]);
  const back = p.getByRole('button', { name: 'Back to the hunt' }); if (await back.count()) { await back.click(); await sleep(800); }

  // ---- admin: calls never dial ----
  const id = await p.evaluate(async () => { const sim = await import('/src/demo/sim.ts'); const id = await sim.ctl.quick('admin'); sim.ctl.act(id, 'bot_sos'); return id; });
  await p.goto('http://localhost:5173/room/' + id); await sleep(3500);
  ok('no tel: links anywhere', (await p.locator('a[href^="tel:"]').count()) === 0);
  const call = p.locator('button.tag', { hasText: 'Call' }).first();
  if (await call.count()) { await call.click(); await sleep(400); }
  ok('Call says who it would ring', /Demo: this would ring @\S+/.test(await text(p)));

  // ---- runner: QR, chat, tasks ----
  await p.goto('http://localhost:5173/home'); await sleep(2500);
  await demo(p, 'As runner');
  await demo(p, 'Skip hide timer');
  let start = 0;
  for (let i = 0; i < 20 && !start; i++) { await sleep(700); await through(p, 1500); start = await p.getByRole('button', { name: /^Start task/ }).count(); }
  ok('MY QR next to the task button', (await p.locator('[aria-label="Show my QR code"]').count()) === 1);
  ok('tasks unlock in the hunt', start > 0);
  const t = await text(p);
  ok('runner chat open for a runner in the game', /Runner chat/i.test(t) && !/Closed\. Runner chat/.test(t));

  ok('only the developer check touched the real server', [...real].every((u) => /dev_check/.test(u)), `(${[...real].join(', ') || 'none'})`);
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  const pass = checks.every(Boolean);
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
})();
