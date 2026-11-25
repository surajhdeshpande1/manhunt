import { useAreaPack } from '../geo/useAreaPack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, type PanInfo } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, IconMap, IconMenu, IconPhone, IconQR, IconScan, IconTarget, Modal, Section, useTick, useToast } from '../components/ui';
import { rpc } from '../lib/supabase';
import { useSession } from '../lib/session';
import { fmtClock, fmtDist, msUntil, serverNow, timeAgo } from '../lib/clock';
import { haptic, keepAwake } from '../lib/feel';
import { useViewportH } from '../lib/viewport';
import { titleLabel } from '../lib/identity';
import { haversine, roomLeft } from '../lib/geo';
import { askCompass, useCompass } from '../lib/compass';
import type { GameEvent, Member, RoomState } from '../lib/types';
import { MapView, type MapHandle, type Marker } from './MapView';
import { hasSatellite } from '../lib/basemaps';
import { Chat, PushToTalk, useRadio, type Radio } from './Comms';
import { HunterLobby } from './HunterLobby';
import { GpsChip, GpsHelp, gpsLine } from './GpsHelp';
import { RunnerQR, Scanner } from './QR';
import { TaskDeck } from './Tasks';
import type { Fix, GeoStatus } from './useRoom';

type Geo = { fix: Fix | null; status: GeoStatus; latest: React.MutableRefObject<Fix | null>; rawAcc: number | null };

