/** Pure, seeded puzzle generators for the 20 tasks. No UI here, so they can be tested headless. */
import { mulberry32 } from '../lib/rng';
import { pickOne, ri, shuf, type Rnd } from './core';
import { ALL_WORDS, wordsBetween } from './words';

export const GLYPHS = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'plus', 'hexagon', 'ring', 'half', 'arrow', 'bolt', 'moon', 'drop', 'chevron', 'flag', 'ell', 'bars'] as const;
export type GlyphKey = (typeof GLYPHS)[number];
/** shapes that look different when turned */
export const TURNABLE: GlyphKey[] = ['arrow', 'bolt', 'moon', 'half', 'drop', 'chevron', 'flag', 'ell', 'triangle'];
/** shapes whose mirror image is a different shape */
export const CHIRAL: GlyphKey[] = ['bolt', 'flag', 'ell'];
export const PAIR_COLORS = ['#e4572e', '#f2b134', '#ede6da', '#4fb477', '#3e7bfa', '#b67cff', '#ff7aa8', '#2ec4b6', '#9aa3ad', '#a8682c'];
export const NOISE_COLORS = ['#d9541e', '#c9a227', '#ede6da', '#7fa38a', '#8ea0c8', '#c96f8d'];
export const INK = [['RED', '#ff4d4d'], ['BLUE', '#4d8dff'], ['GREEN', '#3fcf6e'], ['YELLOW', '#ffd23f'], ['PURPLE', '#b67cff']] as const;
export const WIRE_COLORS = ['orange', 'yellow', 'black', 'white', 'blue'] as const;
export type Wire = (typeof WIRE_COLORS)[number];

const L5 = <T,>(L: number, a: T[]) => a[Math.max(1, Math.min(5, L)) - 1];
const R = (seed: number, salt = 0) => mulberry32((seed >>> 0) + salt * 1013904223);

/* 0 · ECHO */
export function genEcho(seed: number, L: number, twist: string | null) {
  const r = R(seed, 1);
  const tiles = L5(L, [4, 6, 6, 9, 9]);
  const len = L5(L, [4, 5, 6, 7, 8]);
  const glyphs = shuf(GLYPHS, r).slice(0, tiles) as GlyphKey[];
  const colors = Array.from({ length: tiles }, () => pickOne(r, NOISE_COLORS));
  const seq: number[] = [];
  while (seq.length < len) { const t = ri(r, 0, tiles - 1); if (t !== seq[seq.length - 1]) seq.push(t); }
  let order = [...Array(tiles).keys()];
  if (twist === 'shuffle') { do { order = shuf(order, r); } while (order.filter((v, i) => v === i).length > tiles / 3); }
  return { tiles, cols: tiles === 4 ? 2 : 3, glyphs, colors, seq, answer: twist === 'reverse' ? [...seq].reverse() : seq, order,
    flashMs: twist === 'fast' ? 270 : L5(L, [520, 480, 440, 400, 360]), gapMs: 150 };
}

/* 1 · PAIRS */
export function genPairs(seed: number, L: number, twist: string | null) {
  const r = R(seed, 2);
  const n = L5(L, [6, 6, 8, 10, 10]);
  const syms = shuf(GLYPHS, r).slice(0, n + 1) as GlyphKey[];
  const cols = shuf(PAIR_COLORS, r);
  const cards: { pair: number; glyph: GlyphKey; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    if (twist === 'colour') cards.push({ pair: i, glyph: pickOne(r, GLYPHS), color: cols[i] }, { pair: i, glyph: pickOne(r, GLYPHS), color: cols[i] });
    else {
      const c = L >= 3 ? null : cols[i];
      cards.push({ pair: i, glyph: syms[i], color: c ?? pickOne(r, NOISE_COLORS) }, { pair: i, glyph: syms[i], color: c ?? pickOne(r, NOISE_COLORS) });
    }
  }
  if (twist === 'decoy') cards.push({ pair: -1, glyph: syms[n], color: pickOne(r, NOISE_COLORS) });
  const deck = shuf(cards, r);
  return { deck, pairs: n, cols: deck.length > 12 ? 5 : 4, drift: twist === 'drift', byColour: twist === 'colour', swapSeed: ri(r, 1, 1e9) };
}

