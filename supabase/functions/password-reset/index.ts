import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Enter a valid email' }, 400);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const pepper = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(-16);
  const { data: rows } = await admin.rpc('tag_user_by_email', { p_email: email });
  const user = Array.isArray(rows) ? rows[0] : null;

  if (body.action === 'request') {
    const key = Deno.env.get('BREVO_API_KEY');
    const sender = Deno.env.get('BREVO_SENDER');
    if (!key || !sender) return json({ error: 'email_not_configured' }, 503);
    if (!user) return json({ ok: true });
    const { data: prev } = await admin.from('password_resets').select('sent_at').eq('user_id', user.id).maybeSingle();
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < 60_000) return json({ ok: true });
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    await admin.from('password_resets').upsert({ user_id: user.id, code_hash: await sha(code + pepper + user.id), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), attempts: 0, sent_at: new Date().toISOString() });
    const html = `<div style="font-family:Arial,sans-serif;background:#0e0d0c;color:#efe6d6;padding:32px"><div style="font-size:28px;font-weight:800;letter-spacing:2px"><span style="color:#ff4a1c">/</span>TAG</div><p style="font-size:16px">Hi @${user.username ?? 'player'}, use this code to reset your TAG password:</p><div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#ff4a1c;margin:16px 0">${code}</div><p style="color:#9c9183">It expires in 15 minutes. If you didn't ask for this, ignore this email.</p></div>`;
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'TAG', email: sender }, to: [{ email }], subject: `${code} is your TAG reset code`, htmlContent: html, textContent: `Your TAG password reset code is ${code}. It expires in 15 minutes.` }),
    });
    if (!r.ok) return json({ error: 'Could not send the email right now. Try again in a minute.' }, 502);
    return json({ ok: true });
  }

  if (body.action === 'confirm') {
    const code = String(body.code ?? '').trim();
    const password = String(body.password ?? '');
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
    if (!user) return json({ error: 'Wrong or expired code' }, 400);
    const { data: row } = await admin.from('password_resets').select('*').eq('user_id', user.id).maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) return json({ error: 'Wrong or expired code. Request a new one.' }, 400);
    if (row.code_hash !== await sha(code + pepper + user.id)) {
      await admin.from('password_resets').update({ attempts: row.attempts + 1 }).eq('user_id', user.id);
      return json({ error: `Wrong code. ${4 - row.attempts} tries left.` }, 400);
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) return json({ error: error.message }, 400);
    await admin.from('password_resets').delete().eq('user_id', user.id);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
});