/** Tells a player when their location isn't good enough to count, and how to fix it. */
function GpsBanner({ geo }: { geo: Geo }) {
  const [help, setHelp] = useState(false);
  const l = gpsLine(geo.status, geo.fix, geo.rawAcc);
  const fixable = geo.status !== 'waiting' && geo.status !== 'unsupported';
  const bad = l.tone === 'bad';
  return (
    <>
      <div className="cut cut-sm row" role="status" style={{ pointerEvents: 'auto', marginTop: 6, padding: '8px 12px', gap: 10, background: bad ? 'var(--danger)' : 'var(--surface2)', color: bad ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 600 }}>
        <span className="grow">{l.text}</span>
        {fixable && <button type="button" onClick={() => setHelp(true)} style={{ flex: 'none', background: 'none', border: 0, color: 'inherit', font: 'inherit', fontWeight: 800, textDecoration: 'underline', padding: '4px 0', cursor: 'pointer' }}>How to fix</button>}
      </div>
      <GpsHelp open={help} onClose={() => setHelp(false)} status={geo.status} />
    </>
  );
}
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
  const [follow, setFollow] = useState(false);
  const wide = useWide();
  const isAdmin = s.is_admin;
  const me = s.me;
  const role = me?.role ?? null;
  const alive = !!me?.alive;
  const spectator = isAdmin || !alive;
  const byId = useMemo(() => new Map(s.members.map((m) => [m.id, m])), [s.members]);
  const hunters = s.members.filter((m) => m.role === 'hunter');
  const radio = useRadio(s.room.id);
  const area = useAreaPack(s.room.id, s.room.boundary, !!s.is_admin);
  const runners = s.members.filter((m) => m.role === 'runner');
  const st = s.room.settings;
  const playing = !isAdmin && alive;
  // the way you're heading: your direction of travel while moving (GPS), the compass while standing still
  const compass = useCompass(playing);
  const fix = geo.fix;
  const heading = fix?.course != null && (fix.speed ?? 0) >= 1.2 ? fix.course : compass;

  useEffect(() => { keepAwake(true); return () => { keepAwake(false); }; }, []);

  // Android back button / back gesture: close whatever is open, never drop out of a live match by accident.
  const overlay = useRef({ qr, scan, menu });
  overlay.current = { qr, scan, menu };
  useEffect(() => {
    history.pushState({ tagGuard: 1 }, '');
    const mounted = Date.now();
    const onPop = () => {
      history.pushState({ tagGuard: 1 }, '');
      if (Date.now() - mounted < 800) return; // our own history bookkeeping, not the user
      const o = overlay.current;
      if (o.scan) setScan(false); else if (o.qr) setQr(false); else if (o.menu) setMenu(false);
      else toast('Match in progress. Use the menu to leave.');
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); if (history.state?.tagGuard) history.back(); };
  }, []);

  const sosIds = useMemo(() => new Set(isAdmin ? feed.filter((e) => e.kind === 'sos' && serverNow() - new Date(e.at).getTime() < 5 * 60e3).map((e) => e.actor!) : []), [feed, isAdmin]);
  const markers: Marker[] = useMemo(() => {
    const out: Marker[] = s.positions.filter((p) => p.id !== profile?.id).map((p) => {
      const m = byId.get(p.id);
      return { id: p.id, lat: p.lat, lng: p.lng, selfie: m?.selfie, role: p.role, label: m?.username, title: titleLabel(m?.title), stale: serverNow() - new Date(p.at).getTime() > 20000, alert: sosIds.has(p.id) || (isAdmin && !!m?.oob) };
    });
    return out;
  }, [s.positions, byId, sosIds, isAdmin, profile]);

  // OOB grace countdown
  const oobLeft = me?.oob_since ? st.grace_secs * 1000 - (serverNow() - new Date(me.oob_since).getTime()) : null;
  useEffect(() => { if (me?.oob_since) haptic.alarm(); }, [me?.oob_since]);

  const panel = (
    <div className="stack" style={{ gap: 22 }}>
      {isAdmin ? <AdminPanel s={s} refresh={refresh} feed={feed} byId={byId} mapRef={mapRef} />
        : !alive ? <SpectatorBanner me={me!} byId={byId} />
        : role === 'runner' ? <RunnerPanel s={s} onQR={() => setQr(true)} refresh={refresh} />
        : <HunterPanel s={s} onScan={() => setScan(true)} myFix={geo.fix} radio={radio} />}
      {!isAdmin && role === 'hunter' && <Section title="Hunter chat"><Chat roomId={s.room.id} channel="hunters" members={s.members} meId={profile!.id} height={200} compact /></Section>}
      {!isAdmin && role === 'runner' && (
        <Section title="Runner chat">
          {alive ? <Chat roomId={s.room.id} channel="runners" members={s.members} meId={profile!.id} height={200} compact />
            : <div className="muted" style={{ fontSize: 13.5 }}>Closed. Runner chat is only for runners still in the game.</div>}
        </Section>
      )}
      <Rosters hunters={hunters} runners={runners} myFix={geo.fix} positions={s.positions} />
      <Feed feed={feed} byId={byId} isAdmin={isAdmin} />
    </div>
  );

  // hunters wait in their own lobby while runners hide
  const inHunterLobby = !isAdmin && alive && role === 'hunter' && (s.room.status === 'hiding' || (s.room.status === 'paused' && s.room.paused_from === 'hiding'));
  if (inHunterLobby) {
    return (
      <>
        <HunterLobby s={s} radio={radio} meId={profile!.id} onMenu={() => setMenu(true)} themeKey={themeKey}
          gps={<GpsChip status={geo.status} fix={geo.fix} rawAcc={geo.rawAcc} />}
          sos={<SOSButton roomId={s.room.id} getFix={() => geo.latest.current} />} />
        <MatchMenu open={menu} onClose={() => setMenu(false)} s={s} />
      </>
    );
  }
  const peek = role === 'runner' && alive ? 184 : role === 'hunter' && alive ? 164 : 132;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      <div style={{ position: 'absolute', inset: 0, right: wide ? 420 : 0 }}>
        <MapView ref={mapRef} themeKey={themeKey} areaPack={area.pack} boundary={s.room.boundary} nogo={s.room.nogo} zone={s.room.zone} zoneNext={s.room.status === 'hunt' ? s.room.zone_next : null}
          markers={markers} me={playing && fix ? fix : null} meHeading={playing ? heading : null} follow={follow && playing} onFollowChange={setFollow} chromeBottom={wide ? 0 : peek}
          fitPad={wide ? { top: 150, bottom: 40, left: 40, right: 70 } : { top: 150, bottom: 210, left: 30, right: 70 }} />
        <Hud s={s} geo={geo} isAdmin={isAdmin} alive={alive} role={role} onMenu={() => setMenu(true)} />
        <div className="stack" style={{ position: 'absolute', right: 12, top: 'calc(env(safe-area-inset-top) + 132px)', gap: 8, zIndex: 20 }}>
          {!isAdmin && alive && <SOSButton roomId={s.room.id} getFix={() => geo.latest.current} />}
          <MapBtn label="Fit play area" onClick={() => mapRef.current?.fit()}><IconMap s={20} /></MapBtn>
          {fix && playing && (
            <MapBtn label={follow ? 'Stop following me' : 'Follow me on the map'} active={follow} sub={`±${Math.max(1, Math.round(fix.acc))} m`}
              onClick={() => { askCompass(); if (follow) setFollow(false); else { setFollow(true); mapRef.current?.flyTo(fix.lat, fix.lng, 18.5); } }}>
              <IconTarget s={20} />
            </MapBtn>
          )}
          {hasSatellite() && <MapBtn label="Switch map or satellite" onClick={() => { const m = mapRef.current; if (m) m.setBasemap(m.basemap() === 'satellite' ? 'street' : 'satellite'); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M12 3 2 8l10 5 10-5-10-5zm-8.2 9.1L2 13l10 5 10-5-1.8-.9L12 16.2 3.8 12.1zm0 4L2 17l10 5 10-5-1.8-.9L12 20.2 3.8 16.1z" fill="currentColor" /></svg>
          </MapBtn>}
        </div>
      </div>

      {wide ? (
        <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, overflowY: 'auto', background: 'var(--bg2)', borderLeft: '1px solid var(--line)', padding: '20px 20px 40px' }}>{panel}</aside>
      ) : (
        <Sheet peek={peek}>{panel}</Sheet>
      )}

      {playing && role === 'runner' && s.room.status === 'hunt' && s.reveal.active && <div className="reveal-edge" aria-hidden />}
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
function MapBtn({ children, onClick, label, active, sub }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; sub?: string }) {
  return (
    <button aria-label={label} aria-pressed={active} onClick={() => { haptic.tap(); onClick(); }} className="cut cut-sm"
      style={{ width: 44, minHeight: 44, padding: sub ? '6px 0 4px' : 0, display: 'grid', placeItems: 'center', gap: 1, background: active ? '#2f7df6' : 'var(--bg)', color: active ? '#fff' : undefined, border: '1px solid var(--line2)' }}>
      {children}
      {sub && <span className="mono" style={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1 }}>{sub}</span>}
    </button>
  );
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
          background: 'rgba(17,17,19,.94)', boxShadow: `0 0 0 1px rgba(237,230,218,.14), inset 0 -2px 0 ${status === 'hunt' ? (role === 'hunter' ? '#c9a227' : '#d9541e') : status === 'hiding' ? '#c9a227' : 'transparent'}, 0 16px 40px -18px rgba(0,0,0,.8)` }}>
        <motion.div layout="position" className="row between" style={{ marginBottom: open ? 8 : 6, gap: 8 }}>
          <div className="row" style={{ gap: 8, flex: 'none' }}>
            <span className={`tag ${status === 'hunt' ? 'live' : ''}`}>{status === 'hunt' && <span className="dot pulse" />}{phase.t}</span>
            <RollingText text={phase.v} style={{ fontSize: 'clamp(23px, 7.4vw, 30px)', fontWeight: 800, letterSpacing: '-0.04em', flex: 'none' }} />
          </div>
          <div className="row" style={{ gap: 6, minWidth: 0 }}>
            {status === 'hunt' && (
              <span className="tag" style={rev.active ? { background: 'var(--danger)', color: '#fff' } : undefined}>
                {rev.active ? <><span className="dot pulse" /> <span className="hide-xs">Revealed </span>{fmtClock(revealMs)}</> : <><span className="hide-xs">Reveal </span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="show-xs"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>{fmtClock(revealMs)}</>}
              </span>
            )}
            <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Menu" onClick={onMenu}><IconMenu s={20} /></button>
          </div>
        </motion.div>
        {p && !open && (
          <div style={{ position: 'relative', height: 8, borderRadius: 1, background: '#2a2a2f', boxShadow: '0 0 0 1.5px #ede6da' }} aria-label={`${Math.round(p.pct)} percent of tasks done, win at ${p.mark}`}>
            <motion.div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: '#d9541e' }} animate={{ width: `${Math.min(100, p.pct)}%` }} transition={{ type: 'spring', damping: 26, stiffness: 140 }} />
            <div style={{ position: 'absolute', left: `${p.mark}%`, top: -4, bottom: -4, width: 4, marginLeft: -2, background: '#c9a227', boxShadow: '0 0 0 1.5px #0b0b0c' }} />
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
      {!isAdmin && alive && geo.status !== 'ok' && geo.status !== 'off' && <GpsBanner geo={geo} />}
      {!isAdmin && alive && geo.status === 'ok' && !s.me?.oob_since && <EdgeWarning s={s} geo={geo} />}
    </div>
  );
}

