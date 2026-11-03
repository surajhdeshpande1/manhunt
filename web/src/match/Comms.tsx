import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { rpc, supabase, callFunction } from '../lib/supabase';
import { Avatar, IconMic, useToast } from '../components/ui';
import { haptic } from '../lib/feel';
import type { Member } from '../lib/types';

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
              <div className="cut cut-sm" style={{ maxWidth: '78%', padding: '7px 11px', background: mine ? 'var(--accent)' : 'var(--surface2)', color: mine ? 'var(--accent-ink)' : 'var(--text)' }}>
                {!mine && <div className="display" style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.12em' }}>@{u?.username ?? 'admin'}</div>}
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

/** Push-to-talk voice for hunters over LiveKit. */
export function PushToTalk({ roomId }: { roomId: string }) {
  const [state, setState] = useState<'idle' | 'connecting' | 'ready' | 'off' | 'error'>('idle');
  const [talking, setTalking] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const room = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);

  async function connect() {
    setState('connecting');
    try {
      const r = await callFunction<{ url: string; token: string; can_talk: boolean }>('voice-token', { room_id: roomId });
      const lk = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      lk.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) { const el = track.attach(); audioBox.current?.appendChild(el); }
      });
      lk.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      lk.on(RoomEvent.ActiveSpeakersChanged, (sp) => setSpeakers(sp.filter((p) => p.identity !== lk.localParticipant.identity).map((p) => p.name || 'hunter')));
      lk.on(RoomEvent.Disconnected, () => setState('idle'));
      await lk.connect(r.url, r.token);
      await lk.startAudio();
      room.current = lk; setCanTalk(r.can_talk); setState('ready');
    } catch (e: any) {
      setState(/not_configured/.test(e.code || e.message) ? 'off' : 'error');
    }
  }
  useEffect(() => () => { room.current?.disconnect(); }, []);

  async function press(on: boolean) {
    const lk = room.current; if (!lk || !canTalk) return;
    setTalking(on); haptic.tap();
    try { await lk.localParticipant.setMicrophoneEnabled(on); } catch { setTalking(false); }
  }

  return (
    <div className="frame soft cut">
      <div className="inner cut row" style={{ padding: 12, gap: 12 }}>
        <div ref={audioBox} style={{ display: 'none' }} />
        <div className="grow">
          <div className="display" style={{ fontSize: 17 }}>Radio</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {state === 'ready' ? (speakers.length ? `${speakers.join(', ')} talking…` : canTalk ? 'Hold to talk. Hunters only.' : 'Listening only (you are out).')
              : state === 'off' ? 'Voice isn\'t set up on this server yet.' : state === 'error' ? 'Couldn\'t connect. Tap to retry.' : 'Tap to join hunter radio.'}
          </div>
        </div>
        {state === 'ready' ? (
          <button aria-label="Hold to talk" disabled={!canTalk}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); press(true); }}
            onPointerUp={() => press(false)} onPointerCancel={() => press(false)} onContextMenu={(e) => e.preventDefault()}
            className="cut" style={{ width: 70, height: 56, display: 'grid', placeItems: 'center', background: talking ? 'var(--danger)' : 'var(--accent)', color: 'var(--accent-ink)',
              transform: talking ? 'scale(1.06)' : 'none', transition: 'all .12s', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: canTalk ? 1 : 0.4 }}>
            <IconMic s={26} />
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" disabled={state === 'connecting' || state === 'off'} onClick={connect}>
            <span className="btn-in" /><span className="btn-label">{state === 'connecting' ? <span className="spinner" /> : state === 'off' ? 'Off' : 'Join'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
