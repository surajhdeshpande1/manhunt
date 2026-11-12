import * as G from '../../src/tasks/gen';
import { TASKS } from '../../src/tasks/core';
// eslint-disable-next-line
const { chromium, devices } = require('playwright');
const OUT = __dirname + '/shots/';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/dev_check/, (r: any) => r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }));
  await ctx.route(/supabase\.co\/(auth|rest)\/v1\/.*/, (r: any) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route(/openfreemap|googleapis/, (r: any) => r.abort());
  await ctx.addInitScript(() => { try { sessionStorage.setItem('tag-demo', '1'); localStorage.setItem('tag-dev-token', 't'); } catch {} });
  const p = await ctx.newPage(); const errs: string[] = [];
  p.on('pageerror', (e: any) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m: any) => { if (m.type() === 'error' && !/Failed to load|net::|ERR_|openfreemap|404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : [...Array(20).keys()];
  const LEVEL = process.env.LVL || 'Auto';
  await p.goto('http://localhost:5173/home/train'); await sleep(2500);
  if (LEVEL !== 'Auto') { await p.getByRole('tab', { name: LEVEL, exact: true }).first().click(); await sleep(200); }
  const results: string[] = [];
  for (const k of only) {
    const t = TASKS[k];
    try {
      await p.locator('button.card', { hasText: t.name }).first().click(); await sleep(400);
      await p.getByRole('button', { name: /^Practise/ }).click(); await sleep(700);
      const start = p.getByRole('button', { name: /^Start ·/ });
      if (await start.count()) { await start.click(); await sleep(300); }
      const info = await p.evaluate(() => (window as any).__tagTask);
      const { seed, level, twist } = info;
      const lab = (s: string) => p.getByRole('button', { name: s, exact: true });
      const tapL = async (s: string) => { await lab(s).first().dispatchEvent('pointerdown'); await sleep(90); };
      switch (k) {
        case 0: { const q = G.genEcho(seed, level, twist); await sleep(700 + q.seq.length * (q.flashMs + q.gapMs) + 600); for (const id of q.answer) await tapL(`Tile ${id + 1}`); break; }
        case 1: { const q = G.genPairs(seed, level, twist); const cards = p.locator('button[aria-label^="Hidden card"], button[aria-label^="Card"]');
          const seen = new Set<number>(); for (let i = 0; i < q.deck.length; i++) { if (seen.has(i) || q.deck[i].pair < 0) continue; const j = q.deck.findIndex((c, x) => x !== i && c.pair === q.deck[i].pair); seen.add(i); seen.add(j);
            await cards.nth(i).dispatchEvent('pointerdown'); await sleep(120); await cards.nth(j).dispatchEvent('pointerdown'); await sleep(250); } break; }
        case 2: { const q = G.genFlash(seed, level, twist); await sleep(500 + q.showMs + (q.turn || q.mirror ? 1000 : 0) + 300); for (const i of q.answer) await tapL(`Square ${i + 1}`); break; }
        case 3: { const q = G.genTrail(seed, level, twist); await sleep(700 + q.path.length * q.stepMs + q.stepMs + 450); for (const c of q.answer) await tapL(`Square ${c + 1}`); break; }
        case 4: { const q = G.genSafe(seed, level, twist); for (const d of q.code) await tapL(String(d)); await p.getByRole('button', { name: 'Try' }).click(); break; }
        case 5: { const q = G.genMaze(seed, level, twist); const N = { N: 'Up', S: 'Down', E: 'Right', W: 'Left' } as any, O = { N: 'S', S: 'N', E: 'W', W: 'E' } as any; for (const d of q.path) { await lab(N[q.flip ? O[d] : d]).first().dispatchEvent('pointerdown'); await sleep(60); } break; }
        case 6: { const q = G.genGlyph(seed, level, twist); for (const d of q.answer) await tapL(String(d)); break; }
        case 7: { const q = G.genBinary(seed, level, twist); for (let i = 0; i < q.bits; i++) if (q.target & G.binValue(q.bits, i, q.fromLeft)) await tapL(`Switch ${i + 1}`); break; }
        case 8: { const q = G.genWires(seed, level, twist); await tapL(`Cut ${q.wires[q.answer]} wire ${q.answer + 1}`); break; }
        case 9: { const q = G.genLights(seed, level, twist); for (const x of q.solution) { await p.getByRole('button', { name: new RegExp(`^Light ${x + 1} `) }).dispatchEvent('pointerdown'); await sleep(90); } break; }
        case 10: { const q = G.genPipes(seed, level, twist); for (const c of q.path) { const cell = q.cells[c]; if (cell.bolted) continue; const n = (cell.good - cell.rot + 4) % 4; for (let i = 0; i < n; i++) await tapL(`Pipe ${c + 1}`); } break; }
        case 11: { await p.evaluate(() => new Promise<void>((res) => { const t0 = performance.now(); let last = 0;
            const loop = () => { const bar = document.querySelector('button.btn-lg')?.previousElementSibling as HTMLElement; if (!bar || performance.now() - t0 > 28000) return res();
              const kids = bar.children; const zone = kids[0] as HTMLElement, needle = kids[kids.length - 1] as HTMLElement;
              const zl = parseFloat(zone.style.left), zw = parseFloat(zone.style.width), nl = parseFloat(needle.style.left);
              if (nl > zl + zw * 0.25 && nl < zl + zw * 0.75 && performance.now() - last > 400) { last = performance.now(); bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
              if (!/hits/i.test(document.body.innerText)) return res(); requestAnimationFrame(loop); }; loop(); })); break; }
        case 12: { await p.evaluate(() => new Promise<void>((res) => { const t0 = performance.now();
            const iv = setInterval(() => { document.querySelectorAll('button[aria-label="Target"]').forEach((b) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); if (performance.now() - t0 > 28000 || !document.body.innerText.includes('lost')) { clearInterval(iv); res(); } }, 60); })); break; }
        case 13: { const q = G.genSteady(seed, level, twist); await sleep(300); const box = await p.locator('div[style*="touch-action: none"]').first().boundingBox(); const W = box.width, H = Math.round(W * 1.15);
          await p.mouse.move(box.x + q.pts[0][0] * W, box.y + q.pts[0][1] * H); await p.mouse.down();
          for (const [x, y] of q.pts) { await p.mouse.move(box.x + x * W, box.y + y * H, { steps: 3 }); } await p.mouse.up(); break; }
        case 14: { const q = G.genInk(seed, level, twist); for (const r of q.rounds) { await sleep(150); await tapL(G.INK[r.askWord ? r.word : r.ink][0]); } break; }
        case 15: { const q = G.genOdd(seed, level, twist); for (const r of q.rounds) { await sleep(700); for (const i of r.odd) await tapL(`Symbol ${i + 1}`); } break; }
        case 16: { const q = G.genSum(seed, level, twist); for (const i of q.pick) await tapL(`Number ${q.nums[i]}`); await p.getByRole('button', { name: 'Check', exact: true }).last().click(); break; }
        case 17: { const q = G.genNext(seed, level, twist); for (const r of q.rounds) { await sleep(350); await tapL(`Answer ${r.answer}`); await sleep(500); } break; }
        case 18: { const q = G.genScramble(seed, level, twist); const want = q.backwards ? q.word.split('').reverse() : q.word.split(''); const used = new Set<number>();
          for (const ch of want) { const i = q.tiles.findIndex((x, j) => x === ch && !used.has(j)); used.add(i); await p.locator(`button[data-tile="${i}"]`).dispatchEvent('pointerdown'); await sleep(90); } break; }
        case 19: { const q = G.genMirror(seed, level, twist); for (const i of q.answer) await tapL(`Square ${i + 1}`); break; }
      }
      await sleep(1300);
      if (process.env.DBG) await p.screenshot({ path: `${OUT}dbg-${k}.png` });
      const body = await p.locator('body').innerText();
      const ok = /\d+\.\d s/.test(body) && /Again/i.test(body) && !/Missed/i.test(body);
      const why = ok ? '' : (body.match(/Missed[\s\S]{0,80}/i)?.[0] ?? body.slice(0, 120)).replace(/\n/g, ' ');
      results.push(`${ok ? 'PASS' : 'FAIL'} ${k} ${t.name} L${level} ${twist ?? '-'} ${why}`);
      await p.screenshot({ path: `${OUT}${String(k).padStart(2, '0')}-${t.key}.png` });
      await p.getByRole('button', { name: 'Done' }).click().catch(() => p.getByRole('button', { name: 'Close practice' }).click());
      await sleep(500);
    } catch (e: any) { results.push(`ERR ${k} ${t.name} ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}${String(k).padStart(2, '0')}-${t.key}-err.png` }); await p.goto('http://localhost:5173/home/train'); await sleep(1500); }
  }
  console.log(results.join('\n'));
  console.log('ERRORS', errs.slice(0, 10));
  await b.close();
})();