/* 2 · FLASH GRID */
export function genFlash(seed: number, L: number, twist: string | null) {
  const r = R(seed, 3);
  let n = L5(L, [4, 4, 5, 5, 6]);
  let k = L5(L, [4, 5, 6, 7, 8]);
  if (twist === 'inverse') { n = 4; k = 16 - L5(L, [4, 5, 5, 6, 6]); }
  const lit = shuf([...Array(n * n).keys()], r).slice(0, k).sort((a, b) => a - b);
  const answer = twist === 'inverse' ? [...Array(n * n).keys()].filter((i) => !lit.includes(i)) : lit;
  return { n, lit, answer, showMs: L5(L, [1800, 1600, 1450, 1300, 1150]) + (twist === 'inverse' ? 500 : 0),
    turn: twist === 'turn' ? 90 : 0, mirror: twist === 'mirror', mistakes: L <= 2 ? 1 : 0 };
}

/* 3 · TRAIL */
export function genTrail(seed: number, L: number, twist: string | null) {
  const r = R(seed, 4);
  const n = L <= 3 ? 5 : 6;
  const len = L5(L, [5, 6, 7, 8, 9]);
  let path: number[] = [];
  for (let t = 0; t < 400 && path.length < len; t++) {
    path = [ri(r, 0, n * n - 1)];
    while (path.length < len) {
      const cur = path[path.length - 1], row = Math.floor(cur / n), col = cur % n;
      const opts = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => a * n + b).filter((x) => !path.includes(x));
      if (!opts.length) break;
      path.push(pickOne(r, opts));
    }
  }
  return { n, path, answer: twist === 'reverse' ? [...path].reverse() : path, stepMs: twist === 'ghost' ? 190 : L5(L, [430, 390, 350, 320, 290]) };
}

/* 4 · SAFE CRACK */
export function genSafe(seed: number, L: number, twist: string | null) {
  const r = R(seed, 5);
  const len = L === 1 ? 3 : 4;
  const max = L <= 2 ? 5 : 7;
  const code = twist === 'repeat' ? Array.from({ length: len }, () => ri(r, 0, max)) : shuf([...Array(max + 1).keys()], r).slice(0, len);
  if (twist === 'repeat' && new Set(code).size === len) code[ri(r, 1, len - 1)] = code[0];
  return { len, max, guesses: L5(L, [8, 8, 8, 7, 7]), code, repeats: twist === 'repeat', blind: twist === 'blind' };
}
/** 2 = right digit right spot, 1 = right digit wrong spot, 0 = not in the code (duplicate-aware) */
export function scoreGuess(code: number[], g: number[]) {
  const marks = g.map(() => 0); const left: Record<number, number> = {};
  code.forEach((d, i) => { if (g[i] === d) marks[i] = 2; else left[d] = (left[d] || 0) + 1; });
  g.forEach((d, i) => { if (marks[i] !== 2 && left[d]) { marks[i] = 1; left[d]--; } });
  return marks;
}

/* 5 · CIPHER */
export function genCipher(seed: number, L: number, twist: string | null) {
  const r = R(seed, 6);
  const [mn, mx] = L5(L, [[4, 5], [5, 6], [6, 7], [7, 8], [8, 10]]);
  const pick = pickOne(r, wordsBetween(mn, mx));
  const shift = L === 1 ? ri(r, 1, 4) : L === 2 ? ri(r, 1, 8) : ri(r, 1, 25);
  const enc = pick.w.split('').map((ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65)).join('');
  return { word: pick.w, cat: pick.cat, shift, enc: twist === 'mirror' ? enc.split('').reverse().join('') : enc,
    keyTo: String.fromCharCode(65 + shift), showKey: twist !== 'nokey', first: pick.w[0], tries: 2 };
}

/* 6 · GLYPH LOCK */
export function genGlyph(seed: number, L: number, twist: string | null) {
  const r = R(seed, 7);
  const n = L5(L, [5, 6, 7, 8, 10]);
  const syms = shuf(GLYPHS, r).slice(0, n) as GlyphKey[];
  const digits = shuf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], r).slice(0, n);
  const legend = syms.map((g, i) => ({ g, d: digits[i] }));
  const len = L5(L, [4, 4, 5, 5, 6]);
  const idx = Array.from({ length: len }, () => ri(r, 0, n - 1));
  const code = idx.map((i) => legend[i].g);
  const digitsCode = idx.map((i) => legend[i].d);
  return { legend: shuf(legend, r), code, answer: twist === 'reverse' ? [...digitsCode].reverse() : digitsCode,
    pad: twist === 'scramble' ? shuf([1, 2, 3, 4, 5, 6, 7, 8, 9, 0], r) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
    vanishMs: twist === 'vanish' ? L5(L, [5000, 4500, 4000, 3500, 3000]) : 0 };
}

