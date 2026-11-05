import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function sign(payload: Record<string, unknown>, secret: string) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const lkUrl = Deno.env.get('LIVEKIT_URL');
  const lkKey = Deno.env.get('LIVEKIT_API_KEY');
  const lkSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!lkUrl || !lkKey || !lkSecret) return json({ error: 'not_configured' }, 503);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: 'Sign in first' }, 401);
  const { room_id } = await req.json().catch(() => ({}));
  if (!room_id) return json({ error: 'Missing room' }, 400);

  const { data: room } = await admin.from('rooms').select('id, admin_id, status').eq('id', room_id).maybeSingle();
  if (!room || !['hiding', 'hunt', 'paused'].includes(room.status)) return json({ error: 'Voice is only open during a match' }, 403);
  const isAdmin = room.admin_id === u.user.id;
  let canTalk = false;
  if (!isAdmin) {
    const { data: m } = await admin.from('room_members').select('role, alive, status').eq('room_id', room_id).eq('user_id', u.user.id).maybeSingle();
    if (!m || m.status !== 'accepted' || m.role !== 'hunter') return json({ error: 'Hunters only' }, 403);
    canTalk = !!m.alive;
  }
  const { data: p } = await admin.from('profiles').select('username').eq('id', u.user.id).maybeSingle();
  const now = Math.floor(Date.now() / 1000);
  const jwt = await sign({
    iss: lkKey, sub: u.user.id, name: p?.username ?? 'hunter', nbf: now - 10, exp: now + 3 * 3600,
    video: { room: `tag-${room_id}-hunters`, roomJoin: true, canPublish: canTalk, canSubscribe: true, canPublishData: false },
  }, lkSecret);
  return json({ url: lkUrl, token: jwt, can_talk: canTalk });
});
