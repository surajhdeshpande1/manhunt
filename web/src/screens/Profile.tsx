import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CountUp, LightTrails } from '../components/Art';
import { WinDial } from '../components/Diagrams';
import { Avatar, Button, Empty, Field, Modal, Section, useToast } from '../components/ui';
import { callFunction, rpc } from '../lib/supabase';
import { useSession } from '../lib/session';
import { fmtDist } from '../lib/clock';
import { haptic } from '../lib/feel';

export const BADGES: Record<string, { name: string; desc: string; glyph: string }> = {
  first_blood: { name: 'First Blood', desc: 'Catch a runner', glyph: '✕' },
  hat_trick: { name: 'Hat Trick', desc: '3 catches in one match', glyph: 'ⅲ' },
  ghost: { name: 'Ghost', desc: 'Survive a match as a runner', glyph: '◌' },
  full_clear: { name: 'Full Clear', desc: 'Finish every task in a match', glyph: '▣' },
  first_win: { name: 'Victor', desc: 'Win your first match', glyph: '▲' },
  veteran: { name: 'Veteran', desc: 'Play 10 matches', glyph: 'X' },
  road_runner: { name: 'Road Runner', desc: 'Move 2 km in one match', glyph: '»' },
  marathon: { name: 'Marathon', desc: 'Move 5 km in total', glyph: '∞' },
};
const YEAR = ['', '1st', '2nd', '3rd', '4th'];

