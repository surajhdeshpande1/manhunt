import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Field, Logo, Slash, useToast, Back, IconTarget, IconMap, IconSOS } from '../components/ui';
import { callFunction, cleanError, rpc, supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';

/* ---------- Welcome ---------- */
export function Welcome() {
  useTheme('neutral');
  const nav = useNavigate();
  return (
    <Slash>
      <div className="screen noise grid-bg" style={{ justifyContent: 'space-between' }}>
        <div className="row between">
          <div className="eyebrow">Live manhunt</div>
          <div className="eyebrow"><span className="dot pulse accent" /> &nbsp;Online</div>
        </div>
        <div style={{ position: 'relative' }}>
          <Logo size={120} />
          <p className="display" style={{ fontSize: 30, margin: '22px 0 10px', fontWeight: 600, lineHeight: 1.05 }}>
            Your campus.<br />One boundary.<br /><span className="accent">No place to hide.</span>
          </p>
          <p className="muted" style={{ maxWidth: 360 }}>Runners hide and crack tasks. Hunters close in on a live map and scan to catch. Play it for real, outdoors.</p>
        </div>
        <div className="stack">
          <Button size="lg" block arrow onClick={() => nav('/signup')}>Create account</Button>
          <Button size="lg" kind="ghost" block onClick={() => nav('/signin')}>I have an account</Button>
        </div>
      </div>
    </Slash>
  );
}

function Header({ title, step, back = -1 as number | string }: { title: string; step?: string; back?: number | string }) {
  const nav = useNavigate();
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="row between" style={{ marginLeft: -10 }}>
        <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === 'number' ? nav(back) : nav(back))}><Back /></button>
        {step && <div className="eyebrow">{step}</div>}
      </div>
      <h1 className="display" style={{ fontSize: 44, margin: '8px 0 0' }}>{title}</h1>
    </div>
  );
}

