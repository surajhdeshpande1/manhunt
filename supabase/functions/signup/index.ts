import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The Owner account belongs only to whoever controls this address: signing up with it needs a code sent to it.
const OWNER = 'surajhdeshpande1@gmail.com';

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

  // ---- the owner's address: prove it's yours with a code sent to it ----
  let owner = false;
  if (email === OWNER) {
    const { data: ex, error: xErr } = await admin.rpc('tag_auth_user', { p_email: email });
    if (xErr) return json({ error: 'Could not check this address right now. Try again in a minute.' }, 500);
    const existing = Array.isArray(ex) ? ex[0] : null;
    if (existing?.has_profile) return json({ error: 'An account with this email already exists. Sign in instead.', fields: { email: 'Already registered' } }, 409);
    const pepper = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(-16);
    const code = s('code').replace(/\D/g, '');
    if (!code) {
      const key = Deno.env.get('BREVO_API_KEY');
      const sender = Deno.env.get('BREVO_SENDER');
      if (!key || !sender) return json({ error: 'Email is not set up on the server, so this address can’t be verified yet.' }, 503);
      const { data: prev } = await admin.from('signup_codes').select('sent_at').eq('email', email).maybeSingle();
      if (!prev || Date.now() - new Date(prev.sent_at).getTime() > 60_000) { // at most one email a minute
        const c = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
        const { error: sErr } = await admin.from('signup_codes').upsert({
          email, code_hash: await sha(c + pepper + email), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          sent_at: new Date().toISOString(), tries: 0,
        });
        if (sErr) return json({ error: 'Could not start the email check. Try again in a minute.' }, 500);
        const html = `<div style="font-family:Arial,sans-serif;background:#0e0d0c;color:#efe6d6;padding:32px"><div style="font-size:28px;font-weight:800;letter-spacing:2px"><span style="color:#ff4a1c">/</span>TAG</div><p style="font-size:16px">Use this code to create the TAG owner account:</p><div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#ff4a1c;margin:16px 0">${c}</div><p style="color:#9c9183">It expires in 15 minutes. If you didn't ask for this, someone tried to sign up with your address: ignore this email and they can't get in.</p></div>`;
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: 'TAG', email: sender }, to: [{ email }], subject: `${c} is your TAG owner code`, htmlContent: html, textContent: `Your TAG owner code is ${c}. It expires in 15 minutes.` }),
        });
        if (!r.ok) return json({ error: 'Could not send the email right now. Try again in a minute.' }, 502);
      }
      return json({ need_code: true });
    }
    const { data: row } = await admin.from('signup_codes').select('code_hash, expires_at, tries').eq('email', email).maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'That code has expired. Send a new one.', fields: { code: 'Expired' } }, 400);
    if (row.tries >= 5) return json({ error: 'Too many wrong codes. Send a new one.', fields: { code: 'Too many tries' } }, 429);
    if (row.code_hash !== await sha(code + pepper + email)) {
      await admin.from('signup_codes').update({ tries: row.tries + 1 }).eq('email', email);
      return json({ error: 'That code is not right', fields: { code: 'Wrong code' } }, 400);
    }
    await admin.from('signup_codes').delete().eq('email', email);
    // an account for this address with no TAG profile (made outside TAG's sign-up, or half-finished) gives way:
    // the code just proved the address is yours
    if (existing && !existing.has_profile) await admin.auth.admin.deleteUser(existing.id);
    owner = true;
  }

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
  if (owner) {
    const { data: ok } = await admin.rpc('tag_grant_owner', { p_user: created.user.id });
    if (!ok) return json({ error: 'Account created, but Owner could not be switched on. Try signing in again.' }, 500);
  }
  return json({ ok: true, owner });
});
