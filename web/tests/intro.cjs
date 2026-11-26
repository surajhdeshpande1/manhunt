// Opening film: the Skip button shows from the start, and tapping it (or Escape) goes straight to the app.
// Needs the dev server: npx vite --port 5173
const { chromium, devices } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  let pass = true;
  for (const how of ['tap', 'escape']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:5173/?intro'); await sleep(1500); // automated browsers only see the film with ?intro
    const btn = p.getByRole('button', { name: 'Skip intro' });
    const visible = await btn.isVisible();
    const t0 = Date.now();
    if (how === 'tap') await btn.click(); else await p.keyboard.press('Escape');
    let gone = -1;
    for (let i = 0; i < 30; i++) { await sleep(100); if (!(await btn.count())) { gone = Date.now() - t0; break; } }
    await sleep(500);
    const welcome = /Create account/i.test(await p.locator('body').innerText());
    const ok = visible && gone >= 0 && gone < 2000 && welcome && !errs.length;
    pass = pass && ok;
    console.log(ok ? 'ok  ' : 'FAIL', how, '| skip shown at 1.5 s:', visible, '| film gone after', gone, 'ms | welcome screen:', welcome, errs.length ? '| errors: ' + errs.join(' | ') : '');
    await ctx.close();
  }
  await b.close();
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
})();
