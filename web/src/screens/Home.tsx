import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Avatar, Button, Empty, Field, Segmented, IconGlobe, IconHost, IconLock, IconProfile, IconRefresh, IconRooms, Logo, Modal, Section, Slash, useInterval, useToast } from '../components/ui';
import { rpc } from '../lib/supabase';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { haptic } from '../lib/feel';
import { timeAgo } from '../lib/clock';
import { ArtPanel, ChaseScene } from '../components/Brut';
import { resolvedDay, useAppearance } from '../lib/theme';
import { HowItWorks } from '../components/Diagrams';
import Profile from './Profile';
import Training from './Training';

export default function Home() {
  useTheme('neutral');
  return (
    <div style={{ minHeight: '100%', paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)', position: 'relative' }}>
      <Routes>
        <Route index element={<Slash k="rooms"><RoomsTab /></Slash>} />
        <Route path="host" element={<Slash k="host"><HostTab /></Slash>} />
        <Route path="profile/*" element={<Slash k="profile"><Profile /></Slash>} />
        <Route path="train" element={<Slash k="train"><Training /></Slash>} />
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
    <nav aria-label="Main" style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 12px)', zIndex: 100, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 96px)', gap: 4, padding: 5, borderRadius: 12,
        background: 'color-mix(in srgb, var(--surface) 96%, transparent)', boxShadow: '0 0 0 1px var(--line2), 0 20px 40px -18px rgba(0,0,0,.7)' }}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} onClick={() => haptic.tap()}
            style={({ isActive }) => ({ position: 'relative', height: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              color: isActive ? 'var(--bg)' : 'var(--muted)', textDecoration: 'none', transition: 'color .25s var(--ease-out)', borderRadius: 8 })}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tabbar" transition={{ type: 'spring', damping: 30, stiffness: 420 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'var(--text)' }} />}
                <span style={{ position: 'relative' }}>
                  {t.icon}
                  {t.badge > 0 && <span style={{ position: 'absolute', top: -5, right: -9, minWidth: 17, height: 17, padding: '0 5px', borderRadius: 4, background: 'var(--danger)', color: '#fff', fontSize: 10.5, fontWeight: 850, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px #0b0b0c' }}>{t.badge}</span>}
                </span>
                <span style={{ position: 'relative', fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</span>
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
  const [how, setHow] = useState(false);

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
    <div className="screen" style={{ gap: 28 }}>
      <header className="row between" style={{ position: 'relative', zIndex: 2 }}>
        <Logo size={30} />
        <div className="row" style={{ gap: 10 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setHow(true)} aria-label="How TAG works" style={{ width: 42, height: 42, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--surface)', boxShadow: '0 0 0 1px var(--line2)', fontWeight: 900, fontSize: 18, color: 'var(--text)' }}>?</motion.button>
          <button onClick={() => nav('/home/profile')} aria-label="Your profile" style={{ borderRadius: 8 }}><Avatar src={profile?.selfie_path} name={profile?.username} size={40} /></button>
        </div>
      </header>

      {/* cinematic hero: your live game, or the invitation to start one */}
      <Hero room={active[0]} name={profile?.full_name?.split(' ')[0] || profile?.username || ''} open={(rooms ?? []).filter((r) => r.status === 'lobby').length}
        onOpen={(id) => nav(`/room/${id}`)} onHost={() => nav('/home/host')} onJoin={() => setPrivOpen(true)} />

      {active.length > 1 && (
        <Section title="Your other rooms">
          {active.slice(1).map((r) => (
            <motion.button whileTap={{ scale: 0.98 }} key={r.id} onClick={() => nav(`/room/${r.id}`)} className="card row" style={{ textAlign: 'left', padding: '16px 16px 16px 18px', gap: 14, position: 'relative', overflow: 'hidden' }}>
              <div className="grow">
                <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.015em' }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
                  {r.is_admin ? 'You’re the admin' : r.my_status === 'pending' ? 'Waiting for the admin to accept you' : 'You’re in'}, {r.players} {r.players === 1 ? 'player' : 'players'}
                </div>
              </div>
              <StatusTag s={r.status} />
              <Chevron />
            </motion.button>
          ))}
        </Section>
      )}

      {invites.length > 0 && (
        <Section title="Invites">
          {invites.map((i) => (
            <div key={i.id} className="card card-pad row" style={{ gap: 12, background: 'var(--surface2)' }}>
              <Avatar src={i.from.selfie} name={i.from.username} size={42} />
              <div className="grow">
                <div style={{ fontSize: 16.5, fontWeight: 650 }}>{i.room}</div>
                <div className="muted" style={{ fontSize: 13 }}>@{i.from.username} invited you, {i.players} in</div>
              </div>
              <Button size="sm" loading={joining === i.room_id} onClick={() => enter(i.room_id)}>Join</Button>
              <button className="icon-btn muted" aria-label="Dismiss" onClick={async () => { await rpc('dismiss_invite', { p_id: i.id }).catch(() => {}); load(); refresh(); }}>✕</button>
            </div>
          ))}
        </Section>
      )}

      <motion.button whileTap={{ scale: 0.98 }} onClick={() => setPrivOpen(true)} className="card row" style={{ textAlign: 'left', padding: 16, gap: 14 }}>
        <div style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', background: 'var(--police)', color: '#000', borderRadius: 8, boxShadow: '0 0 0 2.5px #0b0b0c', rotate: '-4deg' }}><IconLock s={21} /></div>
        <div className="grow">
          <div style={{ fontSize: 16.5, fontWeight: 650 }}>Join a private room</div>
          <div className="muted" style={{ fontSize: 13.5 }}>Enter the room ID and password from your admin.</div>
        </div>
        <Chevron />
      </motion.button>

      <motion.button whileTap={{ scale: 0.98 }} onClick={() => nav('/home/train')} className="card row" style={{ textAlign: 'left', padding: 16, gap: 14 }}>
        <div style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#0b0b0c', borderRadius: 8, boxShadow: '0 0 0 2.5px #0b0b0c', rotate: '3deg', fontWeight: 900, fontSize: 20 }}>20</div>
        <div className="grow">
          <div style={{ fontSize: 16.5, fontWeight: 650 }}>Training ground</div>
          <div className="muted" style={{ fontSize: 13.5 }}>Learn the 20 task rules before your next hunt.</div>
        </div>
        <Chevron />
      </motion.button>

      <Section title="Public rooms"
        right={<button className="icon-btn muted" aria-label="Refresh" style={{ width: 32, height: 32, transform: spin ? 'rotate(360deg)' : 'none', transition: 'transform .6s' }}
          onClick={async () => { setSpin(true); await load(); setTimeout(() => setSpin(false), 600); }}><IconRefresh s={18} /></button>}>
        {rooms === null ? (
          [0, 1, 2].map((i) => <div key={i} className="card skeleton" style={{ height: 138 }} />)
        ) : rooms.length === 0 ? (
          <Empty title="No public rooms yet" body="Approved organisers host public games here. Make your own private room from the Host tab." />
        ) : rooms.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
            <RoomCard r={r} busy={joining === r.id} onEnter={() => (r.is_admin || r.my_status === 'accepted' || r.my_status === 'pending' ? nav(`/room/${r.id}`) : enter(r.id))} />
          </motion.div>
        ))}
      </Section>

      <PrivateJoin open={privOpen} onClose={() => setPrivOpen(false)} />
      <Modal open={how} onClose={() => setHow(false)} title="How TAG works"><HowItWorks onClose={() => setHow(false)} /></Modal>
    </div>
  );
}

/* ---------- HERO ---------- */
function Hero({ room, name, open, onOpen, onHost, onJoin }: { room?: MyRoom; name: string; open: number; onOpen: (id: string) => void; onHost: () => void; onJoin: () => void }) {
  const ease = [0.2, 0.9, 0.25, 1] as const;
  const live = room && room.status !== 'lobby' && room.status !== 'ended';
  const day = resolvedDay(useAppearance());
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div aria-hidden style={{ height: 'clamp(150px, 26vh, 210px)', borderBottom: '1px solid var(--line2)', background: day ? '#e9dccb' : '#141416' }}><ChaseScene height="100%" seed={room ? room.name.length : 2} day={day} /></div>
      <div style={{ padding: '20px 20px 22px' }}>
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ color: 'var(--tint-text)' }}>{greeting()}, {name}</span>
          {room && <StatusTag s={room.status} />}
        </div>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 12.5vw, 64px)', margin: 0, wordBreak: 'break-word' }}>
          {room ? room.name : <>Tonight’s hunt <span className="text-flare">starts with you.</span></>}
        </h1>
        <p style={{ margin: '12px 0 20px', color: 'var(--muted)', fontSize: 15.5, maxWidth: 380 }}>
          {room ? `${room.is_admin ? 'You’re the admin' : room.my_status === 'pending' ? 'Waiting for the admin to let you in' : 'You’re in'} · ${room.players} ${room.players === 1 ? 'player' : 'players'}${live ? ' · match in progress' : ''}`
            : open > 0 ? `${open} public ${open === 1 ? 'room is' : 'rooms are'} taking players right now.` : 'Host a room for your friends, or join one with its room ID.'}
        </p>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {room ? (
            <Button kind="hot" size="lg" className="grow" onClick={() => onOpen(room.id)}>{live ? 'Back to the match' : 'Open room'}</Button>
          ) : (<>
            <Button kind="hot" size="lg" className="grow" onClick={onHost}>Host a game</Button>
            <Button kind="ghost" size="lg" className="grow" onClick={onJoin}>Join with ID</Button>
          </>)}
        </div>
      </div>
    </motion.section>
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
  const label = r.is_admin ? 'Manage' : r.my_status === 'accepted' ? 'Open' : r.my_status === 'pending' ? 'Pending' : full ? 'Full' : open ? 'Enter' : 'In progress';
  const can = r.is_admin || r.my_status === 'accepted' || r.my_status === 'pending' || (open && !full);
  const pct = Math.min(100, (r.players / r.max) * 100);
  return (
    <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="grow">
          <div className="row" style={{ gap: 6, marginBottom: 8 }}><StatusTag s={r.status} />{!r.has_area && open && <span className="tag">No play area yet</span>}</div>
          <div className="display" style={{ fontSize: 23, wordBreak: 'break-word', fontWeight: 680 }}>{r.name}</div>
        </div>
        <Ring pct={pct} label={`${r.players}`} sub={`of ${r.max}`} />
      </div>
      <div className="row between" style={{ marginTop: 16, gap: 12 }}>
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <Avatar src={r.admin.selfie} name={r.admin.username} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 650 }}>@{r.admin.username}</div>
            <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>Opened {timeAgo(r.created_at)} ago</div>
          </div>
        </div>
        <Button size="sm" kind={open && !r.is_admin ? 'primary' : 'quiet'} disabled={!can} loading={busy} onClick={onEnter} style={{ minWidth: 86 }}>{label}</Button>
      </div>
    </div>
  );
}

