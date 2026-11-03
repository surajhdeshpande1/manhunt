// Haptics and background notifications. Silent by design: no sound anywhere.
export function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported (iOS) */ }
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
export async function keepAwake(on: boolean) {
  try {
    if (on && !lock && 'wakeLock' in navigator) {
      lock = await (navigator as any).wakeLock.request('screen');
      lock.addEventListener?.('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { /* ignore */ }
}
