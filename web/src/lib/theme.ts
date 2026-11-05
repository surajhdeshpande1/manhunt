import { useEffect, useSyncExternalStore } from 'react';

export type ThemeName = 'neutral' | 'runner' | 'runner-ink' | 'hunter';
export type Appearance = 'auto' | 'night' | 'day';

/* ---------- appearance: night (cinematic) or day (paper & ink) ---------- */
const KEY = 'tag-appearance';
const listeners = new Set<() => void>();

function read(): Appearance {
  try { const v = localStorage.getItem(KEY); return v === 'day' || v === 'night' ? v : 'auto'; } catch { return 'auto'; }
}
/** Daylight in Karnataka runs roughly 6:30–18:00; switch a little inside that window. */
export function isDaytime(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 7 && h < 17.5;
}
export function resolvedDay(a: Appearance = read()) {
  return a === 'day' || (a === 'auto' && isDaytime());
}
function apply() {
  const day = resolvedDay();
  document.documentElement.dataset.day = day ? '1' : '0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', day ? '#efe9df' : '#0b0b0c');
}
export function setAppearance(a: Appearance) {
  try { localStorage.setItem(KEY, a); } catch { /* private mode */ }
  apply(); listeners.forEach((l) => l());
}
export function useAppearance(): Appearance {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => 'auto');
}
if (typeof window !== 'undefined') {
  apply();
  // re-check every few minutes so 'auto' follows sunset during long sessions
  setInterval(apply, 5 * 60 * 1000);
}

/* ---------- role theme ---------- */
export function setTheme(t: ThemeName) {
  document.documentElement.dataset.theme = t;
  apply();
}
export function useTheme(t: ThemeName) {
  useEffect(() => { setTheme(t); }, [t]);
}
export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
