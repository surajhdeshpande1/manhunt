import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, type PanInfo } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, IconMap, IconMenu, IconPhone, IconQR, IconScan, IconTarget, Modal, Section, useTick, useToast } from '../components/ui';
import { rpc } from '../lib/supabase';
import { useSession } from '../lib/session';
import { fmtClock, fmtDist, msUntil, serverNow, timeAgo } from '../lib/clock';
import { haptic, keepAwake } from '../lib/feel';
import { titleLabel } from '../lib/identity';
import { haversine } from '../lib/geo';
import type { GameEvent, Member, RoomState } from '../lib/types';
import { MapView, type MapHandle, type Marker } from './MapView';
import { Chat, PushToTalk } from './Comms';
import { RunnerQR, Scanner } from './QR';
import { TaskDeck } from './Tasks';
import type { Fix, GeoStatus } from './useRoom';
import { Heartbeat, HunterAmbience, RadarGlyph, RunnerAmbience } from '../components/Ambience';

type Geo = { fix: Fix | null; status: GeoStatus; latest: React.MutableRefObject<Fix | null> };
const REASON: Record<string, string> = {
  caught: 'was caught', boundary: 'left the boundary', zone: 'was outside the zone', nogo: 'entered a no-go zone',
  spoof: 'was removed for GPS spoofing', left: 'left the match', removed: 'was removed by the admin',
};

export function eventText(e: GameEvent, byId: Map<string, Member>, isAdmin: boolean): string | null {
  const u = (id: string | null) => (id ? `@${byId.get(id)?.username ?? 'player'}` : '');
  switch (e.kind) {
    case 'match_start': return `Match started · ${e.data.hunters} hunters, ${e.data.runners} runners`;
    case 'hunt': return 'The hunt is on';
    case 'caught': return `${u(e.target)} caught${e.actor ? ` by ${u(e.actor)}` : ' (confirmed by admin)'}`;
    case 'eliminated': return `${u(e.target)} ${REASON[e.data.reason] ?? 'is out'}`;
    case 'shrink': return `Zone shrank to ${Math.round(e.data.r)} m${e.data.forced ? ' (admin)' : ''}`;
    case 'reveal': return 'Admin forced a location reveal';
    case 'pause': return 'Match paused';
    case 'resume': return 'Match resumed';
    case 'broadcast': return `Admin: ${e.data.text}`;
    case 'task': return isAdmin ? `${u(e.actor)} finished task ${e.data.n}` : null;
    case 'sos': return isAdmin ? `SOS from @${e.data.username}` : null;
    case 'end': return 'Match over';
    default: return null;
  }
}

