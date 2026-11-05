import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function tempPassword() {
  const words = ['RAVEN', 'COBRA', 'GHOST', 'VIPER', 'TIGER', 'FALCON', 'SHADOW', 'ROGUE'];
  const w = words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const n = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
  return `${w}-${n}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: 'Sign in first' }, 401);
  const { data: me } = await admin.from('profiles').select('is_owner').eq('id', u.user.id).maybeSingle();
  if (!me?.is_owner) return json({ error: 'Owner only' }, 403);
  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id) return json({ error: 'Missing user' }, 400);
  const pw = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(user_id, { password: pw });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, temp_password: pw });
});
