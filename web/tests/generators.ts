import * as G from '../src/tasks/gen';
import { TASKS, twistFor } from '../src/tasks/core';
const fails: string[] = [];
const ok = (c: any, m: string) => { if (!c) fails.push(m); };
const tw = (id: number) => [null, ...TASKS[id].twists.map((t) => t.key)];
const ruleCount = [0, 0, 0, 0, 0];
const nextLen: Record<number, number> = {};
for (let seed = 1; seed <= 400; seed++) for (let L = 1; L <= 5; L++) {
  const s = seed * 7919 + L;
  for (const t of tw(0)) { const p = G.genEcho(s, L, t); ok(p.answer.length === p.seq.length, 'echo len'); ok([...p.order].sort((a, b) => a - b).join() === [...Array(p.tiles).keys()].join(), 'echo perm'); ok(p.seq.every((x, i) => i === 0 || x !== p.seq[i - 1]), 'echo repeat'); }
  for (const t of tw(1)) { const p = G.genPairs(s, L, t); const c: Record<number, number> = {}; p.deck.forEach((d) => (c[d.pair] = (c[d.pair] || 0) + 1)); ok(Object.entries(c).every(([k, v]) => (k === '-1' ? v === 1 : v === 2)), 'pairs count ' + JSON.stringify(c)); ok(p.deck.length === p.pairs * 2 + (t === 'decoy' ? 1 : 0), 'pairs deck'); }
  for (const t of tw(2)) { const p = G.genFlash(s, L, t); ok(p.answer.length > 0 && p.answer.every((i) => i >= 0 && i < p.n * p.n), 'flash ans'); if (t === 'inverse') ok(p.answer.length >= 4 && p.answer.length <= 6, 'flash inverse count ' + p.answer.length); }
  for (const t of tw(3)) { const p = G.genTrail(s, L, t); const exp = [5, 6, 7, 8, 9][L - 1]; ok(p.path.length === exp, 'trail len ' + p.path.length); ok(new Set(p.path).size === p.path.length, 'trail unique'); ok(p.path.every((c, i) => { if (!i) return true; const a = p.path[i - 1]; const d = Math.abs(Math.floor(a / p.n) - Math.floor(c / p.n)) + Math.abs((a % p.n) - (c % p.n)); return d === 1; }), 'trail adj'); }
  for (const t of tw(4)) { const p = G.genSafe(s, L, t); ok(p.code.length === p.len && p.code.every((d) => d >= 0 && d <= p.max), 'safe code'); if (t === 'repeat') ok(new Set(p.code).size < p.len, 'safe repeat'); else ok(new Set(p.code).size === p.len, 'safe distinct'); ok(G.scoreGuess(p.code, p.code).every((m) => m === 2), 'safe score'); }
  for (const t of tw(5)) { const p = G.genMaze(s, L, t); ok(p.path.length >= p.n, 'maze path'); let c = p.start; for (const d of p.path) { const nx = G.mazeStep(p.open, p.n, c, d); ok(nx !== null, 'maze wall'); c = nx as number; } ok(c === p.exit, 'maze reaches exit'); ok(p.open.every((o: number) => o > 0), 'maze cells linked'); }
  for (const t of tw(6)) { const p = G.genGlyph(s, L, t); const map = new Map(p.legend.map((x) => [x.g, x.d])); const digits = p.code.map((g) => map.get(g)!); ok((t === 'reverse' ? [...digits].reverse() : digits).join() === p.answer.join(), 'glyph answer'); ok(new Set(p.legend.map((x) => x.d)).size === p.legend.length, 'glyph distinct digits'); }
  for (const t of tw(7)) { const p = G.genBinary(s, L, t); ok(p.target > 0 && p.target < 2 ** p.bits, 'bin range'); if (p.expr) { const v = Function(`return ${p.expr.replace('×', '*').replace('−', '-')}`)(); ok(v === p.target, 'bin expr ' + p.expr + '=' + p.target); } }
  for (const t of tw(8)) { const p = G.genWires(s, L, t); ok(p.answer >= 0 && p.answer < p.wires.length, 'wire idx'); ruleCount[p.rule]++; }
  for (const t of tw(9)) { const p = G.genLights(s, L, t); let b = p.board; for (const x of p.solution) b = G.lightsPress(b, x, p.n, p.x); ok(b.every((v) => !v), 'lights solvable'); ok(p.board.some(Boolean), 'lights nonempty'); ok(p.limit >= p.solution.length, 'lights limit'); }
  for (const t of tw(10)) { const p = G.genPipes(s, L, t); const solved = p.cells.map((c) => (c.path ? { ...c, rot: c.good } : c)); ok(G.pipeFlow(solved, p.n, p.inRow, p.outRow).done, 'pipes solvable'); ok(!G.pipeFlow(p.cells, p.n, p.inRow, p.outRow).done, 'pipes scrambled'); ok(p.cells.filter((c) => c.path && c.bolted).every((c) => c.rot === c.good), 'pipes bolted ok'); }
  for (const t of tw(11)) { const p = G.genZone(s, L, t); ok(p.zones.every((z) => z.at - z.w / 2 > 0 && z.at + z.w / 2 < 1), 'zone in bar'); }
  for (const t of tw(12)) { const p = G.genEmber(s, L, t); ok(p.spawns.filter((x) => x.kind === 'good').length > p.need * 2, 'ember enough'); }
  for (const t of tw(13)) { const p = G.genSteady(s, L, t); ok(p.pts.every(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1), 'steady in box'); }
  for (const t of tw(14)) { const p = G.genInk(s, L, t); ok(p.rounds.every((x) => x.order.length === p.k && x.ink < p.k && x.word < p.k), 'ink'); }
  for (const t of tw(15)) { const p = G.genOdd(s, L, t); ok(p.rounds.every((x) => x.odd.every((i) => i < x.n * x.n) && x.odd.length === (t === 'two' ? 2 : 1)), 'odd'); }
  for (const t of tw(16)) { const p = G.genSum(s, L, t); ok(p.pick.reduce((a, i) => a + p.nums[i], 0) === p.target, 'sum'); ok(new Set(p.nums).size === p.nums.length && !p.nums.includes(0), 'sum distinct'); ok(new Set(p.pick).size === p.k, 'sum pick'); }
  for (const t of tw(17)) { const p = G.genNext(s, L, t); for (const x of p.rounds) { ok(x.options.includes(x.answer) && new Set(x.options).size === x.options.length, 'next opts'); nextLen[x.options.length] = (nextLen[x.options.length] || 0) + 1; ok(Number.isFinite(x.answer), 'next finite'); } }
  for (const t of tw(18)) { const p = G.genScramble(s, L, t); ok([...p.tiles].sort().join('').length === p.word.length + (t === 'extra' ? 1 : 0), 'scr len'); ok(G.scrambleOk(p.word, t === 'back' ? p.word.split('').reverse().join('') : p.word, p.backwards), 'scr ok'); }
  for (const t of tw(19)) { const p = G.genMirror(s, L, t); ok(new Set(p.answer).size === p.answer.length && p.answer.every((i) => i < p.n * p.n), 'mirror'); }
  for (let id = 0; id < 20; id++) twistFor(id, s, L);
}
const uniq = [...new Set(fails)];
console.log('fail kinds:', uniq.length, uniq.slice(0, 12));
console.log('wire rules', ruleCount, 'next option counts', nextLen);