export function Match({ s, feed, geo, refresh, themeKey }: { s: RoomState; feed: GameEvent[]; geo: Geo; refresh: () => void; themeKey: string }) {
  useTick(500);
  const toast = useToast();
  const { profile } = useSession();
  const mapRef = useRef<MapHandle>(null);
  const [qr, setQr] = useState(false);
  const [scan, setScan] = useState(false);
  const [menu, setMenu] = useState(false);
  const wide = useWide();
  const isAdmin = s.is_admin;
  const me = s.me;
  const role = me?.role ?? null;
  const alive = !!me?.alive;
  const spectator = isAdmin || !alive;
  const byId = useMemo(() => new Map(s.members.map((m) => [m.id, m])), [s.members]);
  const hunters = s.members.filter((m) => m.role === 'hunter');
  const runners = s.members.filter((m) => m.role === 'runner');
  const st = s.room.settings;

  useEffect(() => { keepAwake(true); return () => { keepAwake(false); }; }, []);

  const sosIds = useMemo(() => new Set(isAdmin ? feed.filter((e) => e.kind === 'sos' && serverNow() - new Date(e.at).getTime() < 5 * 60e3).map((e) => e.actor!) : []), [feed, isAdmin]);
  const markers: Marker[] = useMemo(() => {
    const out: Marker[] = s.positions.filter((p) => p.id !== profile?.id).map((p) => {
      const m = byId.get(p.id);
      return { id: p.id, lat: p.lat, lng: p.lng, selfie: m?.selfie, role: p.role, label: m?.username, title: titleLabel(m?.title), stale: serverNow() - new Date(p.at).getTime() > 20000, alert: sosIds.has(p.id) || (isAdmin && !!m?.oob) };
    });
    const f = geo.fix;
    if (f && !isAdmin && alive) out.push({ id: 'me', lat: f.lat, lng: f.lng, selfie: profile?.selfie_path, role, me: true });
    return out;
  }, [s.positions, geo.fix, byId, sosIds, isAdmin, alive, role, profile]);

  // OOB grace countdown
  const oobLeft = me?.oob_since ? st.grace_secs * 1000 - (serverNow() - new Date(me.oob_since).getTime()) : null;
  useEffect(() => { if (me?.oob_since) haptic.alarm(); }, [me?.oob_since]);

  const panel = (
    <div className="stack" style={{ gap: 22 }}>
      {isAdmin ? <AdminPanel s={s} refresh={refresh} feed={feed} byId={byId} mapRef={mapRef} />
        : !alive ? <SpectatorBanner me={me!} byId={byId} />
        : role === 'runner' ? <RunnerPanel s={s} onQR={() => setQr(true)} refresh={refresh} />
        : <HunterPanel s={s} onScan={() => setScan(true)} myFix={geo.fix} byId={byId} />}
      {!isAdmin && role === 'hunter' && <Section title="Hunter channel"><Chat roomId={s.room.id} channel="hunters" members={s.members} meId={profile!.id} height={200} compact /></Section>}
      <Rosters hunters={hunters} runners={runners} myFix={geo.fix} positions={s.positions} />
      <Feed feed={feed} byId={byId} isAdmin={isAdmin} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      <div style={{ position: 'absolute', inset: 0, right: wide ? 420 : 0 }}>
        <MapView ref={mapRef} themeKey={themeKey} boundary={s.room.boundary} nogo={s.room.nogo} zone={s.room.zone} zoneNext={s.room.status === 'hunt' ? s.room.zone_next : null}
          markers={markers} me={!isAdmin && alive && geo.fix ? geo.fix : null}
          fitPad={wide ? { top: 150, bottom: 40, left: 40, right: 70 } : { top: 150, bottom: 210, left: 30, right: 70 }} />
        <Hud s={s} geo={geo} isAdmin={isAdmin} alive={alive} role={role} onMenu={() => setMenu(true)} />
        <div className="stack" style={{ position: 'absolute', right: 12, top: 'calc(env(safe-area-inset-top) + 132px)', gap: 8, zIndex: 20 }}>
          {!isAdmin && alive && <SOSButton roomId={s.room.id} getFix={() => geo.latest.current} />}
          <MapBtn label="Fit play area" onClick={() => mapRef.current?.fit()}><IconMap s={20} /></MapBtn>
          {geo.fix && !isAdmin && <MapBtn label="Centre on me" onClick={() => mapRef.current?.flyTo(geo.fix!.lat, geo.fix!.lng)}><IconTarget s={20} /></MapBtn>}
        </div>
      </div>

      {wide ? (
        <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, overflowY: 'auto', background: 'var(--bg2)', borderLeft: '1px solid var(--line)', padding: '20px 20px 40px' }}>{panel}</aside>
      ) : (
        <Sheet peek={role === 'runner' && alive ? 184 : role === 'hunter' && alive ? 164 : 132}>{panel}</Sheet>
      )}

      {!isAdmin && alive && role === 'runner' && <RunnerAmbience exposed={s.room.status === 'hunt' && s.reveal.active} intensity={s.room.status === 'paused' ? 0.4 : 0.85} />}
      {!isAdmin && alive && role === 'hunter' && <HunterAmbience hunting={s.room.status === 'hunt'} intensity={s.room.status === 'paused' ? 0.4 : 0.8} />}
      <AnimatePresence>{oobLeft !== null && alive && <OobOverlay left={oobLeft} reason={me!.oob_reason} />}</AnimatePresence>
      <AnimatePresence>
        {qr && me?.qr && <RunnerQR key="qr" roomId={s.room.id} token={me.qr} username={profile!.username} selfie={profile!.selfie_path} onClose={() => setQr(false)} />}
        {scan && <Scanner key="scan" roomId={s.room.id} getFix={() => geo.latest.current} onClose={() => { setScan(false); refresh(); }} />}
      </AnimatePresence>
      <MatchMenu open={menu} onClose={() => setMenu(false)} s={s} />
    </div>
  );
}

