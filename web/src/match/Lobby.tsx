import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PhaseTimeline } from '../components/Diagrams';
import { NightCampus } from '../components/Scenes';
import { Segmented, Avatar, Back, Button, IconCopy, IconMap, IconPhone, IconPlus, IconShare, IconUndo, Modal, Section, Slash, useToast } from '../components/ui';
import { rpc } from '../lib/supabase';
import { useSession } from '../lib/session';
import { haptic } from '../lib/feel';
import { EVENTS, EventBadge, type EventKey } from '../components/Events';
import { titleLabel } from '../lib/identity';
import { polyAreaM2, type LngLat } from '../lib/geo';
import { fmtDist } from '../lib/clock';
import { MapView, type MapHandle } from './MapView';
import { Chat } from './Comms';
import type { Member, RoomState, Settings } from '../lib/types';

const YEAR = ['', '1st', '2nd', '3rd', '4th'];

function RoomHeader({ s, onLeave, leaveLabel = 'Leave' }: { s: RoomState; onLeave?: () => void; leaveLabel?: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const code = s.room.code;
  async function share() {
    const text = `Join my TAG room "${s.room.name}"${s.room.is_public ? '' : ` · Room ID ${code}`}\n${location.origin}`;
    try { if (navigator.share) await navigator.share({ title: 'TAG', text }); else { await navigator.clipboard.writeText(text); toast('Copied'); } } catch { /* cancelled */ }
  }
  return (
    <header style={{ marginBottom: 22, position: 'relative' }}>
      <div className="row between" style={{ marginLeft: -10 }}>
        <button className="icon-btn" aria-label="Back to rooms" onClick={() => nav('/home')}><Back /></button>
        <div className="row" style={{ gap: 6 }}>
          <span className="tag ok"><span className="dot pulse" /> Lobby</span>
          <EventBadge event={s.room.settings.event} />
          <span className="tag">{s.room.is_public ? 'Public' : 'Private'}</span>
        </div>
      </div>
      <motion.h1 className="display" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ fontSize: 'clamp(38px, 12vw, 52px)', margin: '14px 0 18px', wordBreak: 'break-word' }}>{s.room.name}</motion.h1>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {code && !s.room.is_public && (
          <motion.button whileTap={{ scale: 0.96 }} className="row" style={{ gap: 10, padding: '8px 12px 8px 14px', background: 'var(--police)', color: '#14110f', borderRadius: 8, boxShadow: '0 0 0 2.5px var(--edge), 3px 3px 0 2.5px var(--edge)' }}
            onClick={async () => { await navigator.clipboard?.writeText(code).catch(() => {}); haptic.tap(); toast('Room ID copied'); }}>
            <span style={{ fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Room ID</span>
            <span className="mono" style={{ fontSize: 21, fontWeight: 850, letterSpacing: '0.08em' }}>{code}</span>
            <IconCopy s={16} />
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.96 }} className="row" style={{ gap: 8, padding: '0 14px', minHeight: 44, background: 'var(--surface)', borderRadius: 8, fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', boxShadow: '0 0 0 2.5px var(--edge), 3px 3px 0 2.5px var(--edge)' }} onClick={share}><IconShare s={16} />Share</motion.button>
        {onLeave && <button className="muted" style={{ marginLeft: 'auto', fontSize: 13 }} onClick={onLeave}>{leaveLabel}</button>}
      </div>
    </header>
  );
}

function MapPreview({ s, height = 220, themeKey }: { s: RoomState; height?: number; themeKey: string }) {
  return (
    <div className="frame soft cut" style={{ height, position: 'relative' }}>
      <div className="inner cut" style={{ position: 'relative', overflow: 'hidden' }}>
        <MapView themeKey={themeKey} boundary={s.room.boundary} nogo={s.room.nogo} interactive={false} />
        {!s.room.boundary && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--scrim)' }}>
            <div className="center"><IconMap /><div className="display" style={{ fontSize: 18, marginTop: 6 }}>Play area not drawn yet</div></div>
          </div>
        )}
        <span className="tag" style={{ position: 'absolute', left: 10, top: 10, background: 'var(--bg)' }}>Play area</span>
      </div>
    </div>
  );
}

function PlayerGrid({ members }: { members: Member[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 10 }}>
      {members.map((m, i) => (
        <motion.div key={m.id} className="center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
          <Avatar src={m.selfie} name={m.username} size={64} className="" />
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{m.username}</div>
          <div className="muted" style={{ fontSize: 10 }}>{m.branch} · {YEAR[m.year]}</div>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- WAITING ---------- */
export function Waiting({ s }: { s: RoomState }) {
  const nav = useNavigate();
  const toast = useToast();
  async function cancel() { try { await rpc('leave_room', { p_room: s.room.id }); nav('/home'); } catch (e: any) { toast(e.message, true); } }
  return (
    <Slash>
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 22, minHeight: '100dvh', paddingBottom: 190, isolation: 'isolate' }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: -1 }}><NightCampus height={170} seed={11} /></div>
        <div style={{ position: 'relative', width: 220, height: 220 }}>
          {[0, 1, 2].map((i) => (
            <motion.div key={i} style={{ position: 'absolute', inset: 0, border: '3px solid var(--flare)', borderRadius: 12 }}
              initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 1, opacity: 0 }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }} />
          ))}
          
          <div style={{ position: 'absolute', inset: 70, display: 'grid', placeItems: 'center' }}><Avatar src={s.room.admin.selfie} name={s.room.admin.username} size={80} /></div>
        </div>
        <div>
          <div className="eyebrow">Request sent</div>
          <h1 className="display" style={{ fontSize: 38, margin: '8px 0' }}>Waiting for @{s.room.admin.username}</h1>
          <p className="muted" style={{ margin: 0 }}>You'll drop into <b style={{ color: 'var(--text)' }}>{s.room.name}</b> as soon as the admin accepts.</p>
        </div>
        <Button kind="ghost" onClick={cancel}>Cancel request</Button>
      </div>
    </Slash>
  );
}

