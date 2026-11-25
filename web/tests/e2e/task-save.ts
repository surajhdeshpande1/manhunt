// A finished task in a real match screen, on a bad connection: the server first drops the request, then says
// "Too fast", then accepts. The runner must see "+1 task" at once and "saved" once it lands, never a frozen screen.
// Then: solved while outside the zone, it is held and counts by itself once the runner is back inside.
// Needs the dev server (npx vite --port 5173). Run:
//   npx esbuild tests/e2e/task-save.ts --bundle --platform=node --outfile=tests/.out/task-save.cjs && node tests/.out/task-save.cjs
import * as G from '../../src/tasks/gen';
// eslint-disable-next-line
const { setup, state, devices, chromium } = require('../mock.cjs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEED = 424242;

async function run(name: string, opts: { oob?: boolean }) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 16.18, longitude: 75.6899, accuracy: 5 });
  await setup(ctx, { room: 'runner-hunt' });
  let oob = false, active = false, done = 3;
  const calls: string[] = [];
  await ctx.route(/\/rpc\/room_state/, (r: any) => {
    const s = state('runner-hunt');
    Object.assign(s.me, { tasks: done, task_active: active, cooldown_until: null, oob_since: oob ? new Date().toISOString() : null, oob_reason: oob ? 'zone' : null });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(s) });
  });
  await ctx.route(/\/rpc\/start_task/, (r: any) => {
    active = true;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seed: SEED, kind: 17, index: done + 1, of: 10, level: 1, started_at: new Date(Date.now() - 500).toISOString() }) });
  });
  await ctx.route(/\/rpc\/complete_task/, (r: any) => {
    calls.push(new Date().toISOString().slice(17, 23));
    const n = calls.length;
    if (!opts.oob && n === 1) return r.abort('failed');                                   // signal drops
    if (!opts.oob && n === 2) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Too fast' }) });
    active = false; done++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pct: 10, done }) });
  });
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('pageerror', (e: any) => errs.push(e.message));
  await p.goto('http://localhost:5173/room/r1'); await sleep(2500);
  const startBtn = p.getByRole('button', { name: /Start task|Resume task/ }).first();
  if (!(await startBtn.count())) { console.log(name, 'FAIL: no start button'); await b.close(); return false; }
  await startBtn.click(); await sleep(600);
  const go = p.getByRole('button', { name: /^Start ·/ });
  if (await go.count()) { await go.click(); await sleep(300); }
  const info = await p.evaluate(() => (window as any).__tagTask);
  if (opts.oob) { oob = true; await sleep(3500); } // steps outside the zone mid-task
  const q = G.genNext(info.seed, info.level, info.twist);
  const t0 = Date.now();
  for (const r of q.rounds) { await sleep(350); await p.getByRole('button', { name: `Answer ${r.answer}`, exact: true }).first().dispatchEvent('pointerdown'); await sleep(500); }
  const solvedAt = Date.now();
  let first = '', shownAfter = -1;
  for (let i = 0; i < 40; i++) { first = (await p.locator('body').innerText()).replace(/\s+/g, ' '); if (/\+1 task/i.test(first)) { shownAfter = Date.now() - solvedAt; break; } await sleep(100); }
  const instant = shownAfter >= 0 && !/saved/i.test(first); // "+1 task" shows before the server has confirmed
  let line = first;
  if (opts.oob) {
    const held = /outside the zone/i.test(first);
    console.log(name, '| "+1 task" on screen', shownAfter, 'ms after the last answer |', held ? 'held: counts once back inside' : '(no hold message)', '| server calls:', calls.length);
    await p.getByRole('button', { name: 'Back to the map' }).click(); await sleep(500);
    const deck1 = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    oob = false; // the runner walks back in
    const t1 = Date.now();
    while (Date.now() - t1 < 15000 && done === 3) await sleep(300);
    await sleep(1500);
    const deck2 = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log(name, '| deck while outside:', /Get back inside to count your task/.test(deck1) ? '"Get back inside to count your task"' : '?', '| back inside → counted after', ((Date.now() - t1) / 1000).toFixed(1), 's, calls', calls.length, '| deck shows', (/(\d+)\/10/.exec(deck2) || [])[0]);
    await b.close();
    return instant && held && calls.length === 1 && done === 4 && !errs.length;
  }
  const t1 = Date.now();
  while (Date.now() - t1 < 20000 && !/saved/i.test(line)) { await sleep(250); line = (await p.locator('body').innerText()).replace(/\s+/g, ' '); }
  console.log(name, '| "+1 task" on screen', shownAfter, 'ms after the last answer, before saving:', instant, '| saved after', ((Date.now() - solvedAt) / 1000).toFixed(1), 's |', (/Task \d+ saved/.exec(line) || ['(not saved)'])[0], '| server calls:', calls.join(', '), '| solve took', ((solvedAt - t0) / 1000).toFixed(1), 's');
  await b.close();
  return instant && /saved/i.test(line) && calls.length === 3 && !errs.length;
}

(async () => {
  const a = await run('bad connection', {});
  const b = await run('outside the zone', { oob: true });
  console.log(a && b ? 'PASS' : 'FAIL');
  process.exit(a && b ? 0 : 1);
})();