function useWide() {
  const q = '(min-width: 1024px)';
  const [w, setW] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const h = () => setW(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return w;
}
function MapBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return <button aria-label={label} onClick={() => { haptic.tap(); onClick(); }} className="cut cut-sm" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'var(--bg)', border: '1px solid var(--line2)' }}>{children}</button>;
}

/* ---------- rolling digits: each changed character slides in ---------- */
export function RollingText({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <span className="mono display" style={{ display: 'inline-flex', lineHeight: 1, overflow: 'hidden', ...style }} aria-label={text}>
      {text.split('').map((c, i) => (
        <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={c} style={{ display: 'inline-block' }} initial={{ y: '-80%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }} exit={{ y: '80%', opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>{c}</motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/* ---------- HUD ---------- */
function Hud({ s, geo, isAdmin, alive, role, onMenu }: { s: RoomState; geo: Geo; isAdmin: boolean; alive: boolean; role: string | null; onMenu: () => void }) {
  const r = s.room; const p = s.progress;
  const status = r.status === 'paused' ? 'paused' : r.status;
  const phase = status === 'hiding' ? { t: msUntil(r.hide_ends_at) > 0 ? 'Hide' : 'Hide over', v: msUntil(r.hide_ends_at) > 0 ? fmtClock(msUntil(r.hide_ends_at)) : isAdmin ? 'Ready' : 'Any second' }
    : status === 'hunt' ? { t: 'Hunt', v: fmtClock(msUntil(r.ends_at)) } : { t: 'Paused', v: '— —' };
  const rev = s.reveal;
  const revealMs = rev.active ? msUntil(rev.until) : msUntil(rev.next_at);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: 'calc(env(safe-area-inset-top) + 10px) 12px 0', pointerEvents: 'none' }}>
      <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        layout onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; haptic.tap(); setOpen((o) => !o); }} role="button" aria-expanded={open} aria-label="Match details"
        className="force-night" style={{ pointerEvents: 'auto', position: 'relative', overflow: 'hidden', borderRadius: 12, padding: open ? '12px 14px 12px' : '8px 10px 10px 12px', cursor: 'pointer',
          background: '#14110f', boxShadow: `0 0 0 2.5px #fff2e0, 4px 4px 0 2.5px ${status === 'hunt' ? (role === 'hunter' ? '#ffd400' : '#ff6a1a') : status === 'hiding' ? '#ffd400' : '#fff2e0'}`, marginRight: 4 }}>
        <motion.div layout="position" className="row between" style={{ marginBottom: open ? 8 : 6, gap: 8 }}>
          <div className="row" style={{ gap: 8, flex: 'none' }}>
            <span className={`tag ${status === 'hunt' ? 'live' : ''}`}>{status === 'hunt' && <span className="dot pulse" />}{phase.t}</span>
            <RollingText text={phase.v} style={{ fontSize: 'clamp(23px, 7.4vw, 30px)', fontWeight: 800, letterSpacing: '-0.04em', flex: 'none' }} />
          </div>
          <div className="row" style={{ gap: 6, minWidth: 0 }}>
            {!isAdmin && alive && role === 'runner' && <span className="hide-xs" title="Your pulse"><Heartbeat exposed={status === 'hunt' && rev.active} width={42} /></span>}
            {!isAdmin && alive && role === 'hunter' && <RadarGlyph size={22} />}
            {status === 'hunt' && (
              <span className="tag" style={rev.active ? { background: 'var(--danger)', color: '#fff' } : undefined}>
                {rev.active ? <><span className="dot pulse" /> <span className="hide-xs">Revealed </span>{fmtClock(revealMs)}</> : <><span className="hide-xs">Reveal </span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="show-xs"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>{fmtClock(revealMs)}</>}
              </span>
            )}
            <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Menu" onClick={onMenu}><IconMenu s={20} /></button>
          </div>
        </motion.div>
        {p && !open && (
          <div style={{ position: 'relative', height: 8, borderRadius: 1, background: '#2e2723', boxShadow: '0 0 0 1.5px #fff2e0' }} aria-label={`${Math.round(p.pct)} percent of tasks done, win at ${p.mark}`}>
            <motion.div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: '#ff6a1a' }} animate={{ width: `${Math.min(100, p.pct)}%` }} transition={{ type: 'spring', damping: 26, stiffness: 140 }} />
            <div style={{ position: 'absolute', left: `${p.mark}%`, top: -4, bottom: -4, width: 4, marginLeft: -2, background: '#ffd400', boxShadow: '0 0 0 1.5px #14110f' }} />
          </div>
        )}
        <AnimatePresence initial={false}>
        {open && <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
        {p && <ProgressBar p={p} />}
        <div className="row" style={{ gap: 14, marginTop: 9, flexWrap: 'wrap', fontSize: 12, fontWeight: 600, color: 'rgba(255,240,230,.75)' }}>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--runner)',  }} />{p?.runners_alive}/{p?.runners} runners</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--hunter)',  }} />{p?.hunters_alive} hunters</span>
          {r.zone && <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid currentColor' }} />{fmtDist(r.zone.r)}{status === 'hunt' && r.next_shrink_at ? `, shrinks in ${fmtClock(msUntil(r.next_shrink_at))}` : ''}</span>}
        </div>
        </motion.div>}
        </AnimatePresence>
      </motion.div>
      {!isAdmin && alive && geo.status !== 'ok' && (
        <div className="cut cut-sm" style={{ pointerEvents: 'auto', marginTop: 6, padding: '8px 12px', background: geo.status === 'denied' ? 'var(--danger)' : 'var(--surface2)', color: geo.status === 'denied' ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 600 }}>
          {geo.status === 'denied' ? 'Location is blocked. Allow it in your browser settings to stay in the game.'
            : geo.status === 'weak' ? `Weak GPS${geo.fix ? ` (±${Math.round(geo.fix.acc)} m)` : ''}. Readings are ignored until it improves. Step into the open.`
            : geo.status === 'unsupported' ? 'This browser has no location support.' : 'Finding your GPS…'}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ p, big }: { p: NonNullable<RoomState['progress']>; big?: boolean }) {
  const h = big ? 18 : 12;
  return (
    <div>
      <div style={{ position: 'relative', height: h, background: 'var(--surface2)', boxShadow: '0 0 0 2.5px var(--edge)', borderRadius: 2 }}>
        <div style={{ position: 'absolute', left: `${p.max_pct}%`, right: 0, top: 0, bottom: 0, background: 'repeating-linear-gradient(-45deg, transparent 0 5px, var(--danger) 5px 7px)', opacity: 0.6 }} title="Out of reach" />
        <motion.div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--flare)', borderRight: '2.5px solid var(--edge)' }}
          initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.pct)}%` }} transition={{ type: 'spring', damping: 24, stiffness: 120 }} />
        <div style={{ position: 'absolute', left: `${p.mark}%`, top: -6, bottom: -6, width: 6, marginLeft: -3, background: 'var(--police)', boxShadow: '0 0 0 2px #14110f' }} />
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="mono" style={{ fontSize: big ? 22 : 16, fontWeight: 900 }}>{Math.round(p.pct)}%<span className="muted" style={{ fontSize: big ? 13 : 12, marginLeft: 6, fontWeight: 650 }}>{p.done}/{p.total} tasks</span></span>
        <span className="mono" style={{ fontSize: big ? 14 : 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mark-text)' }}>Win at {p.mark}%</span>
      </div>
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
function Sheet({ children, peek }: { children: React.ReactNode; peek: number }) {
  const H = typeof window !== 'undefined' ? window.innerHeight : 800;
  const full = Math.round(H * 0.86);
  const snaps = [full - peek, full - Math.round(H * 0.5), 0];
  const ctl = useAnimationControls();
  const [at, setAt] = useState(0);
  useEffect(() => { ctl.start({ y: snaps[at], transition: { type: 'spring', damping: 30, stiffness: 300 } }); }, [at, peek]);
  function end(_: any, info: PanInfo) {
    const y = snaps[at] + info.offset.y + info.velocity.y * 0.2;
    let best = 0; snaps.forEach((s, i) => { if (Math.abs(s - y) < Math.abs(snaps[best] - y)) best = i; });
    if (best === at) ctl.start({ y: snaps[at] });
    setAt(best); haptic.tap();
  }
  return (
    <motion.div drag="y" dragConstraints={{ top: 0, bottom: snaps[0] }} dragElastic={0.06} onDragEnd={end} animate={ctl} initial={{ y: snaps[0] }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: full, zIndex: 30, touchAction: 'none', borderRadius: '16px 16px 0 0',
        background: 'var(--bg2)', borderTop: '3px solid var(--edge)', boxShadow: '0 -4px 0 0 var(--hard-card)' }}>
      <button aria-label="Expand panel" onClick={() => setAt(at === 2 ? 0 : at + 1)} style={{ width: '100%', height: 26, display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 48, height: 6, borderRadius: 2, background: 'var(--edge)' }} />
      </button>
      <div style={{ height: full - 26, overflowY: at === 2 ? 'auto' : 'hidden', padding: '6px 20px calc(env(safe-area-inset-bottom) + 28px)', touchAction: at === 2 ? 'pan-y' : 'none' }}
        onPointerDownCapture={(e) => { if (at === 2) e.stopPropagation(); }}>
        {children}
      </div>
    </motion.div>
  );
}

/* ---------- Panels ---------- */
function RunnerPanel({ s, onQR, refresh }: { s: RoomState; onQR: () => void; refresh: () => void }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <TaskDeck s={s} refresh={refresh} />
      <motion.button whileTap={{ scale: 0.97 }} onClick={onQR} className="card row" style={{ textAlign: 'left', padding: '12px 14px', gap: 14 }}>
        <span style={{ width: 48, height: 48, borderRadius: 8, display: 'grid', placeItems: 'center', background: '#fff2e0', color: '#14110f', rotate: '-4deg', boxShadow: '0 0 0 2.5px #14110f' }}><IconQR s={26} /></span>
        <div className="grow"><div style={{ fontSize: 17, fontWeight: 850 }}>My catch code</div><div className="muted" style={{ fontSize: 12.5 }}>Show it to the hunter who tags you.</div></div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--faint)' }}><path d="M9 5l7 7-7 7" /></svg>
      </motion.button>
    </div>
  );
}

function HunterPanel({ s, onScan, myFix, byId }: { s: RoomState; onScan: () => void; myFix: Fix | null; byId: Map<string, Member> }) {
  const hunt = s.room.status === 'hunt';
  const visible = s.positions.filter((p) => p.role === 'runner');
  const nearest = myFix && visible.length ? Math.min(...visible.map((p) => haversine(myFix.lat, myFix.lng, p.lat, p.lng))) : null;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <motion.button whileTap={hunt ? { scale: 0.96 } : undefined} onClick={() => { haptic.tap(); onScan(); }} disabled={!hunt}
        className="btn" style={{ position: 'relative', overflow: 'hidden', minHeight: 88, width: 'calc(100% - 5px)', borderRadius: 10, background: hunt ? 'var(--police)' : 'var(--surface2)', color: hunt ? '#000' : 'var(--muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, ['--sh' as any]: '5px' }}>
        {hunt && <span aria-hidden className="tape" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, opacity: 0.9 }} />}
        
        <IconScan s={32} />
        <span className="display" style={{ fontSize: 32 }}>{hunt ? 'Scan to tag' : s.room.status === 'paused' ? 'Paused' : 'Hold position'}</span>
      </motion.button>
      <div className="muted" style={{ fontSize: 13 }}>
        {!hunt ? 'Runners are hiding. The admin opens the hunt when the timer ends.'
          : s.reveal.active ? `${visible.length} runner${visible.length === 1 ? '' : 's'} visible now${nearest != null ? ` · nearest ≈ ${fmtDist(nearest)}` : ''}.`
          : `Runners are hidden. Next reveal in ${fmtClock(msUntil(s.reveal.next_at))}.`}
      </div>
      <PushToTalk roomId={s.room.id} />
    </div>
  );
}

function SpectatorBanner({ me, byId }: { me: NonNullable<RoomState['me']>; byId: Map<string, Member> }) {
  const reason = REASON[me.out_reason ?? ''] ?? 'are out';
  return (
    <div className="frame cut" style={{ background: 'var(--danger)' }}>
      <div className="inner cut" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 26 }}>You're out</div>
        <div className="muted" style={{ fontSize: 14 }}>You {reason.replace(/^was /, 'were ')}. You're spectating now, with the full live map.</div>
      </div>
    </div>
  );
}

function Rosters({ hunters, runners, myFix, positions }: { hunters: Member[]; runners: Member[]; myFix: Fix | null; positions: RoomState['positions'] }) {
  const pos = new Map(positions.map((p) => [p.id, p]));
  const Row = ({ m }: { m: Member }) => {
    const p = pos.get(m.id);
    const d = myFix && p ? haversine(myFix.lat, myFix.lng, p.lat, p.lng) : null;
    return (
      <div className="center" style={{ flex: 'none', width: 66, opacity: m.alive ? 1 : 0.55 }}>
        <div style={{ padding: 2, background: m.alive ? (m.role === 'hunter' ? 'var(--hunter)' : 'var(--runner)') : 'var(--surface3)', borderRadius: '50%' }}><Avatar src={m.selfie} name={m.username} size={54} out={!m.alive} /></div>
        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{m.username}</div>
        {titleLabel(m.title) && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>{titleLabel(m.title)}</div>}
        <div className="muted mono" style={{ fontSize: 10 }}>{!m.alive ? 'out' : m.role === 'runner' ? `${m.tasks} tasks` : `${m.catches} caught`}{d != null && d >= 3 && m.alive ? ` · ${fmtDist(d)}` : ''}</div>
      </div>
    );
  };
  return (
    <>
      <Section title={`Hunters · ${hunters.filter((h) => h.alive).length}`}><div className="row scroll-x" style={{ gap: 10 }}>{hunters.map((m) => <Row key={m.id} m={m} />)}</div></Section>
      <Section title={`Runners · ${runners.filter((h) => h.alive).length}/${runners.length}`}><div className="row scroll-x" style={{ gap: 10 }}>{runners.map((m) => <Row key={m.id} m={m} />)}</div></Section>
    </>
  );
}

function Feed({ feed, byId, isAdmin }: { feed: GameEvent[]; byId: Map<string, Member>; isAdmin: boolean }) {
  const items = feed.map((e) => ({ e, t: eventText(e, byId, isAdmin) })).filter((x) => x.t).reverse().slice(0, 30);
  return (
    <Section title="Feed">
      {items.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Quiet so far.</div> : (
        <div className="stack" style={{ gap: 0 }}>
          {items.map(({ e, t }) => (
            <div key={e.id} className="row" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
              <span style={{ width: 6, height: 6, flex: 'none', background: e.kind === 'caught' || e.kind === 'eliminated' || e.kind === 'sos' ? 'var(--danger)' : 'var(--accent)' }} />
              <span className="grow">{t}</span>
              <span className="muted mono" style={{ fontSize: 11 }}>{timeAgo(e.at)}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------- Admin console ---------- */
function AdminPanel({ s, refresh, feed, byId, mapRef }: { s: RoomState; refresh: () => void; feed: GameEvent[]; byId: Map<string, Member>; mapRef: React.RefObject<MapHandle> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const r = s.room;
  const act = async (fn: string, args: any = {}, ok?: string) => {
    setBusy(fn);
    try { await rpc(fn, { p_room: r.id, ...args }); haptic.ok(); if (ok) toast(ok); refresh(); } catch (e: any) { toast(e.message, true); } finally { setBusy(null); }
  };
  const hideLeft = msUntil(r.hide_ends_at);
  const sos = feed.filter((e) => e.kind === 'sos').reverse().slice(0, 5);
  const pos = new Map(s.positions.map((p) => [p.id, p]));
  const players = s.members.filter((m) => m.role);
  return (
    <div className="stack" style={{ gap: 18 }}>
      {sos.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {sos.map((e) => (
            <div key={e.id} className="cut row" style={{ background: 'var(--danger)', color: '#fff', padding: '10px 12px', gap: 10 }}>
              <div className="grow"><div className="display" style={{ fontSize: 18 }}>SOS · @{e.data.username}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{timeAgo(e.at)} ago</div></div>
              {e.data.lat != null && <button className="tag" style={{ background: '#fff', color: '#c4170c', padding: '6px 10px' }} onClick={() => mapRef.current?.flyTo(e.data.lat, e.data.lng, 18)}>Locate</button>}
              {e.data.phone && <a className="tag" style={{ background: '#fff', color: '#c4170c', padding: '6px 10px', textDecoration: 'none' }} href={`tel:${e.data.phone}`}>Call</a>}
            </div>
          ))}
        </div>
      )}

      {r.status === 'hiding' && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>{hideLeft > 0 ? `Runners are hiding. HUNT unlocks in ${fmtClock(hideLeft)}.` : 'Hide time is up. Release the hunters.'}</div>
          <Button kind="hot" size="lg" block disabled={hideLeft > 2000} loading={busy === 'start_hunt'} onClick={() => act('start_hunt')} style={{ minHeight: 70, fontSize: 24, fontWeight: 750 }}>Start the hunt</Button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {r.status === 'paused' ? <Button loading={busy === 'resume_match'} onClick={() => act('resume_match')}>Resume</Button>
          : <Button kind="ghost" loading={busy === 'pause_match'} onClick={() => act('pause_match')}>Pause</Button>}
        <Button kind="danger" loading={busy === 'end_match'} onClick={() => confirm('End the match now? No winner will be declared.') && act('end_match')}>End match</Button>
        <Button kind="quiet" disabled={r.status !== 'hunt'} loading={busy === 'force_reveal'} onClick={() => act('force_reveal', {}, 'Runners revealed to hunters')}>Force reveal</Button>
        <Button kind="quiet" disabled={r.status !== 'hunt'} loading={busy === 'force_shrink'} onClick={() => confirm('Shrink the zone now?') && act('force_shrink', {}, 'Zone shrinking')}>Shrink zone</Button>
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (msg.trim()) act('broadcast', { p_text: msg }, 'Sent to everyone').then(() => setMsg('')); }}>
        <div className="input-wrap cut grow"><input className="input" style={{ height: 46 }} maxLength={200} placeholder="Broadcast to everyone" value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
        <Button size="sm" style={{ minHeight: 48 }} disabled={!msg.trim()} type="submit">Send</Button>
      </form>

      <Section title={`Players · ${players.filter((p) => p.alive).length} in`}>
        <div className="card" style={{ padding: '0 12px' }}>
          {players.map((m) => {
            const p = pos.get(m.id);
            const stale = p ? serverNow() - new Date(p.at).getTime() > 30000 : true;
            return (
              <div key={m.id} className="list-row" style={{ gap: 10 }}>
                <button onClick={() => p && mapRef.current?.flyTo(p.lat, p.lng, 18)} aria-label={`Show ${m.username}`}><Avatar src={m.selfie} name={m.username} size={36} out={!m.alive} /></button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b style={{ fontSize: 14 }}>@{m.username}</b>{titleLabel(m.title) && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', marginLeft: 6 }}>{titleLabel(m.title)}</span>}
                    <span className="tag" style={{ fontSize: 10, padding: '1px 5px', background: m.role === 'hunter' ? 'var(--hunter)' : 'var(--runner)', color: m.role === 'hunter' ? '#000' : '#170700' }}>{m.role === 'hunter' ? 'H' : 'R'}</span>
                    {m.oob && m.alive && <span className="tag bad" style={{ fontSize: 10, padding: '1px 5px' }}>Outside</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {!m.alive ? (REASON[m.out_reason ?? ''] ?? 'out') : m.role === 'runner' ? `${m.tasks} tasks` : `${m.catches} catches`}
                    {m.alive && (stale ? ' · no GPS 30s+' : '')}
                  </div>
                </div>
                {m.phone && <a className="icon-btn muted" style={{ width: 32, height: 32 }} href={`tel:${m.phone}`} aria-label={`Call ${m.username}`}><IconPhone s={17} /></a>}
                {m.alive && m.role === 'runner' && r.status !== 'hiding' && <button className="tag" style={{ padding: '5px 8px' }} onClick={() => confirm(`Confirm @${m.username} as caught?`) && act('admin_mark_caught', { p_user: m.id })}>Caught</button>}
                {m.alive && <button className="muted" aria-label={`Disqualify ${m.username}`} onClick={() => confirm(`Disqualify @${m.username}? They'll be removed from the match.`) && act('remove_member', { p_user: m.id })}>✕</button>}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/* ---------- SOS ---------- */