/* ---------- NOT IN ROOM ---------- */
export function NotIn({ s }: { s: RoomState }) {
  const nav = useNavigate();
  const toast = useToast();
  const st = s.me?.status;
  const msg = st === 'rejected' ? 'The admin declined your request, or the match started without you.' : st === 'removed' ? 'The admin removed you from this room.'
    : st === 'left' ? 'You left this room.' : s.room.status === 'lobby' ? 'You are not in this room yet.' : 'This match is already underway.';
  const canJoin = s.room.status === 'lobby' && st !== 'removed' && (s.room.is_public || st === 'left' || st === 'rejected');
  return (
    <div className="screen" style={{ justifyContent: 'center', textAlign: 'center', gap: 16, minHeight: '100dvh', paddingBottom: 190, isolation: 'isolate' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: -1 }}><NightCampus height={170} seed={14} /></div>
      <h1 className="display" style={{ fontSize: 40, margin: 0 }}>{s.room.name}</h1>
      <p className="muted">{msg}</p>
      {canJoin && s.room.is_public && <Button onClick={async () => { try { await rpc('request_join', { p_room: s.room.id }); } catch (e: any) { toast(e.message, true); } }}>Request to join</Button>}
      <Button kind="ghost" onClick={() => nav('/home')}>Back to rooms</Button>
    </div>
  );
}

