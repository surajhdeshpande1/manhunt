// Captures every screen at rest (full page) for design review: node audit.cjs [outdir] [only]
const { setup, chromium, devices } = require('./mock.cjs');
const OUTD = process.argv[2] || require('path').join(__dirname, 'audit'); require('fs').mkdirSync(OUTD, { recursive: true }); const ONLY = process.argv[3] ? new RegExp(process.argv[3]) : null;
const BASE = 'http://localhost:4173';
const S = [
  ['welcome', '/', 'anon', []],
  ['signin', '/signin', 'anon', []],
  ['signup', '/', 'anon', [['click', 'Create account'], ['wait', 900]]],
  ['how', '/', 'anon', [['click', 'How it works'], ['wait', 900]]],
  ['forgot', '/forgot', 'anon', []],
  ['perms', '/setup/permissions', '', []],
  ['selfie', '/setup/selfie', '', [['wait', 1500]]],
  ['home', '/home', '', []],
  ['join', '/home', '', [['click', 'Join a private room'], ['wait', 800]]],
  ['host', '/home/host', '', []],
  ['profile', '/home/profile', '', []],
  ['card', '/home/profile', '', [['click', 'Customise card'], ['wait', 800]]],
  ['train', '/home/train', '', []],
  ['lobby-players', '/room/r1', 'admin-lobby', [['wait', 1500]]],
  ['lobby-area', '/room/r1', 'admin-lobby', [['wait', 1200], ['tab', 'Area'], ['wait', 1500]]],
  ['lobby-rules', '/room/r1', 'admin-lobby', [['wait', 1200], ['tab', 'Rules'], ['wait', 900]]],
  ['lobby-chat', '/room/r1', 'admin-lobby', [['wait', 1200], ['tab', 'Chat'], ['wait', 900]]],
  ['player-lobby', '/room/r1', 'player-lobby', [['wait', 1500]]],
  ['waiting', '/room/r1', 'waiting', [['wait', 1500]]],
  ['hunter-lobby', '/room/r1', 'hunter-hiding', [['wait', 2500]]],
  ['runner-hunt', '/room/r1', 'runner-hunt', [['wait', 2500]]],
  ['hunter-hunt', '/room/r1', 'hunter-reveal', [['wait', 2500]]],
  ['admin-hunt', '/room/r1', 'admin-hunt', [['wait', 2500]]],
  ['runner-oob', '/room/r1', 'runner-oob', [['wait', 2500]]],
  ['result', '/room/r1', 'result', [['wait', 3000]]],
];
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  for (const [name, path, room, steps] of S) {
    if (ONLY && !ONLY.test(name)) continue;
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.grantPermissions(['geolocation', 'camera']); await ctx.setGeolocation({ latitude: 16.18, longitude: 75.6899, accuracy: 6 });
    await setup(ctx, { room });
    if (process.env.MODE) await ctx.addInitScript((m) => { try { localStorage.setItem('tag-appearance', m); } catch {} }, process.env.MODE);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + path); await p.waitForTimeout(1600);
    for (const [act, a] of steps) {
      if (act === 'wait') await p.waitForTimeout(a);
      else if (act === 'click') await p.locator('button', { hasText: a }).first().click({ timeout: 4000 }).catch(() => errs.push('cant click ' + a));
      else if (act === 'tab') await p.getByRole('tab', { name: new RegExp(a, 'i') }).first().click({ timeout: 4000 }).catch(() => errs.push('cant tab ' + a));
    }
    await p.screenshot({ path: `${OUTD}/${name}.png`, fullPage: true });
    if (errs.length) console.log(name, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})();