function SOSButton({ roomId, getFix }: { roomId: string; getFix: () => Fix | null }) {
  const toast = useToast();
  const [hold, setHold] = useState(false);
  const t = useRef<number>();
  function down() {
    setHold(true); haptic.tap();
    t.current = window.setTimeout(async () => {
      setHold(false); haptic.alarm();
      const f = getFix();
      try { await rpc('send_sos', { p_room: roomId, p_lat: f?.lat ?? null, p_lng: f?.lng ?? null }); toast('SOS sent to the admin with your location'); }
      catch (e: any) { toast(e.message, true); }
    }, 1500);
  }
  function up() { setHold(false); clearTimeout(t.current); }
  return (
    <button aria-label="Hold for SOS" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()}
      className="cut cut-sm display" style={{ width: 44, height: 44, background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 800, position: 'relative', overflow: 'hidden', touchAction: 'none' }}>
      <span style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: hold ? '100%' : '0%', background: 'rgba(255,255,255,.35)', transition: hold ? 'height 1.5s linear' : 'height .15s' }} />
      <span style={{ position: 'relative' }}>SOS</span>
    </button>
  );
}

/* ---------- Out of zone ---------- */
function OobOverlay({ left, reason }: { left: number; reason: string | null }) {
  const secs = Math.max(0, Math.ceil(left / 1000));
  const what = reason === 'nogo' ? 'You are in a no-go zone' : reason === 'zone' ? 'You are outside the safe zone' : 'You are outside the boundary';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 500, pointerEvents: 'none' }}>
      <motion.div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 6px var(--danger), inset 0 0 80px rgba(255,59,48,.55)' }} animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
      <div style={{ position: 'absolute', left: 16, right: 16, top: '38%', display: 'grid', placeItems: 'center' }}>
        <div className="cut center" style={{ background: 'var(--danger)', color: '#fff', padding: '16px 22px', maxWidth: 360 }}>
          <div className="display" style={{ fontSize: 22 }}>{what}</div>
          <div className="display mono" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1 }}>{secs}</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Get back in or you're eliminated. Tasks are locked.</div>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------- Menu ---------- */
