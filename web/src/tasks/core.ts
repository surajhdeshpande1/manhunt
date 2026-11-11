/**
 * The 20 TAG tasks. Every task has ONE fixed rule that players learn once (the "playbook"), but every
 * instance is generated fresh from a seed: new layout, new symbols, new numbers. Difficulty (level 1-5)
 * rises with how often the player has solved that task before and how deep they are into the match,
 * and from level 2 on a random TWIST bends the rule so even a mastered task feels uncomfortable.
 */
import { mulberry32 } from '../lib/rng';

export type Rnd = () => number;
export const ri = (r: Rnd, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
export const pickOne = <T,>(r: Rnd, a: readonly T[]): T => a[Math.floor(r() * a.length)];
export function shuf<T>(a: readonly T[], r: Rnd): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

export type Cat = 'Memory' | 'Codes' | 'Reflex' | 'Logic';
export type TwistDef = { key: string; label: string; hint: string };
export type TaskDef = { id: number; key: string; name: string; cat: Cat; rule: string; how: string[]; twists: TwistDef[]; time: number[] };

export const TASKS: TaskDef[] = [
  { id: 0, key: 'echo', name: 'Echo', cat: 'Memory', rule: 'Watch the flashes. Tap them back in the same order.',
    how: ['Tiles light up one by one.', 'Tap the same tiles in the same order.', 'Say the order in your head as it plays.'],
    twists: [{ key: 'reverse', label: 'Backwards', hint: 'Tap the order in reverse.' }, { key: 'shuffle', label: 'Shuffle', hint: 'Tiles move after the show. Follow the symbols, not the spots.' }, { key: 'fast', label: 'Rapid', hint: 'Faster flashes.' }],
    time: [30, 28, 26, 24, 22] },
  { id: 1, key: 'pairs', name: 'Pairs', cat: 'Memory', rule: 'Flip two at a time. Match every pair.',
    how: ['Tap a card, then another.', 'Same symbol = they stay open.', 'Remember where each symbol was.'],
    twists: [{ key: 'decoy', label: 'Decoy', hint: 'One card has no partner. Leave it.' }, { key: 'drift', label: 'Drift', hint: 'Every 3 misses, two hidden cards swap places.' }, { key: 'colour', label: 'Colour match', hint: 'Pairs share a COLOUR, not a shape.' }],
    time: [60, 58, 56, 54, 50] },
  { id: 2, key: 'flash', name: 'Flash Grid', cat: 'Memory', rule: 'Memorise the lit squares, then tap every one.',
    how: ['Squares light up for a moment.', 'Tap all of them, any order.', 'Remember the shape they make.'],
    twists: [{ key: 'inverse', label: 'Inverse', hint: 'Tap the squares that were NOT lit.' }, { key: 'turn', label: 'Turn', hint: 'The grid turns before you answer. The lit squares turn with it.' }, { key: 'mirror', label: 'Mirror', hint: 'The grid flips before you answer. The lit squares flip with it.' }],
    time: [25, 23, 21, 19, 17] },
  { id: 3, key: 'trail', name: 'Trail', cat: 'Memory', rule: 'A path crawls across the grid. Trace it start to end.',
    how: ['Watch the path crawl square by square.', 'Tap the squares in the same order.', 'Remember the turns, not every square.'],
    twists: [{ key: 'reverse', label: 'Backwards', hint: 'Trace it from the END to the start.' }, { key: 'ghost', label: 'Ghost', hint: 'The path runs once, fast.' }],
    time: [30, 28, 26, 24, 22] },
  { id: 4, key: 'safe', name: 'Safe Crack', cat: 'Codes', rule: 'Green = right digit, right spot. Amber = right digit, wrong spot.',
    how: ['Guess the code.', 'Green: keep it there. Amber: move it. Grey: drop it.', 'Use each guess to rule digits out.'],
    twists: [{ key: 'blind', label: 'Blind', hint: 'You only get counts, not which digit.' }, { key: 'repeat', label: 'Repeats', hint: 'Digits can repeat in the code.' }],
    time: [75, 72, 68, 64, 60] },
  { id: 5, key: 'cipher', name: 'Cipher', cat: 'Codes', rule: 'Every letter is shifted by the key. Shift each one back.',
    how: ['The key A→D means every letter moved 3 forward.', 'Move each letter 3 back: D→A, E→B.', 'Type the real word.'],
    twists: [{ key: 'nokey', label: 'No key', hint: 'No key. You only get the first letter.' }, { key: 'mirror', label: 'Mirror', hint: 'The coded word is also written backwards.' }],
    time: [55, 50, 46, 42, 38] },
  { id: 6, key: 'glyph', name: 'Glyph Lock', cat: 'Codes', rule: 'Each symbol stands for a digit. Look it up and punch it in.',
    how: ['The legend pairs symbols with digits.', 'Read the code symbol by symbol.', 'Type the matching digits.'],
    twists: [{ key: 'vanish', label: 'Vanish', hint: 'The legend disappears after a few seconds.' }, { key: 'scramble', label: 'Scrambled pad', hint: 'The keypad digits are out of order.' }, { key: 'reverse', label: 'Backwards', hint: 'Enter the code in reverse.' }],
    time: [40, 37, 34, 31, 28] },
  { id: 7, key: 'binary', name: 'Binary', cat: 'Codes', rule: 'Switches are worth 1, 2, 4, 8… from the right. Make the number.',
    how: ['Each switch doubles the one to its right.', 'Turn on the biggest that fits, then the next.', '13 = 8 + 4 + 1.'],
    twists: [{ key: 'flipped', label: 'Flipped', hint: 'Values run from the LEFT: 1, 2, 4…' }, { key: 'blank', label: 'No labels', hint: 'Values are hidden. Remember them.' }, { key: 'math', label: 'Do the maths', hint: 'The target is a sum. Work it out first.' }],
    time: [30, 28, 26, 24, 22] },
  { id: 8, key: 'wires', name: 'Wire Cut', cat: 'Codes', rule: 'Check the 4 rules in order. The first one that fits says which wire.',
    how: ['1 · Exactly one ORANGE → cut it.', '2 · Last wire BLACK → cut the first.', '3 · Two+ YELLOW → cut the last yellow.', '4 · Otherwise → cut the second.'],
    twists: [{ key: 'flip', label: 'Upside down', hint: 'Read the wires bottom to top.' }, { key: 'dark', label: 'No manual', hint: 'The rule card is gone. You know it.' }],
    time: [25, 23, 21, 19, 17] },
  { id: 9, key: 'lights', name: 'Lights Out', cat: 'Logic', rule: 'A tap flips that light and its neighbours. Turn them all off.',
    how: ['Tapping flips the light and the 4 next to it.', 'Work row by row from the top.', 'Tapping twice undoes a tap.'],
    twists: [{ key: 'x', label: 'X-flip', hint: 'Taps flip the DIAGONAL neighbours instead.' }, { key: 'tight', label: 'Few moves', hint: 'No spare moves.' }],
    time: [45, 45, 50, 50, 55] },
  { id: 10, key: 'pipes', name: 'Pipeline', cat: 'Logic', rule: 'Rotate pieces until the flow runs from IN to OUT.',
    how: ['Tap a piece to turn it.', 'Start at IN and connect piece by piece.', 'The flow lights up as it connects.'],
    twists: [{ key: 'dark', label: 'Blackout', hint: 'You only see pieces next to the flow.' }, { key: 'bolted', label: 'Bolted', hint: 'Some pieces are bolted and can\'t turn.' }],
    time: [60, 60, 58, 56, 54] },
  { id: 11, key: 'zone', name: 'Dead Zone', cat: 'Reflex', rule: 'Tap when the needle is inside the zone.',
    how: ['The needle sweeps across the bar.', 'Tap LOCK when it\'s inside the orange zone.', 'Each hit makes it faster and the zone smaller.'],
    twists: [{ key: 'drift', label: 'Drift', hint: 'The zone slides around.' }, { key: 'ghost', label: 'Ghost', hint: 'The needle vanishes over the zone. Time it.' }],
    time: [30, 30, 30, 32, 34] },
  { id: 12, key: 'ember', name: 'Ember Strike', cat: 'Reflex', rule: 'Hit ORANGE targets. Never touch YELLOW.',
    how: ['Targets pop up and fade.', 'Tap every orange one.', 'One yellow tap and you fail.'],
    twists: [{ key: 'swap', label: 'Swap', hint: 'Halfway, the colours switch roles.' }, { key: 'tiny', label: 'Pinpoint', hint: 'Smaller targets.' }, { key: 'decoy', label: 'Fakes', hint: 'Red fakes appear too. Don\'t touch them.' }],
    time: [30, 30, 30, 30, 30] },
  { id: 13, key: 'steady', name: 'Steady Hand', cat: 'Reflex', rule: 'Drag the dot along the track to the end. Don\'t leave it.',
    how: ['Press on the dot at the start.', 'Drag along the track without lifting.', 'Leave the track and you go back to the start.'],
    twists: [{ key: 'narrow', label: 'Narrowing', hint: 'The track gets thinner towards the end.' }, { key: 'fog', label: 'Fog', hint: 'You only see the track near your finger.' }],
    time: [35, 32, 30, 28, 26] },
  { id: 14, key: 'ink', name: 'Ink', cat: 'Reflex', rule: 'Tap the colour of the INK, not the word.',
    how: ['A colour word appears in some ink.', 'Ignore what it says. Tap the ink colour.', 'Be quick, each round has a timer.'],
    twists: [{ key: 'flip', label: 'Flip', hint: 'Some rounds ask for the WORD instead. Watch the header.' }, { key: 'shuffle', label: 'Shuffle', hint: 'The buttons move every round.' }],
    time: [30, 30, 30, 30, 30] },
  { id: 15, key: 'odd', name: 'Odd One', cat: 'Logic', rule: 'Everything matches except one. Find it.',
    how: ['Scan the grid row by row.', 'Look for a different turn, colour or shape.', 'Tap the one that\'s different.'],
    twists: [{ key: 'two', label: 'Two odd', hint: 'There are TWO odd ones. Find both.' }, { key: 'restless', label: 'Restless', hint: 'The grid reshuffles every few seconds.' }],
    time: [30, 28, 26, 26, 26] },
  { id: 16, key: 'sum', name: 'Target Sum', cat: 'Logic', rule: 'Pick exactly N numbers that add up to the target.',
    how: ['Look at the target and how many numbers to use.', 'Start with the biggest that fits.', 'Tap to select, then check.'],
    twists: [{ key: 'negative', label: 'Negatives', hint: 'Some numbers are below zero.' }, { key: 'hidden', label: 'Blind', hint: 'Numbers hide after 4 seconds.' }],
    time: [40, 38, 36, 34, 32] },
  { id: 17, key: 'next', name: 'Next Number', cat: 'Logic', rule: 'Find the rule in the row. Pick what comes next.',
    how: ['Check the jumps between numbers.', 'Try +, ×, or two rules taking turns.', 'Pick the number that continues it.'],
    twists: [{ key: 'gap', label: 'Gap', hint: 'Find the MISSING number in the middle.' }, { key: 'back', label: 'Backwards', hint: 'The row runs backwards. Pick what came BEFORE.' }],
    time: [45, 42, 40, 38, 36] },
  { id: 18, key: 'scramble', name: 'Scramble', cat: 'Logic', rule: 'Tap the letters in order to rebuild the word.',
    how: ['Look for common starts: ST, CH, TR…', 'Use the hint.', 'Tap letters in order. Undo if you slip.'],
    twists: [{ key: 'extra', label: 'Spare letter', hint: 'One letter doesn\'t belong.' }, { key: 'nohint', label: 'No hint', hint: 'No category hint.' }, { key: 'back', label: 'Backwards', hint: 'Spell it from the LAST letter.' }],
    time: [40, 38, 36, 34, 32] },
  { id: 19, key: 'mirror', name: 'Mirror', cat: 'Memory', rule: 'Copy the pattern as its mirror image.',
    how: ['The mirror line runs down the middle.', 'Left becomes right, right becomes left.', 'Top and bottom stay where they are.'],
    twists: [{ key: 'turn', label: 'Turn', hint: 'Rotate it 90° clockwise instead.' }, { key: 'flip', label: 'Upside down', hint: 'Mirror it top to bottom.' }],
    time: [40, 38, 36, 34, 32] },
];
export const TASK_COUNT = TASKS.length;

/** Twist for this instance: none at level 1, then more and more likely. Deterministic per seed. */
export function twistFor(id: number, seed: number, level: number): string | null {
  const t = TASKS[id]?.twists ?? [];
  if (!t.length) return null;
  const r = mulberry32((seed ^ 0x5bd1e995) + id * 7919);
  const chance = [0, 0.35, 0.6, 0.8, 1][Math.max(1, Math.min(5, level)) - 1];
  return r() < chance ? t[Math.floor(r() * t.length)].key : null;
}
export const timeFor = (id: number, level: number) => (TASKS[id]?.time[Math.max(1, Math.min(5, level)) - 1] ?? 30) * 1000;
export const clampLevel = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

/** Same formula the server uses, for practice. */
export function autoLevel(mastery: number, index = 0, diff: 'easy' | 'normal' | 'hard' = 'normal') {
  return clampLevel(1 + Math.min(2, Math.floor(mastery / 3)) + Math.min(2, Math.floor(index / 4)) + (diff === 'easy' ? -1 : diff === 'hard' ? 1 : 0));
}
export const MASTERY = [
  { at: 0, name: 'New' }, { at: 3, name: 'Trained' }, { at: 6, name: 'Sharp' }, { at: 12, name: 'Expert' }, { at: 25, name: 'Master' },
];
export function masteryOf(n: number) { let m = MASTERY[0]; for (const x of MASTERY) if (n >= x.at) m = x; return m; }
