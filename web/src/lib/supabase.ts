import { createClient } from '@supabase/supabase-js';
import { DEMO } from '../demo/mode';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
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

export function cleanError(msg: string) {
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No connection. Check your internet and try again.';
  if (/JWT|expired/i.test(msg)) return 'Your session expired. Sign in again.';
  return msg.replace(/^ERROR:\s*/, '');
}

/** Always hits the real server, even inside the demo (developer login checks). */
export async function realRpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(cleanError(error.message));
  return data as T;
}