/* ---------- INVITE FRIENDS ---------- */
function InviteFriends({ roomId, open, onClose, members }: { roomId: string; open: boolean; onClose: () => void; members: Member[] }) {
  const toast = useToast();
  const [friends, setFriends] = useState<any[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) rpc<any[]>('my_friends').then((f) => setFriends(f.filter((x) => x.status === 'accepted'))).catch(() => {}); }, [open]);
  const inRoom = new Set(members.map((m) => m.id));
  return (
    <Modal open={open} onClose={onClose} title="Invite friends">
      {friends.length === 0 ? <p className="muted">No friends yet. Add them from your Profile tab.</p> : friends.map((f) => (
        <div key={f.id} className="list-row">
          <Avatar src={f.selfie} name={f.username} size={38} />
          <div className="grow"><b>@{f.username}</b><div className="muted" style={{ fontSize: 12 }}>{f.college}</div></div>
          {inRoom.has(f.id) ? <span className="tag ok">In room</span> : sent.has(f.id) ? <span className="tag">Invited</span> :
            <Button size="sm" onClick={async () => { try { await rpc('invite_friend', { p_room: roomId, p_user: f.id }); setSent(new Set([...sent, f.id])); } catch (e: any) { toast(e.message, true); } }}>Invite</Button>}
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>Invited friends skip the password, but the admin still accepts them.</p>
    </Modal>
  );
}

/* ---------- PLAYER LOBBY ---------- */
export function PlayerLobby({ s, themeKey }: { s: RoomState; themeKey: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { profile } = useSession();
  const [inv, setInv] = useState(false);
  const players = s.members.filter((m) => m.status === 'accepted');
  async function leave() { if (!confirm('Leave this room?')) return; try { await rpc('leave_room', { p_room: s.room.id }); nav('/home'); } catch (e: any) { toast(e.message, true); } }
  return (
    <Slash>
      <div className="screen" style={{ gap: 24 }}>
        <RoomHeader s={s} onLeave={leave} />
        <div className="frame cut" style={{ background: 'var(--accent)' }}>
          <div className="inner cut row" style={{ padding: 14, gap: 12 }}>
            <Avatar src={s.room.admin.selfie} name={s.room.admin.username} size={44} />
            <div className="grow">
              <div className="display" style={{ fontSize: 19 }}>Standing by</div>
              <div className="muted" style={{ fontSize: 13 }}>@{s.room.admin.username} assigns roles in secret and starts the match. You'll find out if you're a runner or hunter the moment it begins.</div>
            </div>
          </div>
        </div>
        <MapPreview s={s} themeKey={themeKey} />
        <RulesSummary st={s.room.settings} />
        <Section title={`Squad · ${players.length}/${s.room.max_players}`} right={<button className="tag" style={{ padding: '6px 10px' }} onClick={() => setInv(true)}>+ Invite</button>}>
          <PlayerGrid members={players} />
        </Section>
        <Section title="Lobby chat"><Chat roomId={s.room.id} channel="lobby" members={[...s.members, { ...s.room.admin, college: '', branch: '', year: 0 } as any]} meId={profile!.id} height={240} /></Section>
      </div>
      <InviteFriends roomId={s.room.id} open={inv} onClose={() => setInv(false)} members={s.members} />
    </Slash>
  );
}

function RulesSummary({ st }: { st: Settings }) {
  return <PhaseTimeline st={st} />;
}

/* ---------- ADMIN LOBBY ---------- */
export function AdminLobby({ s, refresh, themeKey }: { s: RoomState; refresh: () => void; themeKey: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { profile } = useSession();
  const [tab, setTab] = useState<'players' | 'area' | 'rules' | 'chat'>('players');
  const [busy, setBusy] = useState(false);
  const [inv, setInv] = useState(false);
  const accepted = s.members.filter((m) => m.status === 'accepted');
  const pending = s.members.filter((m) => m.status === 'pending');
  const nh = accepted.filter((m) => m.role === 'hunter').length, nr = accepted.filter((m) => m.role === 'runner').length;
  const unassigned = accepted.filter((m) => !m.role).length;
  const checks = [
    { ok: !!s.room.boundary, t: 'Play area drawn', go: 'area' as const },
    { ok: nh >= 1 && nr >= 1, t: `${nh} hunter${nh === 1 ? '' : 's'}, ${nr} runner${nr === 1 ? '' : 's'}`, go: 'players' as const },
    { ok: unassigned === 0 && accepted.length >= 2, t: unassigned ? `${unassigned} without a role` : accepted.length < 2 ? 'Need at least 2 players' : 'Every player has a role', go: 'players' as const },
  ];
  const ready = checks.every((c) => c.ok);

  async function start() {
    if (!confirm(`Start the match? ${pending.length ? `${pending.length} pending request(s) will be declined. ` : ''}Roles go out to everyone and the hide timer begins.`)) return;
    setBusy(true);
    try { await rpc('start_match', { p_room: s.room.id }); haptic.big(); refresh(); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function close() {
    if (!confirm('Close this room? Everyone will be sent back.')) return;
    try { await rpc('end_match', { p_room: s.room.id }); nav('/home/host'); } catch (e: any) { toast(e.message, true); }
  }

  const tabs = [
    { k: 'players' as const, t: 'Players', n: pending.length },
    { k: 'area' as const, t: 'Area', n: s.room.boundary ? 0 : 1 },
    { k: 'rules' as const, t: 'Rules', n: 0 },
    { k: 'chat' as const, t: 'Chat', n: 0 },
  ];
  return (
    <Slash>
      <div className="screen" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 140px)' }}>
        <RoomHeader s={s} onLeave={close} leaveLabel="Close room" />
        <div style={{ margin: '4px 0 20px', position: 'sticky', top: 'calc(env(safe-area-inset-top) + 8px)', zIndex: 5, borderRadius: 12 }}>
          <Segmented value={tab} onChange={(v) => setTab(v)}
            options={tabs.map((t) => ({ v: t.k, label: <>{t.t}{t.n > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{t.n}</span>}</> }))} />
        </div>
        {tab === 'players' && <Roster s={s} refresh={refresh} onInvite={() => setInv(true)} />}
        {tab === 'area' && <AreaEditor s={s} refresh={refresh} themeKey={themeKey} />}
        {tab === 'rules' && <RulesEditor s={s} refresh={refresh} />}
        {tab === 'chat' && <Chat roomId={s.room.id} channel="lobby" members={[...s.members, { id: profile!.id, username: profile!.username, selfie: profile!.selfie_path } as any]} meId={profile!.id} height="50vh" />}
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg) 92%, transparent)', borderTop: '1px solid var(--line)', padding: '12px 20px calc(env(safe-area-inset-bottom) + 12px)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="row scroll-x" style={{ gap: 6, marginBottom: 10 }}>
            {checks.map((c) => (
              <button key={c.t} onClick={() => setTab(c.go)} className={`tag ${c.ok ? 'ok' : 'bad'}`} style={{ whiteSpace: 'nowrap', padding: '5px 9px' }}>{c.ok ? '✓' : '!'} {c.t}</button>
            ))}
          </div>
          <Button kind="hot" size="lg" block arrow loading={busy} disabled={!ready} onClick={start}>Start match</Button>
        </div>
      </div>
      <InviteFriends roomId={s.room.id} open={inv} onClose={() => setInv(false)} members={s.members} />
    </Slash>
  );
}

function Roster({ s, refresh, onInvite }: { s: RoomState; refresh: () => void; onInvite: () => void }) {
  const toast = useToast();
  const accepted = s.members.filter((m) => m.status === 'accepted');
  const pending = s.members.filter((m) => m.status === 'pending');
  const [hunters, setHunters] = useState(() => Math.max(1, Math.round(accepted.length / 5)));
  const call = async (fn: string, args: any) => { try { await rpc(fn, { p_room: s.room.id, ...args }); haptic.tap(); refresh(); } catch (e: any) { toast(e.message, true); } };
  useEffect(() => { setHunters((h) => Math.min(Math.max(1, h), Math.max(1, accepted.length - 1))); }, [accepted.length]);
  return (
    <div className="stack" style={{ gap: 26 }}>
      <Section title={`Requests · ${pending.length}`} right={pending.length > 1 && <button className="tag live" style={{ padding: '6px 10px' }} onClick={() => call('accept_all', {})}>Accept all</button>}>
        {pending.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>No one waiting. {s.room.is_public ? 'Your room is listed publicly.' : 'Share the room ID and password.'}</p> : (
          <div className="card" style={{ padding: '0 14px' }}>
            {pending.map((m) => (
              <div key={m.id} className="list-row">
                <Avatar src={m.selfie} name={m.username} size={44} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{m.username} {m.invite && <span className="tag" style={{ marginLeft: 4 }}>Invited</span>}</div>
                  <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name} · {m.branch} {YEAR[m.year]} · {m.college}</div>
                </div>
                <Button size="sm" onClick={() => call('decide_request', { p_user: m.id, p_accept: true })}>Accept</Button>
                <Button size="sm" kind="quiet" onClick={() => call('decide_request', { p_user: m.id, p_accept: false })}>✕</Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`In the room · ${accepted.length}/${s.room.max_players}`} right={<button className="tag" style={{ padding: '6px 10px' }} onClick={onInvite}>+ Invite</button>}>
        {accepted.length >= 2 && (
          <div className="frame soft cut">
            <div className="inner cut stack" style={{ padding: 12, gap: 10 }}>
              <div><div className="display" style={{ fontSize: 17 }}>Random roles</div><div className="muted" style={{ fontSize: 12 }}>Players won't see their role until you start.</div></div>
              <div className="row" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 0 }}>
                  <button className="chip" style={{ minHeight: 40, padding: '0 14px' }} aria-label="Fewer hunters" onClick={() => setHunters(Math.max(1, hunters - 1))}>−</button>
                  <div className="display mono center" style={{ width: 96, fontSize: 17 }}>{hunters} <span style={{ fontSize: 11 }} className="muted">hunter{hunters === 1 ? '' : 's'}</span></div>
                  <button className="chip" style={{ minHeight: 40, padding: '0 14px' }} aria-label="More hunters" onClick={() => setHunters(Math.min(accepted.length - 1, hunters + 1))}>+</button>
                </div>
                <Button size="sm" className="grow" style={{ minHeight: 40 }} onClick={() => call('shuffle_roles', { p_hunters: hunters })}>Shuffle roles</Button>
              </div>
            </div>
          </div>
        )}
        {accepted.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>Accepted players appear here.</p> : (
          <div className="card" style={{ padding: '0 14px' }}>
            {accepted.map((m) => (
              <div key={m.id} className="list-row">
                <Avatar src={m.selfie} name={m.username} size={40} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>@{m.username}{titleLabel(m.title) && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', marginLeft: 6 }}>{titleLabel(m.title)}</span>}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.branch} · {YEAR[m.year]}</div>
                </div>
                {m.phone && <a className="icon-btn muted" href={`tel:${m.phone}`} aria-label={`Call ${m.username}`} style={{ width: 34 }}><IconPhone s={18} /></a>}
                <div className="row" style={{ gap: 4 }}>
                  {(['runner', 'hunter'] as const).map((r) => (
                    <button key={r} className={`chip`} onClick={() => call('set_role', { p_user: m.id, p_role: m.role === r ? null : r })}
                      style={{ minHeight: 34, padding: '0 10px', fontSize: 12, background: m.role === r ? (r === 'runner' ? 'var(--runner)' : 'var(--hunter)') : 'var(--surface2)', color: m.role === r ? (r === 'runner' ? '#170700' : '#000') : 'var(--muted)' }}>
                      {r === 'runner' ? 'Run' : 'Hunt'}
                    </button>
                  ))}
                </div>
                <button className="muted" aria-label={`Remove ${m.username}`} style={{ padding: '0 4px' }} onClick={() => confirm(`Remove @${m.username}?`) && call('remove_member', { p_user: m.id })}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------- AREA EDITOR ---------- */
function AreaEditor({ s, refresh, themeKey }: { s: RoomState; refresh: () => void; themeKey: string }) {
  const toast = useToast();
  const mapRef = useRef<MapHandle>(null);
  const [boundary, setBoundary] = useState<LngLat[]>(s.room.boundary || []);
  const [nogo, setNogo] = useState<LngLat[][]>(s.room.nogo || []);
  const [mode, setMode] = useState<'boundary' | 'nogo'>('boundary');
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const dirty = JSON.stringify(boundary) !== JSON.stringify(s.room.boundary || []) || JSON.stringify(nogo) !== JSON.stringify(s.room.nogo || []);

  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => {
      const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      setMe(f); mapRef.current?.flyTo(f.lat, f.lng, 17);
    }, () => toast('Location blocked. Allow it in your browser settings.', true), { enableHighAccuracy: true, timeout: 15000 });
  }
  useEffect(() => { if (!s.room.boundary) locate(); }, []);

  function tap(p: LngLat) {
    haptic.tap();
    if (mode === 'boundary') setBoundary((b) => (b.length >= 60 ? b : [...b, p]));
    else setDraft((d) => (d.length >= 60 ? d : [...d, p]));
  }
  function undo() { if (mode === 'boundary') setBoundary((b) => b.slice(0, -1)); else setDraft((d) => d.slice(0, -1)); }
  function addNogo() { if (draft.length < 3) return; setNogo((n) => [...n, draft]); setDraft([]); haptic.ok(); }
  async function save() {
    if (boundary.length < 3) { toast('Tap at least 3 points for the boundary', true); return; }
    setSaving(true);
    try { await rpc('set_area', { p_room: s.room.id, p_boundary: boundary, p_nogo: nogo }); haptic.ok(); toast('Play area saved'); refresh(); }
    catch (e: any) { toast(e.message, true); } finally { setSaving(false); }
  }
  const area = polyAreaM2(boundary);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className={`chip ${mode === 'boundary' ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => { setMode('boundary'); setDraft([]); }}>Boundary</button>
        <button className={`chip ${mode === 'nogo' ? 'on' : ''}`} style={{ flex: 1, ...(mode === 'nogo' ? { background: 'var(--danger)', color: '#fff' } : {}) }} onClick={() => setMode('nogo')}>No-go zone</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {mode === 'boundary' ? 'Tap the map corner by corner to outline where the game is played.' : 'Tap points around a road, lab or hostel players must stay out of, then tap “Add zone”.'}
      </p>
      <div className="frame cut" style={{ height: '56vh', minHeight: 340, position: 'relative' }}>
        <div className="inner cut" style={{ position: 'relative', overflow: 'hidden' }}>
          <MapView ref={mapRef} themeKey={themeKey} boundary={boundary} nogo={nogo} draft={mode === 'boundary' ? boundary : draft} draftKind={mode}
            onMapClick={tap} me={me} markers={me ? [{ id: 'me', lat: me.lat, lng: me.lng, me: true }] : []} showMask={false} />
          <div className="stack" style={{ position: 'absolute', right: 10, top: 10, gap: 6 }}>
            <button className="cut cut-sm" style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', background: 'var(--bg)' }} aria-label="My location" onClick={locate}><IconMap s={20} /></button>
            <button className="cut cut-sm" style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', background: 'var(--bg)' }} aria-label="Undo point" onClick={undo}><IconUndo s={20} /></button>
          </div>
        </div>
      </div>
      <div className="row between">
        <div className="muted mono" style={{ fontSize: 13 }}>
          {mode === 'boundary' ? `${boundary.length} points${area ? ` · ${area > 1e6 ? (area / 1e6).toFixed(2) + ' km²' : Math.round(area).toLocaleString() + ' m²'}` : ''}` : `${draft.length} points · ${nogo.length} zone${nogo.length === 1 ? '' : 's'}`}
        </div>
        {mode === 'boundary' ? <button className="muted" style={{ fontSize: 13 }} onClick={() => setBoundary([])}>Clear</button>
          : <Button size="sm" kind="danger" disabled={draft.length < 3} onClick={addNogo}><IconPlus s={16} /> Add zone</Button>}
      </div>
      {nogo.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {nogo.map((z, i) => <button key={i} className="tag bad" style={{ padding: '6px 10px' }} onClick={() => setNogo(nogo.filter((_, j) => j !== i))}>No-go {i + 1} ✕</button>)}
        </div>
      )}
      <Button size="lg" block loading={saving} disabled={!dirty || boundary.length < 3} onClick={save}>{s.room.boundary && !dirty ? 'Saved' : 'Save play area'}</Button>
    </div>
  );
}

/* ---------- RULES EDITOR ---------- */
type RuleDef = { k: keyof Settings; t: string; d: string; unit: 'min' | 's' | 'm' | '%' | 'x'; min: number; max: number; step: number };
const RULES: { group: string; items: RuleDef[] }[] = [
  { group: 'Clock', items: [
    { k: 'hide_secs', t: 'Hide time', d: 'Runners scatter before hunters are let loose.', unit: 'min', min: 1, max: 30, step: 1 },
    { k: 'match_secs', t: 'Match length', d: 'Hunt time. If it runs out before the mark, hunters win.', unit: 'min', min: 5, max: 240, step: 5 },
  ] },
  { group: 'Tasks', items: [
    { k: 'tasks_per_runner', t: 'Tasks per runner', d: 'Each runner\'s deck of mini-games.', unit: 'x', min: 1, max: 30, step: 1 },
    { k: 'win_pct', t: 'Win mark', d: 'Runners win when the shared bar reaches this.', unit: '%', min: 10, max: 100, step: 5 },
    { k: 'cooldown_secs', t: 'Task cooldown', d: 'Wait between tasks.', unit: 's', min: 0, max: 300, step: 5 },
  ] },
  { group: 'Reveals', items: [
    { k: 'reveal_every', t: 'Reveal every', d: 'Runners show up on hunters\' maps on this cycle.', unit: 's', min: 30, max: 1800, step: 15 },
    { k: 'reveal_for', t: 'Reveal lasts', d: 'How long runners stay visible.', unit: 's', min: 5, max: 600, step: 5 },
  ] },
  { group: 'Zone', items: [
    { k: 'shrink_every', t: 'Shrink every', d: 'The safe circle closes in on this cycle.', unit: 's', min: 60, max: 3600, step: 30 },
    { k: 'shrink_factor', t: 'Shrink to', d: 'Each new circle is this % of the last.', unit: '%', min: 30, max: 95, step: 5 },
    { k: 'min_zone_m', t: 'Smallest circle', d: 'The zone never gets tighter than this.', unit: 'm', min: 20, max: 2000, step: 10 },
  ] },
  { group: 'Fair play', items: [
    { k: 'catch_radius_m', t: 'Catch distance', d: 'GPS must put the hunter this close to confirm a scan.', unit: 'm', min: 5, max: 200, step: 5 },
    { k: 'buffer_m', t: 'Boundary buffer', d: 'Slack past the line before a player counts as out.', unit: 'm', min: 0, max: 100, step: 5 },
    { k: 'grace_secs', t: 'Out-of-zone grace', d: 'Seconds to get back in before elimination.', unit: 's', min: 3, max: 120, step: 1 },
    { k: 'max_acc_m', t: 'Ignore GPS worse than', d: 'Weak readings are skipped so drift can\'t knock anyone out.', unit: 'm', min: 10, max: 200, step: 5 },
  ] },
];

function RulesEditor({ s, refresh }: { s: RoomState; refresh: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Settings>(s.room.settings);
  const [curfew, setCurfew] = useState(() => (s.room.settings.curfew_at ? toLocalInput(s.room.settings.curfew_at) : ''));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(s.room.name);
  const [pw, setPw] = useState('');
  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(s.room.settings) || curfew !== (s.room.settings.curfew_at ? toLocalInput(s.room.settings.curfew_at) : '') || name !== s.room.name || pw.length >= 4, [v, curfew, name, pw, s]);

  const shown = (r: RuleDef) => { const x = v[r.k] as number; return r.unit === 'min' ? Math.round(x / 60) : r.unit === '%' && r.k === 'shrink_factor' ? Math.round(x * 100) : x; };
  const store = (r: RuleDef, n: number) => {
    const c = Math.min(r.max, Math.max(r.min, n));
    setV((o) => ({ ...o, [r.k]: r.unit === 'min' ? c * 60 : r.k === 'shrink_factor' ? c / 100 : c }));
  };
  async function save() {
    setSaving(true);
    try {
      await rpc('update_room', { p_room: s.room.id, p_name: name, p_settings: { ...v, curfew_at: curfew ? new Date(curfew).toISOString() : null }, p_password: pw.length >= 4 ? pw : null });
      haptic.ok(); toast('Rules saved'); setPw(''); refresh();
    } catch (e: any) { toast(e.message, true); } finally { setSaving(false); }
  }
  return (
    <div className="stack" style={{ gap: 24 }}>
      <PhaseTimeline st={v} />
      <Section title="Room">
        <div className="input-wrap cut"><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Room name" /></div>
        {!s.room.is_public && <div className="input-wrap cut"><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (leave blank to keep)" aria-label="New password" /></div>}
      </Section>
      {RULES.map((g) => (
        <Section key={g.group} title={g.group}>
          <div className="card" style={{ padding: '0 14px' }}>
            {g.items.map((r) => (
              <div key={r.k} className="list-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.t}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.d}</div>
                </div>
                <div className="row" style={{ gap: 0 }}>
                  <button className="chip" style={{ minHeight: 36, padding: '0 11px' }} aria-label={`Less ${r.t}`} onClick={() => store(r, shown(r) - r.step)}>−</button>
                  <div className="display mono center" style={{ width: 70, fontSize: 18 }}>{shown(r)}<span className="muted" style={{ fontSize: 11, marginLeft: 2 }}>{r.unit === 'x' ? '' : r.unit}</span></div>
                  <button className="chip" style={{ minHeight: 36, padding: '0 11px' }} aria-label={`More ${r.t}`} onClick={() => store(r, shown(r) + r.step)}>+</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <Section title="Event theme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
          {(Object.keys(EVENTS) as EventKey[]).map((k) => {
            const on = (v.event ?? 'none') === k;
            return (
              <motion.button key={k} whileTap={{ scale: 0.95 }} onClick={() => { haptic.tap(); setV((o) => ({ ...o, event: k })); }}
                style={{ borderRadius: 12, padding: 8, textAlign: 'left', background: 'var(--surface)', boxShadow: on ? '0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--line)' }}>
                <span style={{ display: 'block', height: 44, borderRadius: 10, background: EVENTS[k].swatch, marginBottom: 6 }} />
                <span style={{ display: 'block', fontWeight: 650, fontSize: 13.5 }}>{EVENTS[k].label}</span>
                <span className="muted" style={{ display: 'block', fontSize: 11 }}>{EVENTS[k].blurb}</span>
              </motion.button>
            );
          })}
        </div>
      </Section>
      <Section title="Safety">
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Curfew</div>
          <div className="muted" style={{ fontSize: 12 }}>The match ends automatically at this time, no winner. Leave empty for none.</div>
          <div className="row" style={{ gap: 8 }}>
            <div className="input-wrap cut grow"><input className="input" type="datetime-local" value={curfew} onChange={(e) => setCurfew(e.target.value)} aria-label="Curfew time" /></div>
            {curfew && <Button size="sm" kind="quiet" style={{ minHeight: 52 }} onClick={() => setCurfew('')}>Clear</Button>}
          </div>
        </div>
      </Section>
      <Button size="lg" block loading={saving} disabled={!dirty} onClick={save}>Save rules</Button>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Reveal timing: hunters see runners for {v.reveal_for}s every {v.reveal_every}s. Zone: {fmtDist(s.room.zone?.r ?? 0)} now, shrinking to {Math.round(v.shrink_factor * 100)}% each step.</p>
    </div>
  );
}
function toLocalInput(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