export function ProgressBar({ p, big }: { p: NonNullable<RoomState['progress']>; big?: boolean }) {
  const h = big ? 18 : 12;
  return (
    <div>
      <div style={{ position: 'relative', height: h, background: 'var(--surface2)', boxShadow: '0 0 0 1px var(--line2)', borderRadius: 2 }}>
        <div style={{ position: 'absolute', left: `${p.max_pct}%`, right: 0, top: 0, bottom: 0, background: 'repeating-linear-gradient(-45deg, transparent 0 5px, var(--danger) 5px 7px)', opacity: 0.6 }} title="Out of reach" />
        <motion.div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--flare)', borderRight: '1px solid var(--bg)' }}
          initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.pct)}%` }} transition={{ type: 'spring', damping: 24, stiffness: 120 }} />
        <div style={{ position: 'absolute', left: `${p.mark}%`, top: -6, bottom: -6, width: 6, marginLeft: -3, background: 'var(--police)', boxShadow: '0 0 0 2px #0b0b0c' }} />
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
  const H = useViewportH();
  const full = Math.round(H * 0.86);
  const snaps = [full - peek, full - Math.round(H * 0.5), 0];
  const ctl = useAnimationControls();
  const [at, setAt] = useState(0);
  useEffect(() => { ctl.start({ y: snaps[at], transition: { type: 'spring', damping: 30, stiffness: 300 } }); }, [at, peek, H]);
  function end(_: any, info: PanInfo) {
    const y = snaps[at] + info.offset.y + info.velocity.y * 0.2;
    let best = 0; snaps.forEach((s, i) => { if (Math.abs(s - y) < Math.abs(snaps[best] - y)) best = i; });
    if (best === at) ctl.start({ y: snaps[at] });
    setAt(best); haptic.tap();
  }
  return (
    <motion.div drag="y" dragConstraints={{ top: 0, bottom: snaps[0] }} dragElastic={0.06} onDragEnd={end} animate={ctl} initial={{ y: snaps[0] }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: full, zIndex: 30, touchAction: 'none', borderRadius: '16px 16px 0 0',
        background: 'var(--bg2)', boxShadow: '0 0 0 1px var(--line2), 0 -24px 50px -24px rgba(0,0,0,.7)' }}>
      <button aria-label="Expand panel" onClick={() => setAt(at === 2 ? 0 : at + 1)} style={{ width: '100%', height: 26, display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--line2)' }} />
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
  return <TaskDeck s={s} refresh={refresh} side={<QRButton onClick={onQR} />} />;
}
/** Always next to the task button: one tap and the catch code fills the screen for the hunter to scan. */
function QRButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => { haptic.tap(); onClick(); }} aria-label="Show my QR code"
      style={{ flex: 'none', width: 72, borderRadius: 10, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2, background: '#ede6da', color: '#0b0b0c', boxShadow: '0 0 0 2px #0b0b0c' }}>
      <IconQR s={26} /><span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.08em' }}>MY QR</span>
    </motion.button>
  );
}

function HunterPanel({ s, onScan, myFix, radio }: { s: RoomState; onScan: () => void; myFix: Fix | null; radio: Radio }) {
  const hunt = s.room.status === 'hunt';
  const visible = s.positions.filter((p) => p.role === 'runner');
  const nearest = myFix && visible.length ? Math.min(...visible.map((p) => haversine(myFix.lat, myFix.lng, p.lat, p.lng))) : null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
        <motion.button whileTap={hunt ? { scale: 0.96 } : undefined} onClick={() => { haptic.tap(); onScan(); }} disabled={!hunt} aria-label="Scan a runner's QR to catch them"
          className="btn grow" style={{ position: 'relative', overflow: 'hidden', minHeight: 76, borderRadius: 10, background: hunt ? 'var(--police)' : 'var(--surface2)', color: hunt ? '#000' : 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <IconScan s={30} />
          <span className="display" style={{ fontSize: 28 }}>{hunt ? 'Scan QR' : s.room.status === 'paused' ? 'Paused' : 'Hold position'}</span>
        </motion.button>
        <PushToTalk radio={radio} square />
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {!hunt ? 'Runners are hiding. The admin opens the hunt when the timer ends.'
          : s.reveal.active ? `${visible.length} runner${visible.length === 1 ? '' : 's'} visible now${nearest != null ? ` · nearest ≈ ${fmtDist(nearest)}` : ''}.`
          : `Runners are hidden. Next reveal in ${fmtClock(msUntil(s.reveal.next_at))}.`}
      </div>
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
              {e.data.lat != null && <button className="tag" style={{ background: '#fff', color: '#8e2e22', padding: '6px 10px' }} onClick={() => mapRef.current?.flyTo(e.data.lat, e.data.lng, 18)}>Locate</button>}
              {e.data.phone && <a className="tag" style={{ background: '#fff', color: '#8e2e22', padding: '6px 10px', textDecoration: 'none' }} href={`tel:${e.data.phone}`}>Call</a>}
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
                    <span className="tag" style={{ fontSize: 10, padding: '1px 5px', background: m.role === 'hunter' ? 'var(--hunter)' : 'var(--runner)', color: m.role === 'hunter' ? '#000' : '#0b0b0c' }}>{m.role === 'hunter' ? 'H' : 'R'}</span>
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

/* ---------- heads-up before the edge ---------- */
/** Warns a player before they step past the boundary, the safe zone or into a no-go area (beta: most "outs" were this). */
function EdgeWarning({ s, geo }: { s: RoomState; geo: Geo }) {
  const f = geo.fix; if (!f) return null;
  const r = s.room;
  const left = roomLeft(f.lat, f.lng, { boundary: r.boundary, zone: r.zone, nogo: r.nogo, buffer: r.settings.buffer_m ?? 10, hunt: r.status === 'hunt' });
  if (left == null) return null;
  const warnAt = Math.max(25, f.acc + 15);
  if (left > warnAt) return null;
  const close = left <= Math.max(10, f.acc + 5);
  return (
    <div className="cut cut-sm row" role="alert" style={{ pointerEvents: 'none', marginTop: 6, padding: '7px 12px', gap: 8, background: close ? 'var(--danger)' : '#e0a526', color: close ? '#fff' : '#0b0b0c', fontSize: 13, fontWeight: 800 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
      <span>{left <= 1 ? 'At the edge. Step back in now.' : `Near the edge: ${Math.round(left)} m before you're out. Head back in.`}</span>
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
