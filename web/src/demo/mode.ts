/**
 * DEMO mode switch. Demo runs the whole app against an in-browser simulated world (see sim.ts):
 * same screens, same rules, fake players. It is only reachable after a developer login.
 * The flag lives in sessionStorage, so closing the app always returns to the real app.
 */
const KEY = 'tag-demo';
const TOK = 'tag-dev-token';
const SKIP = 'tag-skip-intro';

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
export function enterDemo(token: string) {
  try { localStorage.setItem(TOK, token); sessionStorage.setItem(KEY, '1'); sessionStorage.setItem(SKIP, '1'); } catch { /* ignore */ }
  location.replace('/home');
}
export function exitDemo() {
  try { sessionStorage.removeItem(KEY); sessionStorage.setItem(SKIP, '1'); } catch { /* ignore */ }
  location.replace('/');
}
export function forgetDev() { try { localStorage.removeItem(TOK); } catch { /* ignore */ } }