export default function Profile() {
  const nav = useNavigate();
  const { profile, signOut } = useSession();
  const [edit, setEdit] = useState(false);
  if (!profile) return null;
  const earned = new Set(profile.badges.map((b) => b.code));
  const stats = [
    { k: 'Matches', v: profile.matches }, { k: 'Wins', v: profile.wins }, { k: 'Catches', v: profile.catches },
    { k: 'Tasks', v: profile.tasks_done }, { k: 'Caught', v: profile.times_caught }, { k: 'Moved', v: fmtDist(profile.distance_m) },
  ];
  return (
    <div className="screen" style={{ gap: 28 }}>
      {/* player card */}
      <motion.div className="card glow-edge" initial={{ opacity: 0, y: 20, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, padding: '22px 20px 20px', marginTop: 8, transformPerspective: 900,
          background: 'radial-gradient(130% 90% at 100% 0%, rgba(255,106,26,.38), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(232,54,31,.3), transparent 60%), #0b0705' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.6, pointerEvents: 'none' }}><LightTrails height="100%" dim /></div>
        <div className="row between" style={{ position: 'relative', alignItems: 'flex-start' }}>
          <button onClick={() => nav('/selfie')} aria-label="Retake selfie" style={{ position: 'relative', width: 112, height: 112, display: 'grid', placeItems: 'center' }}>
            <motion.span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(#ffd400, #ff6a1a, #e8361f, #ffd400)' }} animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
            <span style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: '#000' }} />
            <span style={{ position: 'relative', borderRadius: '50%', overflow: 'hidden' }}><Avatar src={profile.selfie_path} name={profile.username} size={96} className="round" /></span>
            <span className="tag" style={{ position: 'absolute', bottom: -6, background: '#fff', color: '#000', fontSize: 10.5 }}>Retake</span>
          </button>
          <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
            {profile.is_owner && <span className="tag" style={{ background: 'var(--grad-police)', color: '#000' }}>Owner</span>}
            {profile.is_organiser && <span className="tag" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}>Organiser</span>}
          </div>
        </div>
        <div style={{ position: 'relative', marginTop: 18 }}>
          <div className="display" style={{ fontSize: 40, fontWeight: 850, letterSpacing: '-0.055em' }}>@{profile.username}</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{profile.full_name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,240,230,.62)', marginTop: 2 }}>{profile.college} · {profile.branch} · {YEAR[profile.year]} year</div>
        </div>
      </motion.div>

      <div className="card row" style={{ padding: '16px 18px', gap: 18, borderRadius: 24 }}>
        <WinDial wins={profile.wins} matches={profile.matches} size={120} />
        <div className="grow">
          <div className="display" style={{ fontSize: 30, fontWeight: 800 }}><CountUp value={profile.wins} /> <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}>wins</span></div>
          <div className="muted" style={{ fontSize: 14 }}>from {profile.matches} {profile.matches === 1 ? 'match' : 'matches'}</div>
          <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />
          <div style={{ fontSize: 13.5 }}><span style={{ color: 'var(--gold)', fontWeight: 650 }}>{profile.catches}</span> <span className="muted">tags made</span> · <span style={{ color: 'var(--copper)', fontWeight: 650 }}>{profile.times_caught}</span> <span className="muted">times tagged</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {stats.filter((x) => ['Tasks', 'Moved'].includes(x.k)).map((st, i) => {
          const num = typeof st.v === 'number' ? st.v : parseFloat(String(st.v));
          const unit = typeof st.v === 'number' ? '' : String(st.v).replace(/[\d.\s]/g, '');
          const hot = false;
          return (
            <motion.div key={st.k} className="card" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + i * 0.05, type: 'spring', damping: 20 }}
              style={{ padding: '14px 12px', borderRadius: 18, ...(hot ? { background: 'var(--grad-ember)', boxShadow: '0 14px 30px -14px #ff6a1a' } : {}) }}>
              <div className="display" style={{ fontSize: 30, fontWeight: 800 }}><CountUp value={isNaN(num) ? 0 : num} decimals={unit && num % 1 ? 1 : 0} />{unit && <span style={{ fontSize: 16, marginLeft: 3 }}>{unit}</span>}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: hot ? 'rgba(255,255,255,.8)' : 'var(--muted)' }}>{st.k}</div>
            </motion.div>
          );
        })}
      </div>

      <Section title={`Badges · ${earned.size} of ${Object.keys(BADGES).length}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {Object.entries(BADGES).map(([code, b], i) => {
            const on = earned.has(code);
            return (
              <motion.div key={code} title={`${b.name}: ${b.desc}`} className="center" whileTap={{ scale: 0.92, rotate: -3 }}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: on ? 1 : 0.38, scale: 1 }} transition={{ delay: 0.25 + i * 0.04, type: 'spring', damping: 16 }}
                style={{ padding: '14px 4px 12px', borderRadius: 18, position: 'relative', overflow: 'hidden',
                  background: on ? 'radial-gradient(100% 80% at 50% 0%, rgba(255,106,26,.32), transparent 70%), var(--surface)' : 'var(--bg2)', boxShadow: on ? 'inset 0 0 0 1px rgba(255,140,60,.28)' : 'inset 0 0 0 1px var(--line)' }}>
                <div className={on ? 'display text-flare' : 'display'} style={{ fontSize: 28, height: 32, color: on ? undefined : 'var(--faint)' }}>{b.glyph}</div>
                <div style={{ fontSize: 12, fontWeight: 650, marginTop: 4 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 10, lineHeight: 1.25, padding: '0 2px' }}>{b.desc}</div>
              </motion.div>
            );
          })}
        </div>
      </Section>

      <Friends />
      <Leaderboard />
      {profile.is_owner && <OwnerPanel />}

      <Section title="Account">
        <div className="card" style={{ padding: '4px 16px' }}>
          <div className="list-row"><span className="muted grow">Email</span><span>{profile.email}</span></div>
          <div className="list-row"><span className="muted grow">Mobile</span><span className="mono">{profile.phone}</span></div>
          <div className="list-row"><span className="muted grow">Date of birth</span><span className="mono">{profile.dob}</span></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Button kind="ghost" className="grow" onClick={() => setEdit(true)}>Edit details</Button>
          <Button kind="ghost" className="grow" onClick={() => nav('/reset')}>Password</Button>
          <Button kind="quiet" className="grow" onClick={signOut}>Sign out</Button>
        </div>
      </Section>
      <EditProfile open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}

function EditProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refresh } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', phone: '', college: '', branch: '', year: 1 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && profile) setF({ full_name: profile.full_name, phone: profile.phone.replace(/^\+91/, ''), college: profile.college, branch: profile.branch, year: profile.year });
  }, [open, profile]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!/^[0-9]{10}$/.test(f.phone)) { toast('Enter a 10-digit mobile number', true); return; }
    if (!/^[A-Z&]{2,8}$/.test(f.branch)) { toast('Branch: short form, e.g. ISE', true); return; }
    setBusy(true);
    try { await rpc('update_profile', { p_full_name: f.full_name, p_phone: '+91' + f.phone, p_college: f.college, p_branch: f.branch, p_year: f.year }); await refresh(); toast('Saved'); onClose(); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit details">
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <Field label="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <Field label="Mobile" prefix="+91" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
        <Field label="College" value={f.college} onChange={(e) => setF({ ...f, college: e.target.value })} />
        <Field label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value.toUpperCase().replace(/[^A-Z&]/g, '').slice(0, 8) })} />
        <div className="chips">{[1, 2, 3, 4].map((y) => <button type="button" key={y} className={`chip ${f.year === y ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setF({ ...f, year: y })}>{YEAR[y]}</button>)}</div>
        <Button size="lg" block loading={busy} type="submit">Save</Button>
      </form>
    </Modal>
  );
}