function MatchMenu({ open, onClose, s }: { open: boolean; onClose: () => void; s: RoomState }) {
  const nav = useNavigate();
  const toast = useToast();
  const st = s.room.settings;
  return (
    <Modal open={open} onClose={onClose} title={s.room.name}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="card" style={{ padding: '2px 14px' }}>
          {[['Win mark', `${st.win_pct}% of tasks`], ['Tasks', `${st.tasks_per_runner} per runner · ${st.cooldown_secs}s cooldown`], ['Reveals', `${st.reveal_for}s every ${st.reveal_every}s`],
            ['Zone', `shrinks to ${Math.round(st.shrink_factor * 100)}% every ${Math.round(st.shrink_every / 60)} min`], ['Catch distance', `${st.catch_radius_m} m`],
            ['Out of zone', `${st.grace_secs}s grace, ${st.buffer_m} m buffer`], ['Curfew', st.curfew_at ? new Date(st.curfew_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'none']].map(([k, v]) => (
            <div key={k} className="list-row" style={{ padding: '9px 0' }}><span className="muted grow" style={{ fontSize: 13 }}>{k}</span><span style={{ fontSize: 14, textAlign: 'right' }}>{v}</span></div>
          ))}
        </div>
        <Button kind="ghost" onClick={() => nav('/home')}>Back to rooms (match keeps running)</Button>
        {!s.is_admin && s.me?.alive && (
          <Button kind="danger" onClick={async () => {
            if (!confirm('Leave the match? You will be eliminated.')) return;
            try { await rpc('leave_room', { p_room: s.room.id }); nav('/home'); } catch (e: any) { toast(e.message, true); }
          }}>Leave match</Button>
        )}
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Keep TAG open with the screen on. Phones pause GPS for background tabs, and a silent phone can't prove where you are.</p>
      </div>
    </Modal>
  );
}