/* 7 · BINARY */
const pop = (x: number) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
export function genBinary(seed: number, L: number, twist: string | null) {
  const r = R(seed, 8);
  const bits = L5(L, [4, 5, 5, 6, 7]);
  let target = 0;
  do { target = ri(r, 3, 2 ** bits - 1); } while (pop(target) < 2);
  let expr: string | null = null;
  if (twist === 'math') {
    const kind = ri(r, 0, 2);
    const fs = [2, 3, 4, 5, 6, 7].filter((f) => target % f === 0 && target / f > 1);
    if (kind === 2 && fs.length) { const f = pickOne(r, fs); expr = `${target / f} × ${f}`; }
    else if (kind === 1) { const b = ri(r, 2, 30); expr = `${target + b} − ${b}`; }
    else { const a = ri(r, 1, target - 1); expr = `${a} + ${target - a}`; }
  }
  return { bits, target, expr, fromLeft: twist === 'flipped', labels: twist !== 'blank' };
}
export const binValue = (bits: number, pos: number, fromLeft: boolean) => 2 ** (fromLeft ? pos : bits - 1 - pos);

/* 8 · WIRE CUT */
export function wireRule(w: readonly Wire[], flip: boolean): { rule: number; cut: number } {
  const order = flip ? [...w.keys()].reverse() : [...w.keys()];
  const seq = order.map((i) => w[i]);
  const oranges = seq.flatMap((c, i) => (c === 'orange' ? [i] : []));
  const yellows = seq.flatMap((c, i) => (c === 'yellow' ? [i] : []));
  if (oranges.length === 1) return { rule: 1, cut: order[oranges[0]] };
  if (seq[seq.length - 1] === 'black') return { rule: 2, cut: order[0] };
  if (yellows.length >= 2) return { rule: 3, cut: order[yellows[yellows.length - 1]] };
  return { rule: 4, cut: order[1] };
}
export function genWires(seed: number, L: number, twist: string | null) {
  const r = R(seed, 9);
  const n = L5(L, [4, 4, 5, 5, 6]);
  const flip = twist === 'flip';
  const want = ri(r, 1, 4);
  let wires: Wire[] = [];
  for (let t = 0; t < 400; t++) { wires = Array.from({ length: n }, () => pickOne(r, WIRE_COLORS)); if (wireRule(wires, flip).rule === want) break; }
  const { rule, cut } = wireRule(wires, flip);
  return { wires, answer: cut, rule, flip, manual: (twist === 'dark' ? 'none' : L <= 2 ? 'open' : 'peek') as 'none' | 'open' | 'peek' };
}

/* 9 · LIGHTS OUT */
export function lightsPress(b: boolean[], p: number, n: number, x: boolean) {
  const row = Math.floor(p / n), col = p % n;
  const ds = x ? [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]] : [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
  const out = [...b];
  for (const [a, c] of ds) { const rr = row + a, cc = col + c; if (rr >= 0 && cc >= 0 && rr < n && cc < n) out[rr * n + cc] = !out[rr * n + cc]; }
  return out;
}
export function genLights(seed: number, L: number, twist: string | null) {
  const r = R(seed, 10);
  const n = L <= 2 ? 3 : 4;
  const presses = L5(L, [2, 3, 4, 4, 5]);
  const x = twist === 'x';
  let board: boolean[] = [], ps: number[] = [];
  for (let t = 0; t < 200; t++) {
    ps = shuf([...Array(n * n).keys()], r).slice(0, presses);
    board = Array(n * n).fill(false);
    for (const p of ps) board = lightsPress(board, p, n, x);
    if (board.filter(Boolean).length >= 3) break;
  }
  return { n, board, x, limit: twist === 'tight' ? presses : presses + L5(L, [4, 4, 3, 3, 2]), solution: ps };
}

