// Server clock offset so every phone shows the same countdowns.
let offset = 0;
export function syncClock(serverIso: string, sentAt: number) {
  const now = Date.now();
  const rtt = now - sentAt;
  const server = new Date(serverIso).getTime() + rtt / 2;
  const next = server - now;
  offset = offset === 0 ? next : offset * 0.7 + next * 0.3;
}
export const serverNow = () => Date.now() + offset;
export function msUntil(iso?: string | null) {
  if (!iso) return 0;
  return new Date(iso).getTime() - serverNow();
}
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}
export function timeAgo(iso: string) {
  const s = Math.max(0, (serverNow() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
