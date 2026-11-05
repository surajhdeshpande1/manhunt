// Haptics and background notifications. Silent by design: no sound anywhere.
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
// iPhones have no Vibration API. Since iOS 18, toggling an <input switch> plays a light system haptic,
// so we tick a hidden one instead (one tick per pulse, at most three).
let sw: HTMLLabelElement | null = null;
function iosTick() {
  if (typeof document === 'undefined') return;
  if (!sw) {
    sw = document.createElement('label');
    sw.setAttribute('aria-hidden', 'true');
    sw.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    sw.appendChild(i); document.body.appendChild(sw);
  }
  sw.click();
}
export function buzz(pattern: number | number[]) {
  if (canVibrate) { try { navigator.vibrate(pattern); } catch { /* blocked */ } return; }
  try {
    const pulses = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0) : [pattern];
    let t = 0;
    pulses.slice(0, 3).forEach((d, i) => { setTimeout(iosTick, t); t += d + (Array.isArray(pattern) ? pattern[i * 2 + 1] ?? 0 : 0); });
  } catch { /* ignore */ }
}
export const haptic = {
  tap: () => buzz(10),
  ok: () => buzz([20, 40, 20]),
  warn: () => buzz([120, 80, 120]),
  alarm: () => buzz([300, 120, 300, 120, 300]),
  big: () => buzz([60, 40, 180]),
};
export async function notify(title: string, body: string, tag?: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', silent: true } as NotificationOptions);
    else new Notification(title, { body, tag, silent: true } as NotificationOptions);
  } catch { /* ignore */ }
}
let lock: any = null;
// Keep the screen on during a match. Uses the Wake Lock API where it exists (Android Chrome, iOS 16.4+),
// re-takes it whenever the app returns to the foreground (the lock drops when hidden), and on older
// iPhones falls back to a tiny muted looping video, which also stops the screen from dimming.
let wanted = false;
let vid: HTMLVideoElement | null = null;
async function takeLock() {
  if (!wanted || lock || document.visibilityState !== 'visible') return;
  if ('wakeLock' in navigator) {
    try {
      lock = await (navigator as any).wakeLock.request('screen');
      lock.addEventListener?.('release', () => { lock = null; });
      return;
    } catch { /* fall through to the video */ }
  }
  try {
    if (!vid) {
      vid = document.createElement('video');
      vid.setAttribute('playsinline', ''); vid.setAttribute('muted', ''); vid.muted = true; vid.loop = true;
      vid.setAttribute('aria-hidden', 'true');
      vid.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none';
      vid.src = '/wake.mp4'; document.body.appendChild(vid);
    }
    await vid.play();
  } catch { /* needs a tap first; retried on the next one */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') takeLock(); });
  window.addEventListener('pointerdown', () => { if (wanted && !lock && (!vid || vid.paused)) takeLock(); }, { capture: true, passive: true });
}
export async function keepAwake(on: boolean) {
  wanted = on;
  if (on) return takeLock();
  try { if (lock) await lock.release(); } catch { /* ignore */ }
  lock = null;
  if (vid) { vid.pause(); vid.remove(); vid = null; }
}
