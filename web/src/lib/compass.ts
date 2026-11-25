import { useEffect, useState } from 'react';

/**
 * Which way the phone is pointing, from its compass: degrees clockwise from north (the top of the screen).
 * Used to show the direction a standing player faces; while they move, the direction of travel from GPS is
 * better and is used instead. iPhones ask permission once, from a tap (see askCompass).
 */
type OrientEv = DeviceOrientationEvent & { webkitCompassHeading?: number };
let permission: 'unknown' | 'granted' | 'denied' = 'unknown';

export const compassNeedsPermission = () =>
  typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function';

/** call from a tap: iPhones only hand out compass readings after asking */
export async function askCompass(): Promise<boolean> {
  if (!compassNeedsPermission()) return true;
  if (permission !== 'unknown') return permission === 'granted';
  try { permission = (await (DeviceOrientationEvent as any).requestPermission()) === 'granted' ? 'granted' : 'denied'; } catch { permission = 'denied'; }
  window.dispatchEvent(new Event('tag-compass'));
  return permission === 'granted';
}

const screenAngle = () => Number(screen.orientation?.angle ?? (window as any).orientation ?? 0) || 0;
const wrap = (d: number) => ((d % 360) + 360) % 360;

export function useCompass(on: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    const f = () => setAsked((n) => n + 1);
    window.addEventListener('tag-compass', f);
    return () => window.removeEventListener('tag-compass', f);
  }, []);
  useEffect(() => {
    if (!on || typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;
    if (compassNeedsPermission() && permission !== 'granted') return;
    let smooth: number | null = null, shown = -999, raf = 0;
    const handle = (e: OrientEv) => {
      let deg: number | null = null;
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) deg = e.webkitCompassHeading + screenAngle(); // iPhone: already from north
      else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) deg = 360 - e.alpha + screenAngle();  // Android
      if (deg == null || !Number.isFinite(deg)) return;
      deg = wrap(deg);
      // steady the needle: move part of the way each reading, along the shorter way round
      smooth = smooth == null ? deg : wrap(smooth + (((deg - smooth + 540) % 360) - 180) * 0.25);
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (smooth != null && Math.abs(((smooth - shown + 540) % 360) - 180) >= 2) { shown = smooth; setHeading(Math.round(smooth)); }
      });
    };
    const ev = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(ev, handle as EventListener);
    return () => { window.removeEventListener(ev, handle as EventListener); cancelAnimationFrame(raf); };
  }, [on, asked]);
  return on ? heading : null;
}