/* 10 · PIPELINE  (bits: N=1 E=2 S=4 W=8) */
export const rot = (m: number, k = 1) => { let x = m; for (let i = 0; i < ((k % 4) + 4) % 4; i++) x = ((x << 1) | (x >> 3)) & 15; return x; };
const OPP: Record<number, number> = { 1: 4, 2: 8, 4: 1, 8: 2 };
const STEP: Record<number, [number, number]> = { 1: [-1, 0], 2: [0, 1], 4: [1, 0], 8: [0, -1] };
export type Pipe = { base: number; rot: number; path: boolean; bolted: boolean; good: number };
export function pipeFlow(cells: Pipe[], n: number, inRow: number, outRow: number) {
  const mask = (i: number) => rot(cells[i].base, cells[i].rot);
  const start = inRow * n;
  const seen = new Set<number>();
  if (!(mask(start) & 8)) return { seen, done: false };
  const q = [start]; seen.add(start);
  while (q.length) {
    const c = q.shift()!; const m = mask(c); const row = Math.floor(c / n), col = c % n;
    for (const d of [1, 2, 4, 8]) {
      if (!(m & d)) continue;
      const [dr, dc] = STEP[d]; const rr = row + dr, cc = col + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const nb = rr * n + cc;
      if (seen.has(nb) || !(mask(nb) & OPP[d])) continue;
      seen.add(nb); q.push(nb);
    }
  }
  const end = outRow * n + n - 1;
  return { seen, done: seen.has(end) && !!(mask(end) & 2) };
}
export function genPipes(seed: number, L: number, twist: string | null) {
  const r = R(seed, 11);
  const n = L5(L, [4, 4, 5, 5, 6]);
  const minLen = n + L5(L, [1, 2, 3, 4, 5]);
  let path: number[] = [];
  for (let t = 0; t < 600; t++) {
    const startRow = ri(r, 0, n - 1);
    path = [startRow * n];
    let ok = false;
    for (let s = 0; s < n * n; s++) {
      const cur = path[path.length - 1], row = Math.floor(cur / n), col = cur % n;
      if (col === n - 1 && path.length >= minLen) { ok = true; break; }
      const opts = [[row - 1, col], [row + 1, col], [row, col + 1], [row, col + 1], [row, col - 1]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => a * n + b).filter((x) => !path.includes(x));
      if (!opts.length) break;
      path.push(pickOne(r, opts));
    }
    if (ok) break;
    path = [];
  }
  if (!path.length) { const row = ri(r, 0, n - 1); path = Array.from({ length: n }, (_, c) => row * n + c); }
  const inRow = Math.floor(path[0] / n), outRow = Math.floor(path[path.length - 1] / n);
  const dirTo = (a: number, b: number) => { const d = b - a; return d === -n ? 1 : d === 1 ? 2 : d === n ? 4 : 8; };
  const cells: Pipe[] = Array.from({ length: n * n }, () => ({ base: 0, rot: 0, path: false, bolted: false, good: 0 }));
  path.forEach((c, i) => {
    const a = i === 0 ? 8 : dirTo(c, path[i - 1]);
    const b = i === path.length - 1 ? 2 : dirTo(c, path[i + 1]);
    const want = a | b;
    const base = want === 5 || want === 10 ? 5 : 3;
    let k = 0; while (rot(base, k) !== want) k++;
    cells[c] = { base, rot: 0, path: true, bolted: false, good: k };
  });
  const decoys = L >= 4 ? [5, 3, 7, 15] : [5, 3, 7];
  cells.forEach((c, i) => { if (!c.path) cells[i] = { base: pickOne(r, decoys), rot: ri(r, 0, 3), path: false, bolted: false, good: 0 }; });
  for (const c of cells) if (c.path) { do { c.rot = ri(r, 0, 3); } while (r() < 0.75 && rot(c.base, c.rot) === rot(c.base, c.good)); }
  if (twist === 'bolted') {
    for (const c of cells) {
      if (c.path && r() < 0.22) { c.rot = c.good; c.bolted = true; }
      else if (!c.path && r() < 0.3) c.bolted = true;
    }
  }
  for (let t = 0; t < 40 && pipeFlow(cells, n, inRow, outRow).done; t++) {
    const c = cells[pickOne(r, path)];
    c.bolted = false; c.rot = (c.good + 1) % 4;
  }
  if (pipeFlow(cells, n, inRow, outRow).done) {
    // decoys formed a shortcut: turn the IN piece away from the inlet
    const c = cells[path[0]]; c.bolted = false;
    for (let k = 0; k < 4; k++) if (!(rot(c.base, k) & 8)) { c.rot = k; break; }
  }
  return { n, cells, inRow, outRow, path, dark: twist === 'dark' };
}

