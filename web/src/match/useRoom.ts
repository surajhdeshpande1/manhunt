import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/supabase';
import { syncClock } from '../lib/clock';
import type { GameEvent, RoomState } from '../lib/types';

export type Fix = { lat: number; lng: number; acc: number; at: number };
export type GeoStatus = 'off' | 'waiting' | 'ok' | 'weak' | 'denied' | 'unsupported';

/** Continuous high-accuracy GPS while `on`. */
export function useGeo(on: boolean, maxAcc = 35) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<GeoStatus>('off');
  const latest = useRef<Fix | null>(null);
  useEffect(() => {
    if (!on) { setStatus('off'); return; }
    if (!navigator.geolocation) { setStatus('unsupported'); return; }
    setStatus((s) => (s === 'ok' ? s : 'waiting'));
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
        latest.current = f; setFix(f); setStatus(f.acc <= maxAcc ? 'ok' : 'weak');
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'weak'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on, maxAcc]);
  return { fix, status, latest };
}

const LIVE = new Set(['hiding', 'hunt', 'paused']);

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

  const playing = !!state && LIVE.has(state.room.status) && state.me?.status === 'accepted' && !!state.me?.alive;
  const geo = useGeo(playing, state?.room.settings.max_acc_m ?? 35);
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
      const s = await rpc<RoomState>('room_state', {
        p_room: roomId, p_lat: report ? f!.lat : null, p_lng: report ? f!.lng : null, p_acc: report ? f!.acc : null,
        p_mock: false, p_after: lastId.current,
      });
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
