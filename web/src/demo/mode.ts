/**
 * DEMO mode switch. Demo runs the whole app against an in-browser simulated world (see sim.ts):
 * same screens, same rules, fake players. It is only reachable after a developer login.
 * The flag lives in sessionStorage, so closing the app always returns to the real app.
 */
const KEY = 'tag-demo';
const TOK = 'tag-dev-token';
const SKIP = 'tag-skip-intro';
const ME_KEY = 'tag-demo-me';
type Me = { username?: string; full_name?: string; college?: string; branch?: string; year?: number; selfie_path?: string | null };

function ss(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }

export const DEMO: boolean = typeof window !== 'undefined' && ss(KEY) === '1';
export const DEMO_ME = 'de000000-0000-4000-8000-00000000d3e0';

/** One-shot: skip the opening film on the reload that enters or leaves demo. */
export function takeSkipIntro() {
  const v = ss(SKIP) === '1';
  try { sessionStorage.removeItem(SKIP); } catch { /* private mode */ }
  return v;
}
export function devToken(): string | null { try { return localStorage.getItem(TOK); } catch { return null; } }
/** `me`: your real profile, so in the demo you play as yourself */
export function enterDemo(token: string, me?: Me | null) {
  try {
    localStorage.setItem(TOK, token); sessionStorage.setItem(KEY, '1'); sessionStorage.setItem(SKIP, '1');
    if (me) localStorage.setItem(ME_KEY, JSON.stringify({ username: me.username, full_name: me.full_name, college: me.college, branch: me.branch, year: me.year, selfie_path: me.selfie_path }));
  } catch { /* ignore */ }
  location.replace('/home');
}
export function exitDemo() {
  try { sessionStorage.removeItem(KEY); sessionStorage.setItem(SKIP, '1'); } catch { /* ignore */ }
  location.replace('/');
}
export function demoMe(): Me | null { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch { return null; } }
export function forgetDev() { try { localStorage.removeItem(TOK); } catch { /* ignore */ } }