/* 11 · DEAD ZONE */
export function genZone(seed: number, L: number, twist: string | null) {
  const r = R(seed, 12);
  const hits = L5(L, [3, 3, 4, 4, 5]);
  const w0 = L5(L, [0.16, 0.14, 0.13, 0.12, 0.11]);
  return { hits, misses: L5(L, [2, 2, 2, 1, 1]), zones: Array.from({ length: hits }, (_, i) => ({ at: 0.15 + r() * 0.7, w: w0 * Math.pow(0.86, i) })),
    speed0: L5(L, [0.55, 0.62, 0.7, 0.8, 0.9]), speedStep: 0.24, drift: twist === 'drift', ghost: twist === 'ghost', driftPhase: r() * 6.28 };
}

/* 12 · EMBER STRIKE */
export function genEmber(seed: number, L: number, twist: string | null) {
  const r = R(seed, 13);
  const bad = L5(L, [0.25, 0.3, 0.33, 0.36, 0.4]);
  return { need: L5(L, [8, 10, 11, 12, 14]), maxMiss: L5(L, [4, 3, 3, 2, 2]), every: L5(L, [650, 600, 560, 520, 470]), life: L5(L, [1350, 1200, 1100, 1000, 900]),
    size: Math.round(L5(L, [66, 62, 58, 54, 50]) * (twist === 'tiny' ? 0.72 : 1)), swap: twist === 'swap',
    spawns: Array.from({ length: 200 }, () => ({ x: r(), y: r(), kind: (r() < bad ? 'bad' : twist === 'decoy' && r() < 0.2 ? 'fake' : 'good') as 'bad' | 'fake' | 'good' })) };
}

