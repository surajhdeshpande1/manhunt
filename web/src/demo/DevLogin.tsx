import { useState, type FormEvent } from 'react';
import { Button, Field, Modal, useToast } from '../components/ui';
import { realRpc } from '../lib/supabase';
import { haptic } from '../lib/feel';
import { devToken, enterDemo, forgetDev } from './mode';

/** The developer login, opened from Profile → Developer access. It only works for the signed-in Owner. */
export function DevLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="Developer login">{open && <DevLogin onClose={onClose} />}</Modal>;
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
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Opens the DEMO section: the full app in a simulated world with fake players. Nothing you do there touches real data. Works only on the owner's account.</p>
      {saved && <Button type="button" kind="hot" block loading={busy} onClick={resume}>Continue to DEMO</Button>}
      <Field label="NAME" autoComplete="username" autoCapitalize="none" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="PASSWORD" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} error={err ?? undefined} />
      <Button type="submit" block loading={busy} disabled={!name || pw.length < 1}>Log in as developer</Button>
    </form>
  );
}
