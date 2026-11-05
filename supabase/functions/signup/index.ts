import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const s = (k: string) => String(b[k] ?? '').trim();
  const email = s('email').toLowerCase();
  const password = String(b.password ?? '');
  const username = s('username').toLowerCase();
  const full_name = s('full_name');
  const phone = s('phone').replace(/[\s-]/g, '');
  const dob = s('dob');
  const college = s('college');
  const branch = s('branch').toUpperCase();
  const year = Number(b.year);

  const errors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email';
  if (password.length < 8) errors.password = 'At least 8 characters';
  if (!/^[a-z0-9_]{3,20}$/.test(username)) errors.username = '3–20 letters, numbers or _';
  if (full_name.length < 2 || full_name.length > 60) errors.full_name = 'Enter your full name';
  if (!/^\+?[0-9]{10,13}$/.test(phone)) errors.phone = 'Enter a 10-digit phone number';
  const d = new Date(dob);
  const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(d.getTime()) || age < 10 || age > 90) errors.dob = 'Enter a valid date of birth';
  if (college.length < 3 || college.length > 120) errors.college = 'Enter your college name in full';
  if (!/^[A-Z&]{2,8}$/.test(branch)) errors.branch = 'Use the short form, e.g. ISE';
  if (![1, 2, 3, 4].includes(year)) errors.year = 'Pick your year';
  if (Object.keys(errors).length) return json({ error: 'Check the highlighted fields', fields: errors }, 422);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (taken) return json({ error: 'That username is taken', fields: { username: 'Already taken' } }, 409);

  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr || !created?.user) {
    const msg = cErr?.message ?? 'Could not create account';
    if (/already|registered|exists/i.test(msg)) return json({ error: 'An account with this email already exists. Sign in instead.', fields: { email: 'Already registered' } }, 409);
    return json({ error: msg }, 400);
  }

  const { error: pErr } = await admin.from('profiles').insert({
    id: created.user.id, username, full_name, phone, dob, college, branch, year,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    if (pErr.code === '23505') return json({ error: 'That username is taken', fields: { username: 'Already taken' } }, 409);
    return json({ error: 'Could not save your profile: ' + pErr.message }, 400);
  }
  return json({ ok: true });
});
