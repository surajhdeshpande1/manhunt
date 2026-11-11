import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Avatar, Section } from '../components/ui';
import { HunterAmbience } from '../components/Ambience';
import { Tape } from './Cinematics';
import { fmtClock, msUntil } from '../lib/clock';
import { titleLabel } from '../lib/identity';
import { MapView } from './MapView';
import { Chat, PushToTalk, type Radio } from './Comms';
import type { RoomState } from '../lib/types';

/**
 * Where hunters wait while runners hide. Hunters are already revealed to everyone; here they
 * see their squad, talk on the radio, plan on the area map, and count down to the hunt.
 */
export function HunterLobby({ s, radio, meId, onMenu, sos, themeKey }: { s: RoomState; radio: Radio; meId: string; onMenu: () => void; sos: ReactNode; themeKey: string }) {
  const left = msUntil(s.room.hide_ends_at);
  const paused = s.room.status === 'paused';
  const squad = s.members.filter((m) => m.role === 'hunter');
  const hiding = s.members.filter((m) => m.role === 'runner' && m.alive).length;
  const urgent = left > 0 && left <= 10_000;
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      <HunterAmbience hunting={false} intensity={0.55} />
      <div className="screen" style={{ gap: 22, position: 'relative', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
        <header className="row between">
          <div>
            <div className="eyebrow" style={{ color: 'var(--police)' }}>Hunter lobby</div>
            <div style={{ fontSize: 14, fontWeight: 650 }} className="muted">{s.room.name}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {sos}
            <button className="icon-btn" aria-label="Match menu" onClick={onMenu} style={{ background: 'var(--surface)', borderRadius: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </header>

        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '26px 22px 58px', background: '#c9a227', color: '#000' }}>
          <Tape text="HUNTERS · HOLD POSITION · HUNTERS · HOLD POSITION" rotate={-3} top="84%" dark />
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.16em', textTransform: 'uppercase' }}>{paused ? 'Match paused' : left > 0 ? 'Hunt opens in' : "Hide time's up"}</div>
          <motion.div key={left > 0 ? 'clock' : 'wait'} className="display mono" animate={urgent ? { scale: [1, 1.04, 1] } : {}} transition={{ repeat: urgent ? Infinity : 0, duration: 1 }}
            style={{ fontSize: left > 0 ? 'clamp(64px, 22vw, 108px)' : 'clamp(30px, 9vw, 44px)', lineHeight: 1, marginTop: 6, position: 'relative' }}>
            {paused ? '— —' : left > 0 ? fmtClock(left) : `Waiting for @${s.room.admin.username}`}
          </motion.div>
          <div style={{ fontSize: 14, fontWeight: 650, marginTop: 10, position: 'relative', maxWidth: 360 }}>
            {left > 0 ? `${hiding} runner${hiding === 1 ? ' is' : 's are'} hiding right now. Stay at the start point.` : 'The admin releases you any second. Get ready to move.'}
          </div>
        </div>

        <Section title={`Your squad · ${squad.length}`}>
          <div className="row scroll-x" style={{ gap: 14, paddingBottom: 4 }}>
            {squad.map((h, i) => (
              <motion.div key={h.id} className="center" style={{ flex: 'none', width: 78 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <div style={{ width: 'fit-content', margin: '0 auto', borderRadius: 10, boxShadow: `0 0 0 3px ${radio.speakers.includes(h.username) ? 'var(--danger)' : 'var(--police)'}` }}>
                  <Avatar src={h.selfie} name={h.username} size={64} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.id === meId ? 'You' : `@${h.username}`}</div>
                {titleLabel(h.title) && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--police)' }}>{titleLabel(h.title)}</div>}
              </motion.div>
            ))}
          </div>
        </Section>

        <PushToTalk radio={radio} big />

        <Section title="The play area">
          <div className="frame soft cut" style={{ height: 210, position: 'relative' }}>
            <div className="inner cut" style={{ position: 'relative', overflow: 'hidden' }}>
              <MapView themeKey={themeKey} boundary={s.room.boundary} nogo={s.room.nogo} zone={s.room.zone} interactive={false} />
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>Plan your sweep. Runners appear on your map during reveal windows once the hunt starts.</div>
        </Section>

        <Section title="Hunter channel"><Chat roomId={s.room.id} channel="hunters" members={s.members} meId={meId} height={220} compact /></Section>
      </div>
    </div>
  );
}
