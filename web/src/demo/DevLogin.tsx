import { useRef, useState, type FormEvent } from 'react';
import { Button, Field, Modal, useToast } from '../components/ui';
import { realRpc } from '../lib/supabase';
import { haptic } from '../lib/feel';
import { devToken, enterDemo, forgetDev } from './mode';

/**
 * Hidden developer entry: nothing is shown on screen. Tap the TAG logo 5 times quickly
 * (within about 2 seconds) and the developer login opens.
 */
export function useDevGate() {
  const [open, setOpen] = useState(false);
  const taps = useRef<number[]>([]);
  const tap = () => {
    const t = Date.now();
    taps.current = [...taps.current.filter((x) => t - x < 2000), t];
    if (taps.current.length >= 5) { taps.current = []; haptic.ok(); setOpen(true); }
  };
  const modal = <Modal open={open} onClose={() => setOpen(false)} title="Developer login"><DevLogin onClose={() => setOpen(false)} /></Modal>;
  return { tap, modal };
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
