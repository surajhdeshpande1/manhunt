import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/supabase';
import { syncClock } from '../lib/clock';
import type { GameEvent, RoomState } from '../lib/types';
import { makeGeoFilter, rateFix, type Fix } from '../lib/geoFilter';

export type { Fix } from '../lib/geoFilter';
export type GeoStatus = 'off' | 'waiting' | 'ok' | 'weak' | 'coarse' | 'lost' | 'denied' | 'unsupported';

/** Continuous high-accuracy GPS while `on`, smoothed by the tracking filter, with a plain-words quality rating. */
export function useGeo(on: boolean, maxAcc = 35) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<GeoStatus>('off');
  const [rawAcc, setRawAcc] = useState<number | null>(null);
  const latest = useRef<Fix | null>(null);
  useEffect(() => {
    if (!on) { setStatus('off'); return; }
    if (!navigator.geolocation) { setStatus('unsupported'); return; }
    if (latest.current && Date.now() - latest.current.at > 15000) { latest.current = null; setFix(null); } // too old to show
    setStatus((s) => (s === 'ok' ? s : 'waiting'));
    const filter = makeGeoFilter();
    const began = Date.now();
    let raw: number | null = null, denied = false;
    const rate = () => { if (!denied) setStatus(rateFix(latest.current, raw, Date.now() - began, maxAcc)); };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now(), c = p.coords, ts = Number(p.timestamp);
        // the fix's own timestamp spaces readings more truly than when they reach us, if the clock behind it is sane
        const t = Number.isFinite(ts) && Math.abs(ts - now) < 10 * 60_000 ? ts : now;
        const f = filter({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, at: now, t, speed: c.speed, heading: c.heading });
        raw = c.accuracy; denied = false;
        latest.current = f; setFix(f); setRawAcc(c.accuracy); rate();
      },
      (e) => { if (e.code === e.PERMISSION_DENIED) { denied = true; setStatus('denied'); } else rate(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    const iv = window.setInterval(rate, 3000); // notices a fix going stale even when no reading arrives
    return () => { navigator.geolocation.clearWatch(id); clearInterval(iv); };
  }, [on, maxAcc]);
  return { fix, status, latest, rawAcc };
}

const LIVE = new Set(['hiding', 'hunt', 'paused']);
/** a tick's reply: room and members may be left out (null) when unchanged since the fingerprints we sent */
type Tick = Omit<RoomState, 'room' | 'members'> & { room: RoomState['room'] | null; members: RoomState['members'] | null; hashes?: { r: string; m: string } };

/** Polls the server's room_state (the "tick") and hands back everything this viewer may see. */
export function useRoom(roomId: string, onEvents?: (evs: GameEvent[], s: RoomState) => void) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<GameEvent[]>([]);
  const lastId = useRef(0);
  const primed = useRef(false);
  const cb = useRef(onEvents);
  cb.current = onEvents;
  const stRef = useRef<RoomState | null>(null);
  const timer = useRef<number>();
  const inflight = useRef(false);
  const failures = useRef(0);
  const hashes = useRef<{ r: string; m: string } | null>(null);

  const playing = !!state && LIVE.has(state.room.status) && state.me?.status === 'accepted' && !!state.me?.alive;
  // players' GPS starts in the lobby: the receiver is warm and locked on by the time the match begins, and
  // permission or precision problems show up while there is still time to fix them. Nothing is sent until then.
  const warmup = !!state && state.room.status === 'lobby' && state.me?.status === 'accepted' && !state.is_admin;
  const geo = useGeo(playing || warmup, state?.room.settings.max_acc_m ?? 35);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  const tick = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const sent = Date.now();
    const f = geoRef.current.latest.current;
    const st = stRef.current;
    const report = !!f && Date.now() - f.at < 12000 && !!st && (st.room.status === 'hiding' || st.room.status === 'hunt') && st.me?.alive;
    try {
      // say which room details and member list we already hold, so the server can leave them out if unchanged.
      // Only once the server has shown it understands this (it sent fingerprints); older servers never see it.
      const have = hashes.current && st ? hashes.current : null;
      const reply = await rpc<Tick>('room_state', {
        p_room: roomId, p_lat: report ? f!.lat : null, p_lng: report ? f!.lng : null, p_acc: report ? f!.acc : null,
        p_mock: false, p_after: lastId.current, ...(have ? { p_have: have } : {}),
      });
      const held = stRef.current;
      // nothing to fill a left-out part in from (can't normally happen): ask for everything next time
      if ((reply.room == null || reply.members == null) && !held) { hashes.current = null; throw new Error('Reconnecting…'); }
      const { hashes: h, ...rest } = reply;
      const s: RoomState = { ...rest, room: reply.room ?? held!.room, members: reply.members ?? held!.members };
      hashes.current = h ?? null;
      syncClock(s.now, sent);
      failures.current = 0;
      setError(null);
      const evs = (s.events || []).filter((e) => e.id > lastId.current);
      if (evs.length) {
        lastId.current = Math.max(lastId.current, ...evs.map((e) => e.id));
        setFeed((old) => [...old, ...evs].slice(-80));
        if (primed.current) cb.current?.(evs, s);
      }
      primed.current = true;
      stRef.current = s;
      setState(s);
    } catch (e: any) {
      failures.current++;
      if (failures.current >= 2 || !stRef.current) setError(e.message);
    } finally { inflight.current = false; }
  }, [roomId]);

  useEffect(() => {
    let dead = false;
    const loop = async () => {
      await tick();
      if (dead) return;
      const s = stRef.current?.room.status;
      const ms = s === 'hiding' || s === 'hunt' ? 2000 : s === 'paused' ? 3000 : s === 'ended' ? 15000 : 2500;
      timer.current = window.setTimeout(loop, failures.current ? Math.min(8000, ms * (1 + failures.current)) : ms);
    };
    loop();
    const vis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer.current); loop(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearTimeout(timer.current); document.removeEventListener('visibilitychange', vis); };
  }, [tick]);

  return { state, error, feed, geo, refresh: tick };
}
