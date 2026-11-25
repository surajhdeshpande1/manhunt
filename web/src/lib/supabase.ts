import { createClient } from '@supabase/supabase-js';
import { DEMO } from '../demo/mode';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

/**
 * fetch with a time limit. On a weak campus connection a request can hang for minutes; without a limit one stuck
 * call froze the match screen (no more updates) or left a finished task waiting forever. Photo and area uploads get longer.
 */
export function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const ms = url.includes('/storage/v1/') ? 90_000 : url.includes('/functions/v1/') ? 25_000 : 12_000;
  const ctl = new AbortController();
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) ctl.abort(outer.reason);
    else outer.addEventListener('abort', () => ctl.abort(outer.reason), { once: true });
  }
  const timer = setTimeout(() => ctl.abort(new DOMException('The server took too long to answer', 'TimeoutError')), ms);
  return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
  global: { fetch: timedFetch },
});

export function selfieUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/selfies/${path}`;
}

/** Call a database function and throw a readable Error on failure. */
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (DEMO) return (await import('../demo/sim')).call(fn, args as any) as Promise<T>;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(cleanError(error.message));
  return data as T;
}

export async function callFunction<T = any>(name: string, body: unknown): Promise<T> {
  if (DEMO) return (await import('../demo/sim')).callFn(name, body) as Promise<T>;
  const { data: s } = await supabase.auth.getSession();
  const res = await timedFetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${s.session?.access_token ?? SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error || `Request failed (${res.status})`) as Error & { fields?: Record<string, string>; code?: string };
    e.fields = json.fields;
    e.code = json.error;
    throw e;
  }
  return json as T;
}

/** true for failures that a retry can fix: no signal, a dropped request, a timeout */
export const isNetworkError = (msg: string) => /Failed to fetch|NetworkError|Load failed|took too long|TimeoutError|AbortError|aborted|network|fetch failed|No connection|connection is slow/i.test(msg);

export function cleanError(msg: string) {
  if (/took too long|TimeoutError/i.test(msg)) return 'The connection is slow. Try again in a moment.';
  if (isNetworkError(msg)) return 'No connection. Check your internet and try again.';
  // only real sign-in problems (a task that "expired" is not a session problem)
  if (/\bJWT\b|jwt expired|invalid claim|refresh token/i.test(msg)) return 'Your session expired. Sign in again.';
  return msg.replace(/^ERROR:\s*/, '');
}

/** Always hits the real server, even inside the demo (developer login checks). */
export async function realRpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(cleanError(error.message));
  return data as T;
}
