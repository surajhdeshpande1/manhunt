import { useEffect } from 'react';
export type ThemeName = 'neutral' | 'runner' | 'runner-ink' | 'hunter';
const META: Record<ThemeName, string> = { neutral: '#000000', runner: '#000000', 'runner-ink': '#000000', hunter: '#000000' };
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
