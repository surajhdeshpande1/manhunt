// Click-through tests for every flow. Reports page errors, console errors and missing expected UI.
const { setup, chromium, devices } = require('./mock.cjs');
const BASE = 'http://localhost:4173';
const FLOWS = [
  { name: 'intro→welcome', path: '/?intro', room: 'intro', steps: [['wait', 11000], ['see', 'Create account']] },
  { name: 'how-it-works', path: '/', room: 'anon', steps: [['click', 'How it works'], ['wait', 900], ['see', 'Next'], ['click', 'Next'], ['wait', 500], ['click', 'Next'], ['wait', 500], ['click', 'Next'], ['wait', 600], ['shot']] },
  { name: 'signup-validation', path: '/', room: 'anon', steps: [['click', 'Create account'], ['wait', 900], ['shot'], ['clicklast', 'Continue|Next|Create'], ['wait', 600], ['shot']] },
  { name: 'signin', path: '/signin', room: 'anon', steps: [['see', 'Sign in'], ['shot']] },
  { name: 'home', path: '/home', room: '', steps: [['see', 'ISE vs CSE'], ['click', '?'], ['wait', 700], ['see', 'How TAG works'], ['key', 'Escape'], ['wait', 500], ['click', 'Join a private room'], ['wait', 700], ['shot'], ['key', 'Escape'], ['wait', 400], ['link', 'Host'], ['wait', 900], ['see', 'Run the'], ['link', 'Profile'], ['wait', 900], ['see', 'Customise']] },
  { name: 'host-create', path: '/home/host', room: '', steps: [['fill', 'input[placeholder="Friday Night Hunt"]', 'Test Hunt'], ['fill', 'input[placeholder="At least 4 characters"]', 'abcd'], ['click', 'Create room'], ['wait', 1200], ['shot']] },
  { name: 'profile', path: '/home/profile', room: '', steps: [['click', 'Customise card'], ['wait', 800], ['shot'], ['key', 'Escape'], ['wait', 500], ['click', 'Day'], ['wait', 700], ['shot'], ['click', 'Night'], ['wait', 400], ['scroll'], ['shot']] },
  { name: 'admin-lobby', path: '/room/r1', room: 'admin-lobby', steps: [['wait', 1500], ['see', 'Start match'], ['click', 'Area'], ['wait', 900], ['shot'], ['click', 'Rules'], ['wait', 900], ['see', 'How this match runs'], ['shot'], ['click', 'Chat'], ['wait', 800], ['shot'], ['click', 'Players'], ['wait', 500]] },
  { name: 'player-lobby', path: '/room/r1', room: 'player-lobby', steps: [['wait', 1500], ['see', 'Match lobby'], ['see', 'ready'], ['shot']] },
  { name: 'waiting', path: '/room/r1', room: 'waiting', steps: [['wait', 1500], ['see', 'Waiting for'], ['shot']] },
  { name: 'runner-hunt', path: '/room/r1', room: 'runner-hunt', steps: [['wait', 2500], ['click', 'My catch code'], ['wait', 900], ['see', 'catch code'], ['shot'], ['clickaria', 'Close'], ['wait', 600], ['click', 'Start task'], ['wait', 1200], ['shot'], ['key', 'Escape'], ['wait', 500], ['clickaria', 'Menu'], ['wait', 800], ['shot']] },
  { name: 'runner-oob', path: '/room/r1', room: 'runner-oob', steps: [['wait', 2500], ['shot']] },
  { name: 'hunter-scan', path: '/room/r1', room: 'hunter-reveal', steps: [['wait', 2500], ['click', 'Scan to tag'], ['wait', 1500], ['see', 'Scan to catch'], ['shot'], ['clickaria', 'Close scanner'], ['wait', 600]] },
  { name: 'hunter-hiding', path: '/room/r1', room: 'hunter-hiding', steps: [['wait', 2500], ['see', 'Hunter lobby'], ['see', 'Your squad'], ['shot']] },
  { name: 'admin-hunt', path: '/room/r1', room: 'admin-hunt', steps: [['wait', 2500], ['clickaria', 'Expand panel'], ['wait', 500], ['clickaria', 'Expand panel'], ['wait', 700], ['shot'], ['see', 'Force reveal']] },
  { name: 'result', path: '/room/r1', room: 'result', steps: [['wait', 2500], ['see', 'Victory'], ['click', 'Share poster'], ['wait', 2500], ['shot']] },
];
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  let problems = 0;
  for (const f of FLOWS) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.grantPermissions(['geolocation', 'camera']); await ctx.setGeolocation({ latitude: 16.18, longitude: 75.6899, accuracy: 6 });
    await setup(ctx, { room: f.room });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::|vibrate|pbf|glyphs|WebSocket connection/.test(t)) errs.push('console ' + t.slice(0, 220)); });
    let n = 0;
    try {
      await p.goto(BASE + f.path); await p.waitForTimeout(1500);
      for (const [act, a, b2] of f.steps) {
        if (act === 'wait') await p.waitForTimeout(a);
        else if (act === 'see') { const ok = await p.getByText(new RegExp(a, 'i')).first().isVisible().catch(() => false); if (!ok) errs.push(`MISSING "${a}"`); }
        else if (act === 'click') await p.locator('button', { hasText: a }).first().click({ timeout: 4000 }).catch(() => errs.push(`CANT CLICK "${a}"`));
        else if (act === 'clicklast') await p.locator('button[type=submit], button').filter({ hasText: new RegExp(a) }).last().click({ timeout: 4000 }).catch(() => errs.push(`CANT CLICK /${a}/`));
        else if (act === 'clickaria') await p.locator(`[aria-label="${a}"]`).first().click({ timeout: 4000 }).catch(() => errs.push(`CANT CLICK [${a}]`));
        else if (act === 'link') await p.locator('a', { hasText: a }).first().click({ timeout: 4000 }).catch(() => errs.push(`CANT CLICK link "${a}"`));
        else if (act === 'fill') await p.locator(a).first().fill(b2, { timeout: 4000 }).catch(() => errs.push(`CANT FILL ${a}`));
        else if (act === 'key') await p.keyboard.press(a);
        else if (act === 'scroll') await p.mouse.wheel(0, 1600);
        else if (act === 'shot') await p.screenshot({ path: `${__dirname}/shots/flow-${f.name}-${n++}.png` });
      }
      const sw = await p.evaluate(() => document.documentElement.scrollWidth); const vw = await p.evaluate(() => innerWidth);
      if (sw > vw + 1) errs.push(`OVERFLOW ${sw}/${vw}`);
    } catch (e) { errs.push('TEST ' + e.message.slice(0, 200)); }
    console.log((errs.length ? 'FAIL ' : 'ok   ') + f.name + (errs.length ? '\n   - ' + [...new Set(errs)].join('\n   - ') : ''));
    problems += errs.length ? 1 : 0;
    await ctx.close();
  }
  console.log(problems ? `${problems} flow(s) with problems` : 'ALL FLOWS OK');
  await b.close();
})();
