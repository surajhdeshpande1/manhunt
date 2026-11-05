import { useState, type FormEvent } from 'react';
import { Button, Field, Modal, useToast } from '../components/ui';
import { realRpc } from '../lib/supabase';
import { haptic } from '../lib/feel';
import { devToken, enterDemo, forgetDev } from './mode';

/** Small "Developer" entry on the first screen. NAME + PASSWORD are checked by the server. */
export function DevLoginButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="mono" aria-label="Developer login"
        style={{ alignSelf: 'center', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', padding: '10px 14px' }}>
        {'</>'} Developer
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Developer login"><DevLogin onClose={() => setOpen(false)} /></Modal>
    </>
  );
}

function DevLogin({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saved = devToken();

  async function go(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const tok = await realRpc<string>('dev_login', { p_name: name, p_password: pw });
      haptic.ok(); enterDemo(tok);
    } catch (e: any) { setErr(e.message); haptic.warn(); } finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true);
    try {
      const ok = await realRpc<boolean>('dev_check', { p_token: saved });
      if (ok) enterDemo(saved!); else { forgetDev(); toast('Developer session expired. Log in again.', true); onClose(); }
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="stack" style={{ gap: 14 }}>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Opens the DEMO section: the full app in a simulated world with fake players. Nothing you do there touches real data.</p>
      {saved && <Button type="button" kind="hot" block loading={busy} onClick={resume}>Continue to DEMO</Button>}
      <Field label="NAME" autoComplete="username" autoCapitalize="none" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="PASSWORD" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} error={err ?? undefined} />
      <Button type="submit" block loading={busy} disabled={!name || pw.length < 1}>Log in as developer</Button>
    </form>
  );
}
