// Daily ping (Vercel cron) so the free Supabase project never pauses for inactivity.
export default async function handler(req, res) {
  const url = 'https://lljeqtlkujaaxuqipouk.supabase.co/rest/v1/rpc/tag_ping';
  const key = 'sb_publishable_hHovyY4DQRky1JWtJr4aXA_p1GM982F';
  try {
    const r = await fetch(url, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}' });
    res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
