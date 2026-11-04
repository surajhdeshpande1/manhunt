import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CountUp } from '../components/Art';
import { WinDial } from '../components/Diagrams';
import { BadgeArt } from '../components/BadgeArt';
import { STYLES, TITLES, titleLabel, type CardStyle } from '../lib/identity';
import { Avatar, Button, Empty, Field, Modal, Section, Segmented, useToast } from '../components/ui';
import { setAppearance, useAppearance, isDaytime, type Appearance } from '../lib/theme';
import { setSound, sfx, useSoundOn } from '../lib/sound';
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
  const [custom, setCustom] = useState(false);
  if (!profile) return null;
  const earned = new Set(profile.badges.map((b) => b.code));
  const stats = [
    { k: 'Matches', v: profile.matches }, { k: 'Wins', v: profile.wins }, { k: 'Catches', v: profile.catches },
    { k: 'Tasks', v: profile.tasks_done }, { k: 'Caught', v: profile.times_caught }, { k: 'Moved', v: fmtDist(profile.distance_m) },
  ];
  const ST = (STYLES[profile.card_style as CardStyle] ?? STYLES.ember);
  return (
    <div className="screen" style={{ gap: 30 }}>
      {/* player card: a flat cut-paper ID */}
      <motion.div initial={{ opacity: 0, y: 18, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
        style={{ position: 'relative', overflow: 'hidden', padding: '22px 20px 24px', margin: '8px 5px 5px 0', borderRadius: 12, background: ST.bg, color: ST.ink, boxShadow: '0 0 0 3px var(--edge), 6px 6px 0 3px var(--edge)' }}>
        <div aria-hidden className="halftone" style={{ position: 'absolute', right: -20, top: -20, width: 180, height: 180, color: ST.ink, opacity: 0.18, borderRadius: '50%' }} />
        <div className="row between" style={{ position: 'relative', alignItems: 'flex-start' }}>
          <button onClick={() => nav('/selfie')} aria-label="Retake selfie" style={{ position: 'relative', borderRadius: 10, boxShadow: `0 0 0 3px ${ST.ring}, 5px 5px 0 3px ${ST.ring}`, overflow: 'visible' }}>
            <Avatar src={profile.selfie_path} name={profile.username} size={100} />
            <span className="tag" style={{ position: 'absolute', bottom: -10, left: 8, background: '#fff2e0', color: '#14110f', boxShadow: '0 0 0 2px #14110f' }}>Retake</span>
          </button>
          <div className="stack" style={{ gap: 8, alignItems: 'flex-end' }}>
            {profile.is_owner && <span className="tag" style={{ background: '#14110f', color: '#ffd400', boxShadow: 'none' }}>Owner</span>}
            {profile.is_organiser && <span className="tag" style={{ background: '#fff2e0', color: '#14110f', boxShadow: '0 0 0 2px #14110f' }}>Organiser</span>}
          </div>
        </div>
        <div style={{ position: 'relative', marginTop: 24 }}>
          {titleLabel(profile.title) && <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', background: ST.ink, color: ST.bg, padding: '3px 8px', marginBottom: 8 }}>{titleLabel(profile.title)}</div>}
          <div className="display" style={{ fontSize: 'clamp(34px, 11vw, 46px)', wordBreak: 'break-word' }}>@{profile.username}</div>
          <div style={{ fontWeight: 750, marginTop: 6, fontSize: 16 }}>{profile.full_name}</div>
          <div style={{ fontSize: 13.5, opacity: 0.75, marginTop: 2, fontWeight: 550 }}>{profile.college} · {profile.branch} · {YEAR[profile.year]} year</div>
          <button onClick={() => setCustom(true)} className="row" style={{ marginTop: 18, gap: 8, padding: '10px 14px', borderRadius: 8, background: ST.ink, color: ST.bg, fontWeight: 800, fontSize: 13.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /></svg>
            Customise card & title
          </button>
        </div>
      </motion.div>

      <div className="card row" style={{ padding: '18px 18px', gap: 18 }}>
        <WinDial wins={profile.wins} matches={profile.matches} size={120} />
        <div className="grow">
          <div className="display" style={{ fontSize: 30, fontWeight: 800 }}><CountUp value={profile.wins} /> <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}>wins</span></div>
          <div className="muted" style={{ fontSize: 14 }}>from {profile.matches} {profile.matches === 1 ? 'match' : 'matches'}</div>
          <div style={{ height: 2, background: 'var(--line)', margin: '12px 0' }} />
          <div style={{ fontSize: 13.5 }}><span style={{ color: 'var(--gold)', fontWeight: 650 }}>{profile.catches}</span> <span className="muted">tags made</span> · <span style={{ color: 'var(--copper)', fontWeight: 650 }}>{profile.times_caught}</span> <span className="muted">times tagged</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {stats.filter((x) => ['Tasks', 'Moved'].includes(x.k)).map((st, i) => {
          const num = typeof st.v === 'number' ? st.v : parseFloat(String(st.v));
          const unit = typeof st.v === 'number' ? '' : String(st.v).replace(/[\d.\s]/g, '');
          const hot = false;
          return (
            <motion.div key={st.k} className="card" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + i * 0.05, type: 'spring', damping: 20 }}
              style={{ padding: '16px 14px' }}>
              <div className="display" style={{ fontSize: 30, fontWeight: 800 }}><CountUp value={isNaN(num) ? 0 : num} decimals={unit && num % 1 ? 1 : 0} />{unit && <span style={{ fontSize: 16, marginLeft: 3 }}>{unit}</span>}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: hot ? 'rgba(255,255,255,.8)' : 'var(--muted)' }}>{st.k}</div>
            </motion.div>
          );
        })}
      </div>

      <Section title={`Badges · ${earned.size} of ${Object.keys(BADGES).length}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Object.entries(BADGES).map(([code, b], i) => {
            const on = earned.has(code);
            return (
              <motion.div key={code} title={`${b.name}: ${b.desc}`} className="center" whileTap={{ scale: 0.92, rotate: -3 }}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: on ? 1 : 0.7, scale: 1 }} transition={{ delay: 0.25 + i * 0.04, type: 'spring', damping: 16 }}
                style={{ padding: '14px 4px 12px', borderRadius: 10, position: 'relative', overflow: 'hidden',
                  background: on ? 'var(--surface)' : 'var(--bg2)', boxShadow: on ? '0 0 0 2px var(--edge), 3px 3px 0 2px var(--flare)' : '0 0 0 2px var(--line)' }}>
                <BadgeArt code={code} on={on} size={46} />
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

      <Section title="Appearance">
        <AppearancePicker />
        <SoundToggle />
      </Section>

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
      <Customise open={custom} onClose={() => setCustom(false)} />
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

function AppearancePicker() {
  const a = useAppearance();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Segmented<Appearance> value={a} onChange={setAppearance}
        options={[{ v: 'auto', label: 'Auto' }, { v: 'night', label: 'Night' }, { v: 'day', label: 'Day' }]} />
      <div className="muted" style={{ fontSize: 13 }}>
        {a === 'auto' ? `Follows the sun: paper-and-ink in daylight, cinematic night after dark. It’s ${isDaytime() ? 'day' : 'night'} mode right now.`
          : a === 'day' ? 'High-contrast paper and ink. Easiest to read in bright sun.' : 'The cinematic night look, all the time.'}
      </div>
    </div>
  );
}

function SoundToggle() {
  const on = useSoundOn();
  return (
    <div className="card row between" style={{ padding: '12px 16px', borderRadius: 12 }}>
      <div>
        <div style={{ fontWeight: 600 }}>Sound effects</div>
        <div className="muted" style={{ fontSize: 13 }}>Film score, hunt siren, catches and wins. Vibration stays on either way.</div>
      </div>
      <button role="switch" aria-checked={on} aria-label="Sound effects" onClick={() => { setSound(!on); if (!on) setTimeout(() => sfx.ping(), 50); }}
        style={{ width: 52, height: 32, flex: 'none', position: 'relative', background: on ? 'var(--flare)' : 'var(--surface3)', boxShadow: '0 0 0 2.5px var(--edge)', borderRadius: 8, transition: 'background .2s' }}>
        <motion.span layout transition={{ type: 'spring', damping: 22, stiffness: 400 }} style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 26, height: 26, borderRadius: 4, background: '#fff2e0', boxShadow: '0 0 0 2px #14110f' }} />
      </button>
    </div>
  );
}

function Customise({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refresh } = useSession();
  const toast = useToast();
  if (!profile) return null;
  const titles = new Set(profile.unlocks?.titles ?? ['rookie']);
  const styles = new Set(profile.unlocks?.styles ?? ['ember', 'police', 'midnight']);
  async function save(p: { title?: string; style?: string }) {
    try { await rpc('set_identity', { p_title: p.title ?? null, p_style: p.style ?? null }); haptic.ok(); await refresh(); }
    catch (e: any) { toast(e.message, true); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Your card">
      <div className="stack" style={{ gap: 22 }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="eyebrow sec-title">Card style</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {(Object.keys(STYLES) as CardStyle[]).map((k) => {
              const st = STYLES[k]; const can = styles.has(k); const on = profile.card_style === k;
              return (
                <motion.button key={k} whileTap={can ? { scale: 0.96 } : undefined} disabled={!can} onClick={() => save({ style: k })}
                  style={{ position: 'relative', height: 92, borderRadius: 12, background: st.bg, color: st.ink, textAlign: 'left', padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    boxShadow: on ? '0 0 0 3px var(--edge), 4px 4px 0 3px var(--flare)' : '0 0 0 2px var(--line2)', opacity: can ? 1 : 0.5 }}>
                  <span style={{ fontWeight: 700 }}>{st.label}</span>
                  <span style={{ fontSize: 11.5, opacity: 0.7 }}>{can ? (on ? 'In use' : 'Tap to use') : `Locked · ${st.how}`}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="eyebrow sec-title">Callsign title</div>
          <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>Shown under your name on the map and in every roster.</div>
          <div className="stack" style={{ gap: 8 }}>
            {Object.entries(TITLES).map(([k, t]) => {
              const can = titles.has(k); const on = (profile.title || 'rookie') === k;
              return (
                <motion.button key={k} whileTap={can ? { scale: 0.98 } : undefined} disabled={!can} onClick={() => save({ title: k })} className="card row between"
                  style={{ padding: '12px 14px', borderRadius: 12, textAlign: 'left', opacity: can ? 1 : 0.5, boxShadow: on ? 'inset 0 0 0 1.5px var(--gold)' : undefined }}>
                  <div>
                    <div className="display" style={{ fontSize: 20, color: on ? 'var(--gold)' : undefined }}>{t.label}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t.how}</div>
                  </div>
                  <span className="tag" style={on ? { background: 'var(--gold)', color: '#000' } : undefined}>{on ? 'Equipped' : can ? 'Use' : 'Locked'}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