/* ---------- Sign up ---------- */
type Form = { full_name: string; username: string; email: string; phone: string; password: string; dob: string; college: string; branch: string; year: number | null };
export function SignUp() {
  useTheme('neutral');
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Form>({ full_name: '', username: '', email: '', phone: '', password: '', dob: '', college: '', branch: '', year: null });
  const [err, setErr] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form, v: any) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: undefined })); };

  function validate() {
    const e: typeof err = {};
    if (f.full_name.trim().length < 2) e.full_name = 'Enter your full name';
    if (!/^[a-z0-9_]{3,20}$/.test(f.username)) e.username = '3–20 characters: letters, numbers, _';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Enter a valid email';
    if (!/^[0-9]{10}$/.test(f.phone)) e.phone = 'Enter your 10-digit mobile number';
    if (f.password.length < 8) e.password = 'At least 8 characters';
    if (!f.dob) e.dob = 'Enter your date of birth';
    if (f.college.trim().length < 3) e.college = 'Enter your college name in full';
    else if (/^[A-Z.\s]{2,8}$/.test(f.college.trim())) e.college = 'Write the full college name, not the short form';
    if (!/^[A-Z&]{2,8}$/.test(f.branch)) e.branch = 'Short form, e.g. ISE, CSE, ECE';
    if (!f.year) e.year = 'Pick your year';
    setErr(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) { haptic.warn(); return; }
    setBusy(true);
    try {
      await callFunction('signup', { ...f, email: f.email.trim(), phone: '+91' + f.phone });
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
      if (error) throw error;
      haptic.ok();
      nav('/setup/permissions', { replace: true });
    } catch (e: any) {
      if (e.fields) setErr(e.fields);
      toast(cleanError(e.message), true);
    } finally { setBusy(false); }
  }

  return (
    <Slash>
      <form className="screen" onSubmit={submit} noValidate>
        <Header title="Create account" step="1 / 3 · Details" />
        <div className="stack" style={{ gap: 16 }}>
          <Field label="Full name" autoComplete="name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} error={err.full_name} placeholder="Suraj Deshpande" />
          <Field label="Username" autoComplete="username" autoCapitalize="none" value={f.username} error={err.username}
            onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))} placeholder="callsign" hint="This is your callsign in every match." />
          <Field label="Email" type="email" autoComplete="email" autoCapitalize="none" value={f.email} onChange={(e) => set('email', e.target.value)} error={err.email} placeholder="you@example.com" />
          <Field label="Mobile" type="tel" inputMode="numeric" autoComplete="tel-national" prefix="+91" value={f.phone} error={err.phone}
            onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98XXXXXXXX" hint="Admins can reach you during a match. Also used for account recovery." />
          <Field label="Set a password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} error={err.password} placeholder="At least 8 characters" />
          <Field label="Date of birth" type="date" value={f.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob', e.target.value)} error={err.dob} />
          <Field label="College" value={f.college} onChange={(e) => set('college', e.target.value)} error={err.college}
            placeholder="Basaveshwar Engineering College, Bagalkot" hint="Full name, as it should appear on leaderboards." />
          <Field label="Branch" autoCapitalize="characters" value={f.branch} error={err.branch}
            onChange={(e) => set('branch', e.target.value.toUpperCase().replace(/[^A-Z&]/g, '').slice(0, 8))} placeholder="ISE" />
          <div className="field">
            <label>Year</label>
            <div className="chips">
              {[1, 2, 3, 4].map((y) => (
                <button type="button" key={y} className={`chip ${f.year === y ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => { haptic.tap(); set('year', y); }}>
                  {['1st', '2nd', '3rd', '4th'][y - 1]}
                </button>
              ))}
            </div>
            {err.year && <div className="field-err">{err.year}</div>}
          </div>
        </div>
        <div style={{ marginTop: 28 }}>
          <Button size="lg" block arrow loading={busy} type="submit">Continue</Button>
          <p className="muted center" style={{ marginTop: 14, fontSize: 13 }}>Already playing? <Link to="/signin">Sign in</Link></p>
        </div>
      </form>
    </Slash>
  );
}

/* ---------- Sign in ---------- */
export function SignIn() {
  useTheme('neutral');
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
    setBusy(false);
    if (error) { toast(/invalid/i.test(error.message) ? 'Wrong email or password' : cleanError(error.message), true); return; }
    const p = await refresh();
    haptic.ok();
    nav(p?.selfie_path ? '/home' : '/setup/permissions', { replace: true });
  }
  return (
    <Slash>
      <form className="screen" onSubmit={submit}>
        <Header title="Sign in" back="/" />
        <div className="stack" style={{ gap: 16 }}>
          <Field label="Email" type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Link to="/forgot" style={{ alignSelf: 'flex-end', fontSize: 14 }}>Forgot password?</Link>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 28 }}>
          <Button size="lg" block arrow loading={busy} type="submit" disabled={!email || !pw}>Sign in</Button>
        </div>
      </form>
    </Slash>
  );
}

/* ---------- Forgot / reset ---------- */
export function Forgot() {
  useTheme('neutral');
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'nomail'>('email');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try { await callFunction('password-reset', { action: 'request', email }); setStep('code'); toast('If that email has an account, a code is on its way'); }
    catch (e: any) { if (e.code === 'email_not_configured') setStep('nomail'); else toast(cleanError(e.message), true); }
    finally { setBusy(false); }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await callFunction('password-reset', { action: 'confirm', email, code, password: pw });
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
      haptic.ok(); toast('Password updated');
      nav(error ? '/signin' : '/home', { replace: true });
    } catch (e: any) { toast(cleanError(e.message), true); } finally { setBusy(false); }
  }
  return (
    <Slash>
      <div className="screen">
        <Header title="Reset password" />
        {step === 'email' && (
          <form className="stack" style={{ gap: 16 }} onSubmit={send}>
            <p className="muted" style={{ margin: 0 }}>Enter your account email. We'll send a 6-digit code.</p>
            <Field label="Email" type="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button size="lg" block loading={busy} type="submit" disabled={!email}>Send code</Button>
          </form>
        )}
        {step === 'code' && (
          <form className="stack" style={{ gap: 16 }} onSubmit={confirm}>
            <p className="muted" style={{ margin: 0 }}>Check <b style={{ color: 'var(--text)' }}>{email}</b> (and spam) for the code. It expires in 15 minutes.</p>
            <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ letterSpacing: '0.5em', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 24 }} />
            <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
            <Button size="lg" block loading={busy} type="submit" disabled={code.length !== 6 || pw.length < 8}>Set new password</Button>
            <button type="button" className="muted" style={{ fontSize: 14 }} onClick={() => send()}>Send a new code</button>
          </form>
        )}
        {step === 'nomail' && (
          <div className="stack">
            <p>Email reset isn't switched on yet.</p>
            <p className="muted">Ask the TAG owner to issue you a temporary password from the Owner console. Then sign in and change it from your Profile.</p>
          </div>
        )}
      </div>
    </Slash>
  );
}

export function ResetPassword() {
  useTheme('neutral');
  const nav = useNavigate();
  const toast = useToast();
  const { clearRecovery } = useSession();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast('At least 8 characters', true); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast(cleanError(error.message), true); return; }
    clearRecovery();
    toast('Password updated');
    nav('/home', { replace: true });
  }
  return (
    <Slash>
      <form className="screen" onSubmit={submit}>
        <Header title="New password" back="/" />
        <div className="stack" style={{ gap: 16 }}>
          <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button size="lg" block loading={busy} type="submit">Save password</Button>
        </div>
      </form>
    </Slash>
  );
}

/* ---------- Permissions explainer ---------- */
type PState = 'idle' | 'granted' | 'denied' | 'unsupported';
export function Permissions() {
  useTheme('neutral');
  const nav = useNavigate();
  const [cam, setCam] = useState<PState>('idle');
  const [loc, setLoc] = useState<PState>('idle');
  const [noti, setNoti] = useState<PState>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission === 'granted' ? 'granted' : 'idle');
  const [busy, setBusy] = useState(false);

  async function askAll() {
    setBusy(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      s.getTracks().forEach((t) => t.stop()); setCam('granted');
    } catch { setCam('denied'); }
    await new Promise<void>((res) => {
      if (!navigator.geolocation) { setLoc('unsupported'); return res(); }
      navigator.geolocation.getCurrentPosition(() => { setLoc('granted'); res(); }, () => { setLoc('denied'); res(); }, { enableHighAccuracy: true, timeout: 15000 });
    });
    if (typeof Notification !== 'undefined') {
      try { const r = await Notification.requestPermission(); setNoti(r === 'granted' ? 'granted' : 'denied'); } catch { setNoti('denied'); }
    }
    setBusy(false);
    haptic.ok();
  }
  const all = cam !== 'idle' && loc !== 'idle';
  const rows = [
    { icon: <IconTarget />, t: 'Camera', d: 'Take your live selfie now, and scan runner QR codes as a hunter.', s: cam },
    { icon: <IconMap />, t: 'Precise location', d: 'Puts you on the live map and keeps you inside the boundary. Shared only during a match, deleted when it ends.', s: loc },
    { icon: <IconSOS />, t: 'Notifications', d: 'Silent alerts when the hunt starts, a runner is caught, or the zone shrinks.', s: noti },
  ];
  return (
    <Slash>
      <div className="screen">
        <div className="eyebrow" style={{ marginBottom: 8 }}>2 / 3 · Permissions</div>
        <h1 className="display" style={{ fontSize: 44, margin: '0 0 8px' }}>Gear check</h1>
        <p className="muted" style={{ marginTop: 0 }}>TAG is played outdoors on real streets. It needs three things from your phone.</p>
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          {rows.map((r, i) => (
            <motion.div key={r.t} className="frame soft cut" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
              <div className="inner cut row" style={{ padding: 16, alignItems: 'flex-start', gap: 14 }}>
                <div style={{ color: 'var(--accent)', marginTop: 2 }}>{r.icon}</div>
                <div className="grow">
                  <div className="row between">
                    <div className="display" style={{ fontSize: 20 }}>{r.t}</div>
                    <span className={`tag ${r.s === 'granted' ? 'ok' : r.s === 'denied' ? 'bad' : ''}`}>
                      {r.s === 'granted' ? 'On' : r.s === 'denied' ? 'Blocked' : r.s === 'unsupported' ? 'N/A' : 'Needed'}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 14 }}>{r.d}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        {(cam === 'denied' || loc === 'denied') && (
          <p className="danger" style={{ fontSize: 14 }}>Something was blocked. Open your browser's site settings for this page, allow it, then reload.</p>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 24 }} className="stack">
          {!all ? <Button size="lg" block loading={busy} onClick={askAll}>Allow access</Button>
            : <Button size="lg" block arrow onClick={() => nav('/setup/selfie', { replace: true })} disabled={cam === 'denied'}>Take my selfie</Button>}
        </div>
      </div>
    </Slash>
  );
}

/* ---------- Live selfie ---------- */
export function Selfie({ retake = false }: { retake?: boolean }) {
  useTheme('neutral');
  const nav = useNavigate();
  const toast = useToast();
  const { session, refresh } = useSession();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  async function start() {
    setCamErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
    } catch { setCamErr('Camera blocked. Allow camera access for this site in your browser settings, then tap Retry.'); }
  }
  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => { start(); return stop; }, []);

  function capture() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas'); c.width = c.height = 640;
    const ctx = c.getContext('2d')!;
    ctx.translate(640, 0); ctx.scale(-1, 1); // mirror like the preview
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 640, 640);
    setFlash(true); setTimeout(() => setFlash(false), 180); haptic.tap();
    c.toBlob((b) => { if (b) { setShot(b); setPreview(URL.createObjectURL(b)); stop(); } }, 'image/jpeg', 0.82);
  }
  async function save() {
    if (!shot || !session) return;
    setBusy(true);
    try {
      const path = `${session.user.id}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('selfies').upload(path, shot, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('profiles').update({ selfie_path: path }).eq('id', session.user.id);
      if (error) throw error;
      await refresh();
      haptic.ok();
      nav(retake ? '/home/profile' : '/home', { replace: true });
    } catch (e: any) { toast(cleanError(e.message), true); } finally { setBusy(false); }
  }
  function again() { setShot(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); start(); }

  return (
    <Slash>
      <div className="screen">
        {!retake && <div className="eyebrow" style={{ marginBottom: 8 }}>3 / 3 · Selfie</div>}
        <h1 className="display" style={{ fontSize: 44, margin: '0 0 8px' }}>{retake ? 'New selfie' : 'Show your face'}</h1>
        <p className="muted" style={{ marginTop: 0 }}>Live camera only. Other players and the admin use it to recognise you on the field.</p>
        <div className="frame cut cut-lg" style={{ aspectRatio: '1', marginTop: 8, position: 'relative' }}>
          <div className="inner cut cut-lg" style={{ position: 'relative', overflow: 'hidden', background: '#000' }}>
            {preview ? <img src={preview} alt="Your selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
            {!preview && !camErr && (
              <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <ellipse cx="50" cy="47" rx="27" ry="34" fill="none" stroke="rgba(239,230,214,.55)" strokeWidth=".6" strokeDasharray="2 2" />
                <path d="M8 18V8h10M82 8h10v10M92 82v10H82M18 92H8V82" fill="none" stroke="var(--accent)" strokeWidth="1" />
              </svg>
            )}
            {camErr && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
              <div className="stack"><span className="muted">{camErr}</span><Button size="sm" kind="ghost" onClick={start}>Retry</Button></div></div>}
            {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff' }} />}
          </div>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 24 }} className="stack">
          {!preview ? (
            <Button size="lg" block onClick={capture} disabled={!!camErr}>Capture</Button>
          ) : (
            <>
              <Button size="lg" block arrow loading={busy} onClick={save}>{retake ? 'Save selfie' : 'Enter TAG'}</Button>
              <Button kind="ghost" block onClick={again} disabled={busy}>Retake</Button>
            </>
          )}
        </div>
      </div>
    </Slash>
  );
}