/* ---------- FRIENDS ---------- */
type Friend = { id: string; username: string; name: string; selfie: string | null; college: string; wins: number; matches: number; status: string; incoming: boolean };
function Friends() {
  const toast = useToast();
  const { refresh } = useSession();
  const [list, setList] = useState<Friend[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => rpc<Friend[]>('my_friends').then(setList).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await rpc<string>('friend_request', { p_username: q.replace(/^@/, '') });
      toast(r === 'sent' ? 'Request sent' : r === 'accepted' ? 'You are now friends' : r === 'already' ? 'Already friends' : 'Request already sent');
      setQ(''); load();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function respond(id: string, ok: boolean) { await rpc('friend_respond', { p_user: id, p_accept: ok }).catch((e) => toast(e.message, true)); haptic.tap(); load(); refresh(); }
  return (
    <Section title={`Friends · ${list.filter((f) => f.status === 'accepted').length}`}>
      <form className="row" style={{ gap: 8 }} onSubmit={add}>
        <div className="input-wrap cut grow" style={{ ['--c' as any]: '8px' }}>
          <input className="input" placeholder="Add by @username" autoCapitalize="none" value={q} onChange={(e) => setQ(e.target.value.toLowerCase())} />
        </div>
        <Button size="sm" style={{ minHeight: 52 }} loading={busy} disabled={q.replace('@', '').length < 3} type="submit">Add</Button>
      </form>
      {list.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>Add friends to invite them straight into your rooms.</p> : (
        <div className="card" style={{ padding: '0 14px' }}>
          {list.map((f) => (
            <div key={f.id} className="list-row">
              <Avatar src={f.selfie} name={f.username} size={38} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>@{f.username}</div>
                <div className="muted" style={{ fontSize: 12 }}>{f.status === 'pending' ? (f.incoming ? 'Wants to be friends' : 'Request sent') : `${f.wins} wins · ${f.matches} matches`}</div>
              </div>
              {f.incoming ? (
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" onClick={() => respond(f.id, true)}>Accept</Button>
                  <Button size="sm" kind="quiet" onClick={() => respond(f.id, false)}>✕</Button>
                </div>
              ) : <button className="muted" style={{ fontSize: 13 }} onClick={() => respond(f.id, false)}>{f.status === 'pending' ? 'Cancel' : 'Remove'}</button>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------- LEADERBOARD ---------- */
type LB = { id?: string; username?: string; name?: string; selfie?: string | null; college: string; branch?: string; value: number; matches: number; players?: number; me?: boolean };
function Leaderboard() {
  const [kind, setKind] = useState<'players' | 'colleges'>('players');
  const [metric, setMetric] = useState<'wins' | 'catches' | 'tasks' | 'distance'>('wins');
  const [rows, setRows] = useState<LB[] | null>(null);
  useEffect(() => { setRows(null); rpc<LB[]>('leaderboard', { p_kind: kind, p_metric: metric }).then(setRows).catch(() => setRows([])); }, [kind, metric]);
  return (
    <Section title="Leaderboard">
      <div className="row" style={{ gap: 8 }}>
        {(['players', 'colleges'] as const).map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setKind(k)}>{k}</button>)}
      </div>
      <div className="row scroll-x" style={{ gap: 6 }}>
        {(['wins', 'catches', 'tasks', 'distance'] as const).map((m) => (
          <button key={m} className={`tag`} style={{ padding: '6px 10px', background: metric === m ? 'var(--text)' : 'var(--surface2)', color: metric === m ? 'var(--bg)' : 'var(--muted)' }} onClick={() => setMetric(m)}>{m}</button>
        ))}
      </div>
      {rows === null ? <div className="card" style={{ height: 160, opacity: 0.4 }} /> : rows.length === 0 ? (
        <Empty title="No scores yet" body="Finish a match to get on the board." />
      ) : (
        <div className="card" style={{ padding: '0 14px' }}>
          {rows.slice(0, 20).map((r, i) => (
            <div key={r.id || r.college} className="list-row" style={{ background: r.me ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined, margin: r.me ? '0 -14px' : 0, padding: r.me ? '12px 14px' : undefined }}>
              <div className="display mono" style={{ width: 28, fontSize: 20, color: i < 3 ? 'var(--accent)' : 'var(--muted)' }}>{i + 1}</div>
              {kind === 'players' && <Avatar src={r.selfie} name={r.username} size={34} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kind === 'players' ? `@${r.username}` : r.college}</div>
                <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {kind === 'players' ? `${r.college} · ${r.branch}` : `${r.players} players · ${r.matches} match entries`}
                </div>
              </div>
              <div className="display mono" style={{ fontSize: 22 }}>{metric === 'distance' ? fmtDist(r.value) : r.value}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------- OWNER ---------- */
type App_ = { id: number; note: string; status: string; at: string; user: { id: string; username: string; name: string; selfie: string | null; college: string; branch: string; year: number; matches: number } };
function OwnerPanel() {
  const toast = useToast();
  const [apps, setApps] = useState<App_[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => rpc<App_[]>('owner_applications').then(setApps).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  async function decide(id: number, ok: boolean) { try { await rpc('owner_decide', { p_app: id, p_approve: ok }); load(); } catch (e: any) { toast(e.message, true); } }
  async function find(e: FormEvent) {
    e.preventDefault(); setTemp(null);
    const u = await rpc('owner_find_user', { p_username: q.replace('@', '') }).catch((e) => { toast(e.message, true); return null; });
    setFound(u); if (!u) toast('No such player', true);
  }
  async function reset() {
    if (!found) return;
    setBusy(true);
    try { const r = await callFunction<{ temp_password: string }>('owner-reset', { user_id: found.id }); setTemp(r.temp_password); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  const pending = apps.filter((a) => a.status === 'pending');
  return (
    <Section title="Owner console">
      <div className="frame cut" style={{ background: 'var(--accent)' }}>
        <div className="inner cut" style={{ padding: 16 }}>
          <div className="display" style={{ fontSize: 20, marginBottom: 8 }}>Organiser applications · {pending.length} pending</div>
          {apps.length === 0 ? <p className="muted" style={{ margin: 0 }}>No applications yet.</p> : apps.slice(0, 12).map((a) => (
            <div key={a.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <Avatar src={a.user.selfie} name={a.user.username} size={38} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>@{a.user.username} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {a.user.college} {a.user.branch} · {a.user.matches} matches</span></div>
                <div style={{ fontSize: 14 }}>{a.note}</div>
                {a.status !== 'pending' && <span className={`tag ${a.status === 'approved' ? 'ok' : 'bad'}`} style={{ marginTop: 6 }}>{a.status}</span>}
              </div>
              {a.status === 'pending' && (
                <div className="stack" style={{ gap: 6 }}>
                  <Button size="sm" onClick={() => decide(a.id, true)}>Approve</Button>
                  <Button size="sm" kind="quiet" onClick={() => decide(a.id, false)}>Reject</Button>
                </div>
              )}
            </div>
          ))}
          <hr className="hr" />
          <div className="display" style={{ fontSize: 20, marginBottom: 8 }}>Reset a player's password</div>
          <form className="row" style={{ gap: 8 }} onSubmit={find}>
            <div className="input-wrap cut grow"><input className="input" placeholder="@username" autoCapitalize="none" value={q} onChange={(e) => setQ(e.target.value.toLowerCase())} /></div>
            <Button size="sm" style={{ minHeight: 52 }} type="submit" disabled={q.length < 3}>Find</Button>
          </form>
          {found && (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row"><Avatar src={found.selfie} name={found.username} size={36} /><div><b>@{found.username}</b><div className="muted" style={{ fontSize: 12 }}>{found.email} · {found.phone}</div></div></div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Check it's really them (call the number above) before resetting.</p>
              {temp ? (
                <div className="card card-pad" style={{ background: 'var(--surface2)' }}>
                  <div className="eyebrow">Temporary password</div>
                  <div className="display mono" style={{ fontSize: 30, letterSpacing: '0.1em', userSelect: 'all' }}>{temp}</div>
                  <div className="muted" style={{ fontSize: 13 }}>Tell them to sign in with it, then change it.</div>
                </div>
              ) : <Button kind="danger" loading={busy} onClick={reset}>Issue temporary password</Button>}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
