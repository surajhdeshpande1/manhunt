import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Avatar, Button, Empty, Field, IconGlobe, IconHost, IconLock, IconProfile, IconRefresh, IconRooms, Logo, Modal, Section, Slash, useInterval, useToast } from '../components/ui';
import { rpc } from '../lib/supabase';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { timeAgo } from '../lib/clock';
import Profile from './Profile';

export default function Home() {
  useTheme('neutral');
  return (
    <div style={{ minHeight: '100%', paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}>
      <Routes>
        <Route index element={<Slash k="rooms"><RoomsTab /></Slash>} />
        <Route path="host" element={<Slash k="host"><HostTab /></Slash>} />
        <Route path="profile/*" element={<Slash k="profile"><Profile /></Slash>} />
      </Routes>
      <TabBar />
    </div>
  );
}

function TabBar() {
  const { profile } = useSession();
  const tabs = [
    { to: '/home', label: 'Rooms', icon: <IconRooms />, end: true, badge: profile?.invites || 0 },
    { to: '/home/host', label: 'Host', icon: <IconHost />, end: false, badge: 0 },
    { to: '/home/profile', label: 'Profile', icon: <IconProfile />, end: false, badge: profile?.friends_pending || 0 },
  ];
  return (
    <nav aria-label="Main" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100, background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} onClick={() => haptic.tap()}
            style={({ isActive }) => ({ position: 'relative', height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              color: isActive ? 'var(--text)' : 'var(--faint)', textDecoration: 'none', transition: 'color .2s' })}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tabbar" style={{ position: 'absolute', top: 0, width: 36, height: 3, background: 'var(--accent)', transform: 'skewX(-20deg)' }} />}
                <span style={{ position: 'relative' }}>
                  {t.icon}
                  {t.badge > 0 && <span style={{ position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, padding: '0 4px', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{t.badge}</span>}
                </span>
                <span className="display" style={{ fontSize: 12, letterSpacing: '0.16em', fontWeight: 600 }}>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/* ---------- ROOMS ---------- */
type PublicRoom = { id: string; name: string; status: string; max: number; players: number; created_at: string; has_area: boolean;
  admin: { username: string; selfie: string | null; college: string }; my_status: string | null; is_admin: boolean };
type MyRoom = { id: string; name: string; status: string; is_public: boolean; is_admin: boolean; my_status: string | null; players: number; created_at: string };
type Invite = { id: number; room_id: string; room: string; is_public: boolean; from: { username: string; selfie: string | null }; players: number; at: string };

function RoomsTab() {
  const nav = useNavigate();
  const toast = useToast();
  const { profile, refresh } = useSession();
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [mine, setMine] = useState<MyRoom[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [joining, setJoining] = useState<string | null>(null);
  const [privOpen, setPrivOpen] = useState(false);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([rpc<PublicRoom[]>('list_public_rooms'), rpc<MyRoom[]>('my_rooms'), rpc<Invite[]>('my_invites')]);
      setRooms(a); setMine(b); setInvites(c);
    } catch (e: any) { toast(e.message, true); setRooms((r) => r ?? []); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useInterval(load, 8000);

  async function enter(id: string) {
    setJoining(id);
    try { await rpc('request_join', { p_room: id }); haptic.ok(); nav(`/room/${id}`); refresh(); }
    catch (e: any) { toast(e.message, true); } finally { setJoining(null); }
  }

  const active = mine.filter((r) => r.status !== 'ended' || r.is_admin);
  return (
    <div className="screen" style={{ gap: 26 }}>
      <header className="row between">
        <Logo size={34} />
        <div className="row" style={{ gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>Callsign</div>
            <div className="display" style={{ fontSize: 17 }}>@{profile?.username}</div>
          </div>
          <Avatar src={profile?.selfie_path} name={profile?.username} size={40} />
        </div>
      </header>

      {active.length > 0 && (
        <Section title="Your rooms">
          {active.map((r) => (
            <button key={r.id} onClick={() => nav(`/room/${r.id}`)} className="frame cut" style={{ textAlign: 'left', background: 'var(--accent)' }}>
              <div className="inner cut row" style={{ padding: '14px 16px', gap: 12 }}>
                <div className="grow">
                  <div className="display" style={{ fontSize: 22 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {r.is_admin ? 'You are the admin' : r.my_status === 'pending' ? 'Waiting for admin to accept' : 'You are in'} · {r.players} players
                  </div>
                </div>
                <StatusTag s={r.status} />
                <span className="accent display" style={{ fontSize: 18 }}>→</span>
              </div>
            </button>
          ))}
        </Section>
      )}

      {invites.length > 0 && (
        <Section title="Invites">
          {invites.map((i) => (
            <div key={i.id} className="card card-pad row" style={{ gap: 12, background: 'var(--surface2)' }}>
              <Avatar src={i.from.selfie} name={i.from.username} size={42} />
              <div className="grow">
                <div className="display" style={{ fontSize: 19 }}>{i.room}</div>
                <div className="muted" style={{ fontSize: 13 }}>@{i.from.username} invited you · {i.players} in</div>
              </div>
              <Button size="sm" loading={joining === i.room_id} onClick={() => enter(i.room_id)}>Join</Button>
              <button className="icon-btn muted" aria-label="Dismiss" onClick={async () => { await rpc('dismiss_invite', { p_id: i.id }).catch(() => {}); load(); refresh(); }}>✕</button>
            </div>
          ))}
        </Section>
      )}

      <button onClick={() => setPrivOpen(true)} className="frame cut cut-lg" style={{ textAlign: 'left' }}>
        <div className="inner cut cut-lg ticks row" style={{ padding: '18px 18px', gap: 14, background: 'var(--surface)' }}>
          <div style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--accent-ink)' }} className="cut cut-sm"><IconLock /></div>
          <div className="grow">
            <div className="display" style={{ fontSize: 22 }}>Join private room</div>
            <div className="muted" style={{ fontSize: 13 }}>Got a room ID and password? Enter here.</div>
          </div>
          <span className="display accent" style={{ fontSize: 22 }}>→</span>
        </div>
      </button>

      <Section title={`Public rooms${rooms ? ` · ${rooms.length}` : ''}`}
        right={<button className="icon-btn muted" aria-label="Refresh" style={{ width: 32, height: 32, transform: spin ? 'rotate(360deg)' : 'none', transition: 'transform .6s' }}
          onClick={async () => { setSpin(true); await load(); setTimeout(() => setSpin(false), 600); }}><IconRefresh s={18} /></button>}>
        {rooms === null ? (
          [0, 1, 2].map((i) => <div key={i} className="card" style={{ height: 112, opacity: 0.4, background: 'var(--surface2)' }} />)
        ) : rooms.length === 0 ? (
          <Empty title="No public rooms yet" body="Approved organisers host public games here. Make your own private room from the Host tab." />
        ) : rooms.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
            <RoomCard r={r} busy={joining === r.id} onEnter={() => (r.is_admin || r.my_status === 'accepted' || r.my_status === 'pending' ? nav(`/room/${r.id}`) : enter(r.id))} />
          </motion.div>
        ))}
      </Section>

      <PrivateJoin open={privOpen} onClose={() => setPrivOpen(false)} />
    </div>
  );
}

function StatusTag({ s }: { s: string }) {
  if (s === 'lobby') return <span className="tag ok"><span className="dot" /> Open</span>;
  if (s === 'ended') return <span className="tag">Ended</span>;
  if (s === 'paused') return <span className="tag">Paused</span>;
  return <span className="tag live"><span className="dot pulse" /> Live</span>;
}

function RoomCard({ r, onEnter, busy }: { r: PublicRoom; onEnter: () => void; busy: boolean }) {
  const full = r.players >= r.max;
  const open = r.status === 'lobby';
  const label = r.is_admin ? 'Manage' : r.my_status === 'accepted' ? 'Open' : r.my_status === 'pending' ? 'Pending' : full ? 'Full' : open ? 'Enter' : 'Live';
  const can = r.is_admin || r.my_status === 'accepted' || r.my_status === 'pending' || (open && !full);
  return (
    <div className="frame soft cut" style={{ ['--c' as any]: '14px' }}>
      <div className="inner cut" style={{ ['--c' as any]: '14px', padding: 16, position: 'relative', overflow: 'hidden' }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: open ? 'var(--accent)' : 'var(--faint)' }} />
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="row" style={{ gap: 8, marginBottom: 6 }}><StatusTag s={r.status} />{!r.has_area && open && <span className="tag">Area not set</span>}</div>
            <div className="display" style={{ fontSize: 26, wordBreak: 'break-word' }}>{r.name}</div>
          </div>
          <div className="mono display" style={{ fontSize: 26, textAlign: 'right', lineHeight: 1 }}>
            {r.players}<span className="muted" style={{ fontSize: 16 }}>/{r.max}</span>
            <div className="eyebrow" style={{ fontSize: 10, marginTop: 2 }}>players</div>
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--surface3)', margin: '12px 0' }}>
          <div style={{ width: `${Math.min(100, (r.players / r.max) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <div className="row between">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <Avatar src={r.admin.selfie} name={r.admin.username} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>@{r.admin.username}</div>
              <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>{r.admin.college} · {timeAgo(r.created_at)} ago</div>
            </div>
          </div>
          <Button size="sm" disabled={!can} loading={busy} onClick={onEnter}>{label}</Button>
        </div>
      </div>
    </div>
  );
}

function PrivateJoin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await rpc<string>('request_join', { p_code: code.trim().toUpperCase(), p_password: pw });
      haptic.ok(); onClose(); nav(`/room/${id}`);
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Private room">
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <Field label="Room ID" value={code} autoCapitalize="characters" maxLength={6} placeholder="6 characters"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          style={{ letterSpacing: '0.4em', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' }} />
        <Field label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button size="lg" block arrow loading={busy} disabled={code.length !== 6 || pw.length < 4} type="submit">Request to join</Button>
        <p className="muted center" style={{ fontSize: 13, margin: 0 }}>The admin still has to accept you.</p>
      </form>
    </Modal>
  );
}

/* ---------- HOST ---------- */
function HostTab() {
  const nav = useNavigate();
  const toast = useToast();
  const { profile, refresh } = useSession();
  const [name, setName] = useState('');
  const [pub, setPub] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [applying, setApplying] = useState(false);
  const org = !!profile?.is_organiser;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await rpc<string>('create_room', { p_name: name.trim(), p_public: pub, p_password: pub ? null : pw });
      haptic.ok(); nav(`/room/${id}`);
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function apply() {
    setApplying(true);
    try { await rpc('apply_organiser', { p_note: note }); await refresh(); toast('Application sent'); }
    catch (e: any) { toast(e.message, true); } finally { setApplying(false); }
  }

  return (
    <div className="screen" style={{ gap: 24 }}>
      <header>
        <div className="eyebrow">Host</div>
        <h1 className="display" style={{ fontSize: 48, margin: '6px 0 4px' }}>Open a room</h1>
        <p className="muted" style={{ margin: 0 }}>You run the match as admin: draw the boundary, set the rules, pick roles, start the hunt. Admins spectate, they don't play.</p>
      </header>

      <form className="stack" style={{ gap: 18 }} onSubmit={create}>
        <Field label="Room name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Hunt" />
        <div className="field">
          <label>Type</label>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={`chip ${!pub ? 'on' : ''}`} style={{ flex: 1, gap: 8 }} onClick={() => setPub(false)}><IconLock s={16} /> Private</button>
            <button type="button" className={`chip ${pub ? 'on' : ''}`} style={{ flex: 1, gap: 8 }} disabled={!org} onClick={() => org && setPub(true)}><IconGlobe s={16} /> Public</button>
          </div>
          <div className="field-hint">{pub ? 'Listed on everyone\'s Rooms tab. Players tap Enter and you accept them.' : 'Hidden. Players need the room ID and password, then you accept them.'}</div>
        </div>
        {!pub && <Field label="Room password" type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 4 characters" hint="Share it with your players along with the room ID." />}
        <Button size="lg" block arrow loading={busy} disabled={name.trim().length < 2 || (!pub && pw.length < 4)} type="submit">Create room</Button>
      </form>

      {!org && (
        <div className="frame soft cut">
          <div className="inner cut" style={{ padding: 18, background: 'var(--bg2)' }}>
            <div className="eyebrow">Public rooms</div>
            <div className="display" style={{ fontSize: 24, margin: '6px 0' }}>Become an organiser</div>
            {profile?.application === 'pending' ? (
              <p className="muted" style={{ margin: 0 }}>Your application is with the TAG owner. You'll be able to host public rooms once it's approved.</p>
            ) : (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>{profile?.application === 'rejected' ? 'Your last application was not approved. You can apply again.' : 'Organisers can host rooms anyone can find. Tell the owner who you are and what you plan to run.'}</p>
                <textarea className="input cut" style={{ ['--c' as any]: '7px' }} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I run the BEC Creative Spectrum games night, ~40 players weekly." />
                <Button kind="ghost" loading={applying} disabled={note.trim().length < 10} onClick={apply}>Apply</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
