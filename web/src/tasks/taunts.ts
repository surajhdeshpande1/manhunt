/** The voice of the task master: needles you when you slip, never lets a win feel safe. */
const pick = (a: string[], n: number) => a[Math.abs(Math.floor(n)) % a.length];

const WIN_FAST = ['That was suspiciously fast.', 'Okay, show-off.', 'Too easy? Good. It won’t stay that way.', 'Blink and it’s done. Enjoy it while it lasts.'];
const WIN_CLOSE = ['By the skin of your teeth.', 'You enjoy the drama, don’t you.', 'That clock nearly had you.', 'Cutting it fine. Bold strategy.'];
const WIN = ['Clean.', 'Noted. Raising the bar.', 'Fine. The next one bites harder.', 'Not bad. Not safe either.', 'One down. Don’t get comfortable.'];
const WIN_TWIST = ['Even with the twist. Annoying.', 'The twist was supposed to stop you.', 'Twist and all. Fine, you’re good.'];
const LOSE_TIME = ['The clock sends its regards.', 'So close. Not close enough.', 'Time’s up. The hunters say thanks.', 'You had the answer. You didn’t have the seconds.'];
const LOSE_SLIP = ['You knew the rule.', 'That one’s on you.', 'The rule is right there at the top.', 'Bold move. Wrong, but bold.', 'Fingers faster than brain. Classic.'];
const LOSE_TWIST = ['The twist was in yellow. Bright yellow.', 'It warned you. In capitals.', 'Same rule, one twist, and down you go.'];

export function taunt(o: { ok: boolean; ms: number; left: number; total: number; twist: boolean; why?: string; level: number; seed: number }): string {
  const n = o.seed + o.ms;
  if (o.ok) {
    if (o.left < 3000) return `${(o.left / 1000).toFixed(1)} s to spare. ${pick(WIN_CLOSE, n)}`;
    if (o.ms < o.total * 0.3) return pick(WIN_FAST, n);
    if (o.twist) return pick(WIN_TWIST, n);
    return pick(WIN, n);
  }
  if (o.left <= 0 || /time/i.test(o.why ?? '')) return pick(LOSE_TIME, n);
  if (o.twist) return pick(LOSE_TWIST, n);
  return pick(LOSE_SLIP, n);
}

/** One line shown before the clock starts, so every level has a mood. */
export function dare(level: number, twist: boolean, seed: number): string {
  const L = [
    ['Warm-up. Take your time.', 'Nice and easy. For now.'],
    ['A little less room this time.', 'Still friendly. Mostly.'],
    ['Now it counts.', 'The slack is gone.'],
    ['You asked for this by being good.', 'Level 4. Hands steady?'],
    ['Level 5. Nobody clears this calmly.', 'This is the one people complain about.'],
  ][Math.max(1, Math.min(5, level)) - 1];
  return pick(L, seed) + (twist ? ' And there’s a twist.' : '');
}
