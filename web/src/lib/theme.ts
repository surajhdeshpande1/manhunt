import { useEffect } from 'react';
export type ThemeName = 'neutral' | 'runner' | 'runner-ink' | 'hunter';
const META: Record<ThemeName, string> = { neutral: '#0e0d0c', runner: '#f3ede2', 'runner-ink': '#120e0b', hunter: '#060a14' };
export function setTheme(t: ThemeName) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
}
export function useTheme(t: ThemeName) {
  useEffect(() => { setTheme(t); }, [t]);
}
export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
