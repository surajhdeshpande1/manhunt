import { useEffect, useState } from 'react';

/** Live usable screen height: follows rotation, the iOS URL bar collapsing and split-screen on Android. */
function read() {
  if (typeof window === 'undefined') return 800;
  return Math.round(window.innerHeight || document.documentElement.clientHeight || 800);
}
export function useViewportH() {
  const [h, setH] = useState(read);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setH(read())); };
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return h;
}

/** Cheap phones get fewer particles and no blur. Decided once per launch. */
export const lite: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = n.hardwareConcurrency || 8;
  const mem = n.deviceMemory || 8;
  return cores <= 4 || mem <= 3 || !!n.connection?.saveData;
})();
if (typeof document !== 'undefined') {
  document.documentElement.dataset.lite = lite ? '1' : '0';
  const ua = navigator.userAgent;
  const ios = /iP(hone|od|ad)/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  document.documentElement.dataset.os = ios ? 'ios' : /Android/.test(ua) ? 'android' : 'other';
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  document.documentElement.dataset.standalone = standalone ? '1' : '0';
}
