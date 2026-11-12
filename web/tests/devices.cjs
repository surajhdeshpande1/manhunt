// Opens every screen at several phone/tablet sizes and reports horizontal overflow and page errors.
const { setup, chromium, devices } = require('./mock.cjs');
const DEV = [
  ['xs320', { viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: devices['iPhone SE'].userAgent }],
  ['se375', { ...devices['iPhone SE'], deviceScaleFactor: 1 }],
  ['s8_360', { ...devices['Galaxy S8'], deviceScaleFactor: 1 }],
  ['i390', { ...devices['iPhone 13'], deviceScaleFactor: 1 }],
  ['max430', { ...devices['iPhone 14 Pro Max'], deviceScaleFactor: 1 }],
  ['ipad', { ...devices['iPad Mini'], deviceScaleFactor: 1 }],
  ['pixel7', { ...devices['Pixel 7'], deviceScaleFactor: 1 }],
  ['s9plus', { ...devices['Galaxy S9+'], deviceScaleFactor: 1 }],
  ['i15land', { ...devices['iPhone 15 Pro landscape'], deviceScaleFactor: 1 }],
];
const SCREENS = [
  ['welcome', '/', 'anon'], ['signup', '/signup', 'anon'], ['signin', '/signin', 'anon'], ['perm', '/setup/permissions', ''],
  ['home', '/home', ''], ['host', '/home/host', ''], ['profile', '/home/profile', ''],
  ['alobby', '/room/r1', 'admin-lobby'], ['plobby', '/room/r1', 'player-lobby'], ['waiting', '/room/r1', 'waiting'],
  ['runner', '/room/r1', 'runner-hunt'], ['hunter', '/room/r1', 'hunter-reveal'], ['admin', '/room/r1', 'admin-hunt'], ['result', '/room/r1', 'result'],
];
(async () => {
  const only = process.argv[2]; const shotFor = (process.argv[3] || '').split(',');
  const scr = process.argv[4] ? process.argv[4].split(',') : null;
  const b = await chromium.launch();
  for (const [dn, opt] of DEV) {
    if (only && only !== 'all' && !only.split(',').includes(dn)) continue;
    for (const [sn, path, room] of SCREENS) {
      if (scr && !scr.includes(sn)) continue;
      const ctx = await b.newContext({ ...opt, serviceWorkers: 'block' });
      await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.18, longitude: 75.69, accuracy: 6 });
      await setup(ctx, { room: room || undefined });
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto('http://localhost:4173' + path); await p.waitForTimeout(2200);
      const rev = p.locator('button', { hasText: /^(Go hide|Ready)$/ }); if (await rev.count()) await rev.first().click({ force: true }).catch(() => {});
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const off = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
          if (el.closest('.backdrop') || el.closest('[aria-hidden="true"]') || el.closest('.maplibregl-map')) continue;
          const bb = el.getBoundingClientRect(); if (!bb.width || !bb.height) continue;
          if (bb.right > vw + 1.5 || bb.left < -1.5) {
            let a = el.parentElement, clipped = false;
            while (a && a !== document.body) { const s = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(s.overflowX + ' ' + s.overflow)) { const ab = a.getBoundingClientRect(); if (ab.right <= vw + 1.5 && ab.left >= -1.5) { clipped = true; break; } } a = a.parentElement; }
            if (!clipped) off.push(`${el.tagName.toLowerCase()} [${Math.round(bb.left)}..${Math.round(bb.right)}] "${(el.textContent || '').trim().slice(0, 28)}"`);
          }
        }
        return { vw, sw, off: off.slice(0, 5) };
      });
      const bad = r.sw > r.vw + 1 || r.off.length || errs.length;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${dn.padEnd(7)} ${sn.padEnd(8)} sw=${r.sw}/${r.vw} ${errs.join(' ')} ${r.off.join(' | ')}`);
      if (shotFor.includes(sn) || shotFor.includes('*')) await p.screenshot({ path: `${__dirname}/shots/d-${dn}-${sn}.png` });
      await ctx.close();
    }
  }
  await b.close();
})();
