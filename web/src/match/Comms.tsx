import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { rpc, supabase, callFunction } from '../lib/supabase';
import { Avatar, IconMic, useToast } from '../components/ui';
import { haptic } from '../lib/feel';
import type { Member } from '../lib/types';
import { DEMO } from '../demo/mode';

type Msg = { id: number; user_id: string; body: string; at: string };

/** Realtime text chat for a room channel ('lobby' or 'hunters'). */
export function Chat({ roomId, channel, members, meId, height = 280, compact }: { roomId: string; channel: 'lobby' | 'hunters'; members: Member[]; meId: string; height?: number | string; compact?: boolean }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const byId = new Map(members.map((m) => [m.id, m]));

  useEffect(() => {
    if (DEMO) {
      let off = () => {};
      let alive = true;
      import('../demo/sim').then((sim) => {
        if (!alive) return;
        setMsgs(sim.messages(roomId, channel) as Msg[]);
        off = sim.onMessage((m) => {
          if (m.room_id !== roomId || m.channel !== channel) return;
          setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m].slice(-100)));
          if (m.user_id !== meId) haptic.tap();
        });
      });
      return () => { alive = false; off(); };
    }
    let alive = true;
    supabase.from('messages').select('id,user_id,body,at').eq('room_id', roomId).eq('channel', channel).order('id', { ascending: false }).limit(60)
      .then(({ data }) => { if (alive && data) setMsgs(data.reverse() as Msg[]); });
    const ch = supabase.channel(`msg-${roomId}-${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (p) => {
        const m = p.new as Msg & { channel: string };
        if (m.channel !== channel) return;
        setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m].slice(-100)));
        if (m.user_id !== meId) haptic.tap();
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [roomId, channel, meId]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim(); if (!body) return;
    setSending(true);
    try { await rpc('send_message', { p_room: roomId, p_channel: channel, p_body: body }); setText(''); }
    catch (e: any) { toast(e.message, true); } finally { setSending(false); }
  }
  const quick = channel === 'hunters' ? ['On my way', 'Spotted one', 'North side', 'Need backup', 'Cover the exit'] : [];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div ref={list} style={{ height, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
        {msgs.length === 0 && <div className="muted center" style={{ margin: 'auto', fontSize: 14 }}>{channel === 'hunters' ? 'Hunters-only channel. Runners can\'t see this.' : 'Say hi to the squad.'}</div>}
        {msgs.map((m) => {
          const u = byId.get(m.user_id); const mine = m.user_id === meId;
          return (
            <div key={m.id} className="row" style={{ alignItems: 'flex-end', gap: 8, flexDirection: mine ? 'row-reverse' : 'row' }}>
              {!compact && <Avatar src={u?.selfie} name={u?.username} size={26} />}
              <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: mine ? '18px 18px 6px 18px' : '18px 18px 18px 6px', background: mine ? 'var(--accent)' : 'var(--surface2)', color: mine ? 'var(--accent-ink)' : 'var(--text)' }}>
                {!mine && <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>@{u?.username ?? 'admin'}</div>}
                <div style={{ fontSize: 14, wordBreak: 'break-word' }}>{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      {quick.length > 0 && (
        <div className="row scroll-x" style={{ gap: 6 }}>
          {quick.map((q) => <button key={q} className="tag" style={{ padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => rpc('send_message', { p_room: roomId, p_channel: channel, p_body: q }).catch((e) => toast(e.message, true))}>{q}</button>)}
        </div>
      )}
      <form className="row" style={{ gap: 8 }} onSubmit={send}>
        <div className="input-wrap cut grow" style={{ ['--c' as any]: '7px' }}>
          <input className="input" style={{ height: 44 }} maxLength={300} placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" style={{ minHeight: 46 }} disabled={sending || !text.trim()} type="submit">Send</button>
      </form>
    </div>
  );
}

/** Hunter radio over LiveKit. Lives at match level so the line stays open from the hunter lobby into the hunt. */
export type Radio = { state: 'idle' | 'connecting' | 'ready' | 'off' | 'error'; canTalk: boolean; talking: boolean; speakers: string[]; connect: () => void; press: (on: boolean) => void };
export function useRadio(roomId: string): Radio {
  const [state, setState] = useState<Radio['state']>('idle');
  const [talking, setTalking] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const room = useRef<Room | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const d = document.createElement('div'); d.style.display = 'none'; document.body.appendChild(d); box.current = d;
    return () => { room.current?.disconnect(); room.current = null; d.remove(); };
  }, []);
  async function connect() {
    if (state === 'connecting' || state === 'ready') return;
    setState('connecting');
    try {
      const r = await callFunction<{ url: string; token: string; can_talk: boolean }>('voice-token', { room_id: roomId });
      const lk = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      lk.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) { const el = track.attach(); box.current?.appendChild(el); } });
      lk.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      lk.on(RoomEvent.ActiveSpeakersChanged, (sp) => setSpeakers(sp.filter((x) => x.identity !== lk.localParticipant.identity).map((x) => x.name || 'hunter')));
      lk.on(RoomEvent.Disconnected, () => { setState('idle'); setTalking(false); });
      await lk.connect(r.url, r.token);
      await lk.startAudio();
      room.current = lk; setCanTalk(r.can_talk); setState('ready'); haptic.ok();
    } catch (e: any) {
      setState(/not_configured/.test(e.code || e.message) ? 'off' : 'error');
    }
  }
  async function press(on: boolean) {
    const lk = room.current; if (!lk || !canTalk) return;
    setTalking(on); haptic.tap();
    try { await lk.localParticipant.setMicrophoneEnabled(on); } catch { setTalking(false); }
  }
  return { state, canTalk, talking, speakers, connect, press };
}

/** Push-to-talk control. `big` is the hunter-lobby version. */
export function PushToTalk({ radio, big }: { radio: Radio; big?: boolean }) {
  const { state, canTalk, talking, speakers } = radio;
  const sub = state === 'ready' ? (speakers.length ? `${speakers.join(', ')} talking…` : canTalk ? 'Hold to talk. Hunters only.' : 'Listening only.')
    : state === 'off' ? 'Voice isn\'t set up on this server yet.' : state === 'error' ? 'Couldn\'t connect. Tap to retry.' : 'Tap to join the hunter radio.';
  const ptt = (
    <button aria-label="Hold to talk" disabled={!canTalk}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); radio.press(true); }}
      onPointerUp={() => radio.press(false)} onPointerCancel={() => radio.press(false)} onContextMenu={(e) => e.preventDefault()}
      style={{ width: big ? 132 : 70, height: big ? 132 : 56, borderRadius: big ? '50%' : 10, display: 'grid', placeItems: 'center', background: talking ? 'var(--danger)' : 'var(--accent)', color: 'var(--accent-ink)',
        transform: talking ? 'scale(1.06)' : 'none', transition: 'all .12s', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: canTalk ? 1 : 0.4,
        boxShadow: talking ? '0 0 0 10px rgba(196,69,54,.25), 0 0 40px rgba(196,69,54,.5)' : speakers.length ? '0 0 0 8px rgba(201,162,39,.25)' : 'none' }}>
      <div className="stack center" style={{ gap: 2 }}><IconMic s={big ? 44 : 26} />{big && <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.12em' }}>{talking ? 'ON AIR' : 'HOLD'}</span>}</div>
    </button>
  );
  if (big) {
    return (
      <div className="card card-pad stack center" style={{ gap: 14, padding: 22 }}>
        <div className="eyebrow">Hunter radio</div>
        {state === 'ready' ? ptt : (
          <button className="btn btn-hot btn-lg" disabled={state === 'connecting' || state === 'off'} onClick={radio.connect} style={{ minWidth: 220 }}>
            {state === 'connecting' ? <span className="spinner" /> : state === 'off' ? 'Radio off' : state === 'error' ? 'Retry radio' : 'Join radio'}
          </button>
        )}
        <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>{sub}</div>
      </div>
    );
  }
  return (
    <div className="frame soft cut">
      <div className="inner cut row" style={{ padding: 12, gap: 12 }}>
        <div className="grow">
          <div className="display" style={{ fontSize: 17 }}>Radio</div>
          <div className="muted" style={{ fontSize: 12 }}>{sub}</div>
        </div>
        {state === 'ready' ? ptt : (
          <button className="btn btn-ghost btn-sm" disabled={state === 'connecting' || state === 'off'} onClick={radio.connect}>
            <span className="btn-in" /><span className="btn-label">{state === 'connecting' ? <span className="spinner" /> : state === 'off' ? 'Off' : 'Join'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
