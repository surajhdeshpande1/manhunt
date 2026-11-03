import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
      <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
        <button onClick={() => nav('/selfie')} aria-label="Retake selfie" style={{ position: 'relative' }}>
          <Avatar src={profile.selfie_path} name={profile.username} size={96} />
          <span className="tag" style={{ position: 'absolute', bottom: -8, left: 8, background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10 }}>Retake</span>
        </button>
        <div className="grow">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {profile.is_owner && <span className="tag live">Owner</span>}
            {profile.is_organiser && !profile.is_owner && <span className="tag ok">Organiser</span>}
          </div>
          <div className="display" style={{ fontSize: 32, marginTop: 6 }}>@{profile.username}</div>
          <div style={{ fontWeight: 600 }}>{profile.full_name}</div>
          <div className="muted" style={{ fontSize: 13 }}>{profile.college} · {profile.branch} · {YEAR[profile.year]} year</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)' }} className="cut">
        {stats.map((s) => (
          <div key={s.k} style={{ background: 'var(--surface)', padding: '14px 12px' }}>
            <div className="display mono" style={{ fontSize: 28 }}>{s.v}</div>
            <div className="eyebrow" style={{ fontSize: 10 }}>{s.k}</div>
          </div>
        ))}
      </div>

      <Section title={`Badges · ${earned.size}/${Object.keys(BADGES).length}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {Object.entries(BADGES).map(([code, b]) => {
            const on = earned.has(code);
            return (
              <div key={code} title={`${b.name}: ${b.desc}`} className="cut center" style={{ padding: '12px 4px', background: on ? 'var(--surface2)' : 'var(--bg2)', opacity: on ? 1 : 0.45 }}>
                <div className="display" style={{ fontSize: 26, color: on ? 'var(--accent)' : 'var(--faint)', height: 30 }}>{b.glyph}</div>
                <div className="display" style={{ fontSize: 12, marginTop: 4 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>{b.desc}</div>
              </div>
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