/* 13 · STEADY HAND  (coordinates in a 0..1 box) */
export function genSteady(seed: number, L: number, twist: string | null) {
  const r = R(seed, 14);
  const k = L5(L, [4, 5, 5, 6, 7]);
  const way: [number, number][] = Array.from({ length: k }, (_, i) => {
    const y = 0.9 - (i / (k - 1)) * 0.8;
    const x = i === 0 ? 0.18 : i === k - 1 ? 0.82 : i % 2 ? 0.62 + r() * 0.24 : 0.14 + r() * 0.24;
    return [x, y];
  });
  const pts: [number, number][] = [];
  for (let i = 0; i < way.length - 1; i++) {
    const p0 = way[Math.max(0, i - 1)], p1 = way[i], p2 = way[i + 1], p3 = way[Math.min(way.length - 1, i + 2)];
    for (let s = 0; s < 14; s++) {
      const t = s / 14, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(way[way.length - 1]);
  return { pts, width: L5(L, [0.16, 0.14, 0.125, 0.11, 0.1]), narrow: twist === 'narrow', fog: twist === 'fog', resets: L5(L, [3, 3, 2, 2, 1]) };
}

/* 14 · INK */
export function genInk(seed: number, L: number, twist: string | null) {
  const r = R(seed, 15);
  const k = L <= 3 ? 4 : 5;
  const rounds = Array.from({ length: L5(L, [6, 7, 8, 9, 10]) }, (_, i) => {
    const word = ri(r, 0, k - 1);
    let ink = word;
    if (!(L >= 3 && r() < 0.15)) while (ink === word) ink = ri(r, 0, k - 1);
    return { word, ink, askWord: twist === 'flip' && i > 0 && r() < 0.4, order: twist === 'shuffle' ? shuf([...Array(k).keys()], r) : [...Array(k).keys()] };
  });
  return { k, rounds, ms: L5(L, [2600, 2300, 2050, 1850, 1650]), lives: L === 1 ? 1 : 0 };
}

/* 15 · ODD ONE */
export type OddMode = 'turn' | 'mirror' | 'shade' | 'size';
export function genOdd(seed: number, L: number, twist: string | null) {
  const r = R(seed, 16);
  const n = L5(L, [3, 4, 4, 5, 5]);
  const subtle = L >= 4;
  const rounds = Array.from({ length: L5(L, [3, 3, 4, 4, 5]) }, () => {
    const mode = pickOne(r, ['turn', 'turn', 'mirror', 'shade', 'size'] as OddMode[]);
    const glyph = mode === 'mirror' ? pickOne(r, CHIRAL) : mode === 'turn' ? pickOne(r, TURNABLE) : pickOne(r, GLYPHS);
    const odd = shuf([...Array(n * n).keys()], r).slice(0, twist === 'two' ? 2 : 1);
    return { n, glyph, color: pickOne(r, NOISE_COLORS), rot: pickOne(r, [0, 90, 180, 270]), mode,
      diff: mode === 'turn' ? (subtle ? pickOne(r, [35, -35]) : pickOne(r, [90, -90, 180])) : mode === 'shade' ? (subtle ? 0.24 : 0.42) : mode === 'size' ? (subtle ? 0.84 : 0.7) : 1, odd };
  });
  return { rounds, mistakes: L <= 2 ? 1 : 0, restless: twist === 'restless', shuffleSeed: ri(r, 1, 1e9) };
}

/* 16 · TARGET SUM */
export function genSum(seed: number, L: number, twist: string | null) {
  const r = R(seed, 17);
  const count = L5(L, [8, 9, 10, 12, 12]);
  const k = L5(L, [2, 2, 3, 3, 4]);
  const hi = L5(L, [20, 30, 40, 60, 99]);
  const lo = twist === 'negative' ? -Math.round(hi / 2) : 1;
  const nums: number[] = [];
  while (nums.length < count) { const v = ri(r, lo, hi); if (v !== 0 && !nums.includes(v)) nums.push(v); }
  if (twist === 'negative' && !nums.some((v) => v < 0)) nums[0] = -ri(r, 1, Math.round(hi / 2));
  const pick = shuf([...Array(count).keys()], r).slice(0, k);
  if (twist === 'negative' && !pick.some((i) => nums[i] < 0)) { const neg = nums.findIndex((v) => v < 0); if (!pick.includes(neg)) pick[0] = neg; }
  return { nums, k, target: pick.reduce((s, i) => s + nums[i], 0), pick, hideMs: twist === 'hidden' ? 4000 : 0, tries: L <= 2 ? 3 : 2 };
}

/* 17 · NEXT NUMBER */
type Seq = (r: Rnd) => number[];
const arith: Seq = (r) => { const a = ri(r, 1, 30), d = pickOne(r, [2, 3, 4, 5, 6, 7, 9, 11]); return Array.from({ length: 7 }, (_, i) => a + d * i); };
const down: Seq = (r) => { const d = ri(r, 3, 9), a = ri(r, 60, 99); return Array.from({ length: 7 }, (_, i) => a - d * i); };
const times: Seq = (r) => { const m = pickOne(r, [2, 2, 3]), a = ri(r, 1, m === 3 ? 3 : 5); return Array.from({ length: 7 }, (_, i) => a * m ** i); };
const squares: Seq = (r) => { const s = ri(r, 1, 6); return Array.from({ length: 7 }, (_, i) => (s + i) ** 2); };
const growDiff: Seq = (r) => { const a = ri(r, 1, 10), s = ri(r, 1, 3); const o = [a]; for (let i = 1; i < 7; i++) o.push(o[i - 1] + s * i); return o; };
const alt: Seq = (r) => { const a = ri(r, 10, 40), p = ri(r, 4, 9), m = ri(r, 1, p - 1); const o = [a]; for (let i = 1; i < 7; i++) o.push(o[i - 1] + (i % 2 ? p : -m)); return o; };
const fib: Seq = (r) => { const o = [ri(r, 1, 5), ri(r, 2, 7)]; while (o.length < 7) o.push(o[o.length - 1] + o[o.length - 2]); return o; };
const dbl1: Seq = (r) => { const o = [ri(r, 1, 4)]; const c = pickOne(r, [1, -1, 2]); while (o.length < 7) o.push(o[o.length - 1] * 2 + c); return o; };
const cubes: Seq = (r) => { const s = ri(r, 1, 3); return Array.from({ length: 7 }, (_, i) => (s + i) ** 3); };
const pron: Seq = (r) => { const s = ri(r, 1, 5); return Array.from({ length: 7 }, (_, i) => (s + i) * (s + i + 1)); };
const inter: Seq = (r) => { const a = ri(r, 1, 9), da = ri(r, 2, 5), b = ri(r, 20, 40), db = ri(r, 1, 4); return Array.from({ length: 7 }, (_, i) => (i % 2 ? b - db * Math.floor(i / 2) : a + da * (i / 2))); };
const altOps: Seq = (r) => { const o = [ri(r, 1, 5)]; const add = ri(r, 1, 4); while (o.length < 7) o.push(o.length % 2 ? o[o.length - 1] * 2 : o[o.length - 1] + add); return o; };
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61];
const primes: Seq = (r) => { const s = ri(r, 0, 8); return PRIMES.slice(s, s + 7); };
const tri: Seq = (r) => { const s = ri(r, 1, 6); return Array.from({ length: 7 }, (_, i) => ((s + i) * (s + i + 1)) / 2); };
const FAMS: Seq[][] = [[arith, down, times], [arith, times, squares, growDiff], [alt, fib, dbl1, growDiff, squares], [inter, cubes, pron, fib, dbl1], [primes, tri, altOps, inter, pron]];
export function genNext(seed: number, L: number, twist: string | null) {
  const r = R(seed, 18);
  const rounds = Array.from({ length: L5(L, [2, 2, 2, 3, 3]) }, () => {
    const seq = pickOne(r, FAMS[Math.max(1, Math.min(5, L)) - 1])(r);
    let shown: (number | null)[], answer: number;
    if (twist === 'gap') { const g = ri(r, 2, 3); shown = seq.slice(0, 6).map((v, i) => (i === g ? null : v)); answer = seq[g]; }
    else if (twist === 'back') { shown = [...seq.slice(1, 6)].reverse(); answer = seq[0]; }
    else { shown = seq.slice(0, 5); answer = seq[5]; }
    const last = twist === 'back' ? seq[1] : seq[4];
    const step = Math.abs(seq[5] - seq[4]) || 2;
    const cands = shuf([answer + 1, answer - 1, answer + step, answer - step, answer + 2, last + (last - (twist === 'back' ? seq[2] : seq[3])), answer * 2, answer + 10], r)
      .filter((v, i, a) => v !== answer && a.indexOf(v) === i && (answer < 0 || v >= 0));
    return { shown, answer, options: shuf([answer, ...cands.slice(0, 3)], r) };
  });
  return { rounds };
}

/* 18 · SCRAMBLE */
export function genScramble(seed: number, L: number, twist: string | null) {
  const r = R(seed, 19);
  const [mn, mx] = L5(L, [[4, 5], [5, 6], [6, 7], [7, 8], [8, 10]]);
  const pick = pickOne(r, wordsBetween(mn, mx));
  const letters = pick.w.split('');
  if (twist === 'extra') letters.push(pickOne(r, 'ABDEGHIKLMNOPRSTUY'.split('')));
  let tiles = shuf(letters, r);
  for (let t = 0; t < 20 && tiles.join('') === pick.w; t++) tiles = shuf(letters, r);
  return { word: pick.w, cat: pick.cat, tiles, backwards: twist === 'back', hint: twist !== 'nohint', tries: 3 };
}
const sortL = (w: string) => w.split('').sort().join('');
/** any bank word with the same letters counts (LISTEN / SILENT) */
export function scrambleOk(target: string, typed: string, backwards: boolean) {
  const w = backwards ? typed.split('').reverse().join('') : typed;
  if (w === target) return true;
  return w.length === target.length && sortL(w) === sortL(target) && ALL_WORDS.some((x) => x.w === w);
}

/* 19 · MIRROR */
export function genMirror(seed: number, L: number, twist: string | null) {
  const r = R(seed, 20);
  const n = L5(L, [4, 4, 5, 5, 6]);
  const k = L5(L, [4, 5, 6, 7, 9]);
  const tf = (i: number) => { const row = Math.floor(i / n), col = i % n; if (twist === 'turn') return col * n + (n - 1 - row); if (twist === 'flip') return (n - 1 - row) * n + col; return row * n + (n - 1 - col); };
  let src: number[] = [], answer: number[] = [];
  for (let t = 0; t < 100; t++) {
    src = shuf([...Array(n * n).keys()], r).slice(0, k).sort((a, b) => a - b);
    answer = src.map(tf).sort((a, b) => a - b);
    if (answer.filter((x) => src.includes(x)).length <= Math.floor(k / 2)) break;
  }
  return { n, src, answer, mistakes: L <= 2 ? 1 : 0 };
}
