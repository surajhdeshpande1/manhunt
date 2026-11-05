import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Modal, useToast } from '../components/ui';
import { realRpc } from '../lib/supabase';
import { haptic } from '../lib/feel';
import { devToken, exitDemo, forgetDev } from './mode';
import { ctl, subscribe } from './sim';

const SPEEDS = [0.5, 1, 2, 4];

/** The developer's remote control for the simulated world. Mounted only in DEMO. */
export default function DemoPanel() {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [c, setC] = useState(ctl.get());
  const [busy, setBusy] = useState<string | null>(null);
  const roomId = loc.pathname.match(/^\/room\/([^/]+)/)?.[1] ?? null;

  useEffect(() => subscribe(() => setC(ctl.get())), []);
  // the developer session must still be valid on the server
  useEffect(() => {
    const t = devToken();
    if (!t) { exitDemo(); return; }
    realRpc<boolean>('dev_check', { p_token: t }).then((ok) => { if (!ok) { forgetDev(); exitDemo(); } }).catch(() => { /* offline: keep going */ });
  }, []);

  async function quick(role: 'runner' | 'hunter' | 'admin') {
    setBusy(role);
    try { const id = await ctl.quick(role); haptic.big(); setOpen(false); nav(`/room/${id}`); toast(role === 'admin' ? 'Your match is live. Bots are hiding.' : `You're a ${role}. Hide phase has started.`); }
    finally { setBusy(null); }
  }
  function act(what: string) { if (!roomId) return; const m = ctl.act(roomId, what); haptic.tap(); toast(m); }

  return (
    <>
      <motion.button onClick={() => setOpen(true)} aria-label="Open demo controls" whileTap={{ scale: 0.94 }}
        initial={{ x: -40 }} animate={{ x: 0 }}
        style={{ position: 'fixed', left: 0, top: '42%', zIndex: 950, padding: '12px 7px 12px 5px', borderRadius: '0 10px 10px 0', background: '#c9a227', color: '#0b0b0c',
          boxShadow: '0 0 0 2px #0b0b0c, 3px 3px 0 2px #0b0b0c', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.2em' }}>
        DEMO
      </motion.button>
      <Modal open={open} onClose={() => setOpen(false)} title="Demo controls" z={960}>
        <div className="stack" style={{ gap: 18, maxHeight: '72dvh', overflowY: 'auto', paddingBottom: 6 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Simulated world: fake players, same rules. Your GPS is real, so walk around to test it.</p>

          <Group title="Start a test match here">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" kind="hot" loading={busy === 'runner'} onClick={() => quick('runner')}>As runner</Button>
              <Button size="sm" loading={busy === 'hunter'} onClick={() => quick('hunter')}>As hunter</Button>
              <Button size="sm" kind="ghost" loading={busy === 'admin'} onClick={() => quick('admin')}>As admin</Button>
            </div>
            <Hint>Builds a play area around where you're standing, adds the bots and starts the hide phase. Or use the normal app: host a room, join public ones, accept invites.</Hint>
          </Group>

          <Group title={`Bots · ${c.bots}`}>
            <input type="range" min={3} max={20} value={c.bots} onChange={(e) => ctl.set('bots', Number(e.target.value))} style={{ width: '100%', accentColor: '#c9a227' }} aria-label="Number of bots" />
            <Hint>How many fake players join new matches and ask to join rooms you host.</Hint>
          </Group>

          <Group title="Bot speed">
            <div className="row" style={{ gap: 6 }}>
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => ctl.set('speed', s)} className="tag"
                  style={{ padding: '8px 12px', fontWeight: 800, background: c.speed === s ? '#ede6da' : undefined, color: c.speed === s ? '#0b0b0c' : undefined }}>{s}×</button>
              ))}
            </div>
          </Group>

          <AnimatePresence initial={false}>
            {roomId && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Group title="Trigger in this room">
                  <Grid>
                    <A onClick={() => act('skip_hide')}>Skip hide timer</A>
                    <A onClick={() => act('reveal')}>Force reveal</A>
                    <A onClick={() => act('shrink')}>Shrink zone</A>
                    <A onClick={() => act('end_soon')}>End in 30 s</A>
                    <A onClick={() => act('bring_hunter')}>Hunter chases me</A>
                    <A onClick={() => act('catch_me')}>Catch me now</A>
                    <A onClick={() => act('my_task')}>Finish one of my tasks</A>
                    <A onClick={() => act('bring_runner')}>Runner next to me</A>
                    <A onClick={() => act('scan_nearest')}>Scan nearest runner</A>
                    <A onClick={() => act('bot_sos')}>Bot sends SOS</A>
                    <A onClick={() => act('bot_out')}>Bot leaves boundary</A>
                    <A onClick={() => act('runners_win')}>Runners win</A>
                    <A onClick={() => act('hunters_win')}>Hunters win</A>
                  </Grid>
                  <Hint>"Scan nearest runner" uses the real distance rule. Use "Runner next to me" first to get within range.</Hint>
                </Group>
              </motion.div>
            )}
          </AnimatePresence>

          <Group title="World">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" kind="quiet" onClick={() => { if (confirm('Reset the demo world? All demo rooms, players and stats start over.')) { ctl.reset(); location.replace('/home'); } }}>Reset demo world</Button>
              <Button size="sm" kind="ghost" onClick={() => exitDemo()}>Exit demo</Button>
            </div>
          </Group>
        </div>
      </Modal>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="stack" style={{ gap: 10 }}><div className="eyebrow">{title}</div>{children}</section>;
}
function Hint({ children }: { children: React.ReactNode }) { return <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{children}</div>; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>; }
function A({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="card"
      style={{ padding: '11px 12px', textAlign: 'left', fontSize: 13.5, fontWeight: 700, lineHeight: 1.25 }}>{children}</motion.button>
  );
}