/** player count as a small dial */
function Ring({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const R = 25, C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: 60, height: 60, flex: 'none' }} aria-label={`${label} ${sub} players`}>
      <svg width="60" height="60" viewBox="0 0 60 60" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="30" cy="30" r={R} fill="none" stroke="var(--surface3)" strokeWidth="4" />
        <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#c9a227" /><stop offset="100%" stopColor="#b23a2b" /></linearGradient></defs>
        <motion.circle cx="30" cy="30" r={R} fill="none" stroke="url(#ringg)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct / 100) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1 }}>
        <div><div className="display mono" style={{ fontSize: 18 }}>{label}</div><div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div></div>
      </div>
    </div>
  );
}

function Chevron() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--faint)', flex: 'none' }} aria-hidden><path d="M9 5l7 7-7 7" /></svg>;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Out late' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
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
          style={{ letterSpacing: '0.35em', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' }} />
        <Field label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button size="lg" block loading={busy} disabled={code.length !== 6 || pw.length < 4} type="submit">Request to join</Button>
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
      <header style={{ position: 'relative', zIndex: 1, paddingTop: 12 }}>
        <h1 className="display" style={{ fontSize: 54, margin: '18px 0 14px' }}>Run the<br /><span className="text-flare" style={{ paddingRight: 6 }}>whole game.</span></h1>
        <p className="muted" style={{ margin: 0, maxWidth: 400 }}>As admin you draw the play area, set the rules and assign roles, then watch the whole map while everyone else plays.</p>
        <div aria-hidden style={{ marginTop: 20 }}><ArtPanel height={150} seed={21} day={resolvedDay(useAppearance())} /></div>
      </header>

      <form className="stack" style={{ gap: 18 }} onSubmit={create}>
        <Field label="Room name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Hunt" />
        <div className="field">
          <label>Type</label>
          <Segmented value={pub ? 'pub' : 'priv'} onChange={(v) => (v === 'priv' ? setPub(false) : org && setPub(true))}
            options={[{ v: 'priv', label: <><IconLock s={16} /> Private</> }, { v: 'pub', label: <><IconGlobe s={16} /> Public</>, disabled: !org }]} />
          <div className="field-hint">{pub ? 'Listed on everyone\'s Rooms tab. Players tap Enter and you accept them.' : 'Hidden. Players need the room ID and password, then you accept them.'}</div>
        </div>
        {!pub && <Field label="Room password" type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 4 characters" hint="Share it with your players along with the room ID." />}
        <Button kind="hot" size="lg" block loading={busy} disabled={name.trim().length < 2 || (!pub && pw.length < 4)} type="submit">Create room</Button>
      </form>

      {!org && (
        <div className="card" style={{ background: 'var(--bg2)' }}>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 650, margin: '0 0 6px' }}>Want to host public games?</div>
            {profile?.application === 'pending' ? (
              <p className="muted" style={{ margin: 0 }}>Your application is with the TAG owner. You'll be able to host public rooms once it's approved.</p>
            ) : (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>{profile?.application === 'rejected' ? 'Your last application was not approved. You can apply again.' : 'Organisers can host rooms anyone can find. Tell the owner who you are and what you plan to run.'}</p>
                <textarea className="input" style={{ background: 'var(--surface)', boxShadow: '0 0 0 2.5px var(--line2)', borderRadius: 10 }} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I run the BEC Creative Spectrum games night, ~40 players weekly." />
                <Button kind="ghost" loading={applying} disabled={note.trim().length < 10} onClick={apply}>Apply</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
