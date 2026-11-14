// Puzzle accuracy audit: every round must have exactly one right answer, and everything a fair player could
// argue is right must be accepted. Run: npx esbuild tests/puzzles/audit.ts --bundle --platform=node --outfile=tests/.out/audit.cjs && node tests/.out/audit.cjs
import { genNext, genScramble, scrambleOk } from '../../src/tasks/gen';
import { TASKS, twistFor } from '../../src/tasks/core';
import { ALL_WORDS } from '../../src/tasks/words';

/* ---- does a 6-term sequence follow some simple rule a player could reasonably spot? ---- */
const isInt = (v: number) => Number.isInteger(v);
const diffs = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
const same = (a: number[]) => a.every((v) => v === a[0]);
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149];
const RULES: [string, (f: number[]) => boolean][] = [
  ['adds the same each time', (f) => same(diffs(f))],
  ['multiplies by the same each time', (f) => f.every((v) => v !== 0) && same(f.slice(1).map((v, i) => v / f[i])) && isInt(f[1] / f[0]) || (f.every((v) => v !== 0) && same(f.slice(1).map((v, i) => f[i] / v)) && isInt(f[0] / f[1]))],
  ['gaps grow evenly', (f) => same(diffs(diffs(f)))],
  ['gaps of gaps grow evenly', (f) => same(diffs(diffs(diffs(f))))],
  ['adds the two before', (f) => f.slice(2).every((v, i) => v === f[i] + f[i + 1])],
  ['×a + b each step', (f) => { const den = f[1] - f[0]; if (den === 0) return false; const a = (f[2] - f[1]) / den; if (!isInt(a)) return false; const b = f[1] - a * f[0]; return f.slice(1).every((v, i) => v === a * f[i] + b); }],
  ['two interleaved runs', (f) => same(diffs([f[0], f[2], f[4]])) && same(diffs([f[1], f[3], f[5]]))],
  ['alternates two steps', (f) => { const d = diffs(f); return d[0] !== d[1] && [d[0], d[2], d[4]].every((v) => v === d[0]) && [d[1], d[3]].every((v) => v === d[1]); }],
  ['alternates + and ×', (f) => { for (const start of [0, 1]) { const add = start === 0 ? f[1] - f[0] : f[2] - f[1]; const mulIdx = start === 0 ? 1 : 0; if (f[mulIdx] === 0) continue; const mul = f[mulIdx + 1] / f[mulIdx]; if (!isInt(mul) || mul === 1) continue;
      if (f.slice(1).every((v, i) => ((i + start) % 2 === 0 ? v === f[i] + add : v === f[i] * mul))) return true; } return false; }],
  ['consecutive primes', (f) => { const i = PRIMES.indexOf(f[0]); return i >= 0 && f.every((v, k) => PRIMES[i + k] === v) || (PRIMES.indexOf(f[5]) >= 0 && f.every((v, k) => PRIMES[PRIMES.indexOf(f[5]) + (5 - k)] === v)); }],
];
const fits = (f: number[]) => RULES.filter(([, ok]) => ok(f)).map(([n]) => n);

let problems = 0, rounds = 0;
const report = (msg: string) => { if (++problems <= 25) console.log('  ' + msg); };
const twistsOf = (kind: number) => [null, ...TASKS[kind].twists.map((t) => t.key)];

console.log('Next Number');
for (let seed = 1; seed <= 4000; seed++) for (let L = 1; L <= 5; L++) for (const tw of twistsOf(17)) {
  if (tw && L === 1) continue;
  const p = genNext(seed, L, tw);
  for (const rd of p.rounds) {
    rounds++;
    const blank = rd.shown.indexOf(null);
    // the order the rule runs in: the 'back' twist shows the run reversed and asks for the term before it
    const full = (x: number) => { const f = (blank >= 0 ? rd.shown.map((v) => (v === null ? x : v)) : [...rd.shown, x]) as number[]; return tw === 'back' ? f.reverse() : f; };
    if (!rd.options.includes(rd.answer) || new Set(rd.options).size !== rd.options.length) report(`bad options seed ${seed} L${L} ${tw}: ${rd.options}`);
    if (!fits(full(rd.answer)).length) report(`answer fits no rule I know  seed ${seed} L${L} ${tw}: ${full(rd.answer).join(', ')}`);
    for (const o of rd.options) if (o !== rd.answer) {
      const why = fits(full(o));
      if (why.length) report(`TWO ANSWERS seed ${seed} L${L} ${tw ?? '-'}: shown ${rd.shown.map((v) => v ?? '?').join(', ')} → right ${rd.answer}, but ${o} also ${why[0]}`);
    }
  }
}
console.log(`  ${rounds} rounds checked`);

console.log('Scramble');
const bank = new Map<number, string[]>(); for (const { w } of ALL_WORDS) { const a = bank.get(w.length) ?? []; a.push(w); bank.set(w.length, a); }
const sub = (word: string, tiles: string[]) => { const left = [...tiles]; for (const c of word) { const i = left.indexOf(c); if (i < 0) return false; left.splice(i, 1); } return true; };
let sr = 0;
for (let seed = 1; seed <= 4000; seed++) for (let L = 1; L <= 5; L++) for (const tw of twistsOf(18)) {
  const p = genScramble(seed, L, tw); sr++;
  if (!scrambleOk(p.word, p.backwards ? [...p.word].reverse().join('') : p.word, p.backwards)) report(`right word rejected seed ${seed} L${L} ${tw}: ${p.word}`);
  for (const w of bank.get(p.word.length) ?? []) if (w !== p.word && sub(w, p.tiles) && !scrambleOk(p.word, p.backwards ? [...w].reverse().join('') : w, p.backwards))
    report(`REAL WORD REJECTED seed ${seed} L${L} ${tw ?? '-'}: tiles ${p.tiles.join('')} make ${w}, answer ${p.word}`);
}
console.log(`  ${sr} rounds checked`);
console.log(problems ? `${problems} problem(s)` : 'no problems');
process.exit(problems ? 1 : 0);
