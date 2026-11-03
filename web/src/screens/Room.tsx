import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui';
import { useSession } from '../lib/session';
import { setTheme, type ThemeName } from '../lib/theme';
import { notify, haptic } from '../lib/feel';
import type { GameEvent, RoomState } from '../lib/types';
import { useRoom } from '../match/useRoom';
import { AdminLobby, NotIn, PlayerLobby, Waiting } from '../match/Lobby';
import { Match, eventText } from '../match/Match';
import { Result, verdict, END_REASON } from '../match/Result';
import { CinemaLayer, RoleReveal, useCinema } from '../match/Cinematics';

export default function RoomScreen() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { profile } = useSession();
  const cinema = useCinema();
  const prevReveal = useRef<boolean | null>(null);

  const onEvents = useCallback((evs: GameEvent[], s: RoomState) => {
    const byId = new Map(s.members.map((m) => [m.id, m]));
    for (const e of evs) {
      const text = eventText(e, byId, s.is_admin);
      if (e.kind === 'hunt') { cinema.play({ k: 'hunt' }); notify('The hunt is on', s.me?.role === 'runner' ? 'Hunters are moving. Start your tasks.' : 'Go get them.', 'hunt'); }
      else if (e.kind === 'caught') {
        cinema.play({ k: 'caught', who: byId.get(e.target!), by: e.actor ? byId.get(e.actor) : undefined });
        notify('Runner caught', text ?? '', `c${e.id}`);
      } else if (e.kind === 'eliminated') {
        cinema.play({ k: 'alert', title: 'Player out', sub: text ?? undefined, tone: 'danger' });
        notify('Player out', text ?? '', `e${e.id}`);
      } else if (e.kind === 'shrink') { cinema.play({ k: 'alert', title: 'Zone shrinking', sub: `New circle · ${Math.round(e.data.r)} m` }); notify('Zone shrinking', 'Get inside the new circle.', 'shrink'); }
      else if (e.kind === 'broadcast') { cinema.play({ k: 'broadcast', text: e.data.text }); notify('Admin', e.data.text, `b${e.id}`); }
      else if (e.kind === 'pause' || e.kind === 'resume') cinema.play({ k: 'alert', title: e.kind === 'pause' ? 'Paused' : 'Resumed' });
      else if (e.kind === 'sos' && s.is_admin) { haptic.alarm(); cinema.play({ k: 'alert', title: 'SOS', sub: `@${e.data.username} needs help`, tone: 'danger' }); notify('SOS', `@${e.data.username} needs help`, `s${e.id}`); }
      else if (e.kind === 'end') {
        const v = verdict(s);
        cinema.play({ k: 'result', title: v.title, sub: END_REASON[s.room.end_reason ?? ''] ?? '', win: v.win });
        notify(v.title, END_REASON[s.room.end_reason ?? ''] ?? 'Match over', 'end');
      }
    }
  }, [cinema.play]);

  const { state: s, error, feed, geo, refresh } = useRoom(id, onEvents);

  // reveal windows start → alert
  useEffect(() => {
    if (!s) return;
    const on = !!s.reveal.active && s.room.status === 'hunt';
    if (on && prevReveal.current === false && !s.is_admin) {
      const runner = s.me?.role === 'runner';
      cinema.play({ k: 'alert', title: runner ? "You're exposed" : 'Runners revealed', sub: runner ? 'Hunters can see you' : 'Move now', tone: runner ? 'danger' : 'accent' });
      notify(runner ? "You're exposed" : 'Runners revealed', runner ? 'Hunters can see your location.' : 'Runners are on your map.', 'reveal');
    }
    prevReveal.current = on;
  }, [s?.reveal.active, s?.room.status]);

  // role reveal once per match
  const revealKey = s && s.me?.role && s.room.hide_ends_at ? `tag-role-${id}-${s.room.hide_ends_at}` : null;
  const [seen, setSeen] = useState(true);
  useEffect(() => { if (revealKey) setSeen(!!sessionStorage.getItem(revealKey)); }, [revealKey]);
  const showReveal = !!s && !s.is_admin && !!s.me?.role && s.me.status === 'accepted' && (s.room.status === 'hiding' || s.room.status === 'hunt' || s.room.status === 'paused') && !seen;

  // theme
  const theme: ThemeName = !s || s.is_admin || s.room.status === 'lobby' || !s.me?.role ? 'neutral'
    : s.me.role === 'hunter' ? 'hunter' : showReveal ? 'runner' : 'runner-ink';
  useEffect(() => { setTheme(theme); return () => setTheme('neutral'); }, [theme]);

  if (!s) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        {error ? (<><p>{error}</p><Button kind="ghost" onClick={() => nav('/home')}>Back to rooms</Button></>) : <span className="spinner" style={{ color: 'var(--accent)' }} />}
      </div>
    );
  }

  const st = s.room.status;
  const inRoom = s.is_admin || s.me?.status === 'accepted';
  let body;
  if (s.me?.status === 'pending' && st === 'lobby') body = <Waiting s={s} />;
  else if (!inRoom && !(st === 'ended' && s.me?.role)) body = <NotIn s={s} />;
  else if (st === 'lobby') body = s.is_admin ? <AdminLobby s={s} refresh={refresh} themeKey={theme} /> : <PlayerLobby s={s} themeKey={theme} />;
  else if (st === 'ended') body = <Result s={s} />;
  else body = <Match s={s} feed={feed} geo={geo} refresh={refresh} themeKey={theme} />;

  return (
    <>
      {body}
      {error && <div className="cut cut-sm" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 12px)', zIndex: 800, padding: '10px 14px', background: 'var(--danger)', color: '#fff', fontWeight: 600, fontSize: 14 }}>Connection lost. Retrying…</div>}
      <AnimatePresence>
        {showReveal && profile && (
          <RoleReveal key="reveal" role={s.me!.role!} hunters={s.members.filter((m) => m.role === 'hunter')} hideSecs={s.room.settings.hide_secs}
            onDone={() => { if (revealKey) sessionStorage.setItem(revealKey, '1'); setSeen(true); }} />
        )}
      </AnimatePresence>
      <CinemaLayer current={cinema.current} next={cinema.next} />
    </>
  );
}
