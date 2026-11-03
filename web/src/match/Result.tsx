import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Avatar, Button, IconShare, Section, Slash, useToast } from '../components/ui';
import { fmtDist } from '../lib/clock';
import { useSession } from '../lib/session';
import { selfieUrl } from '../lib/supabase';
import { ProgressBar } from './Match';
import type { Member, RoomState } from '../lib/types';

export const END_REASON: Record<string, string> = {
  tasks: 'Runners hit the mark', all_caught: 'Every runner was caught', mark_unreachable: 'Too many runners caught to reach the mark',
  no_hunters: 'No hunters left in the game', time: 'Time ran out before the mark', curfew: 'Curfew reached', admin: 'Ended by the admin', closed: 'Room closed',
};
export function verdict(s: RoomState) {
  const w = s.room.winner; const role = s.me?.role;
  if (!w || w === 'none') return { title: s.room.end_reason === 'curfew' ? 'Curfew' : 'Match over', win: null as boolean | null };
  if (s.is_admin || !role) return { title: w === 'runners' ? 'Runners win' : 'Hunters win', win: null };
  const won = (w === 'runners' && role === 'runner') || (w === 'hunters' && role === 'hunter');
  return { title: won ? 'Victory' : 'Defeat', win: won };
}

export function Result({ s }: { s: RoomState }) {
  const nav = useNavigate();
  const toast = useToast();
  const { profile, refresh } = useSession();
  const [sharing, setSharing] = useState(false);
  const v = verdict(s);
  const reason = END_REASON[s.room.end_reason ?? ''] ?? '';
  const players = s.members.filter((m) => m.role);
  const meM = players.find((m) => m.id === profile?.id);
  const top = useMemo(() => {
    const by = (f: (m: Member) => number) => [...players].sort((a, b) => f(b) - f(a))[0];
    return [
      { t: 'Top hunter', m: by((m) => (m.role === 'hunter' ? m.catches : -1)), v: (m: Member) => `${m.catches} catches` },
      { t: 'Task machine', m: by((m) => (m.role === 'runner' ? m.tasks : -1)), v: (m: Member) => `${m.tasks} tasks` },
      { t: 'Most ground', m: by((m) => m.distance ?? 0), v: (m: Member) => fmtDist(m.distance ?? 0) },
    ].filter((x) => x.m);
  }, [players]);

  async function share() {
    setSharing(true);
    try {
      const blob = await renderCard(s, v.title, reason, meM, profile?.selfie_path ?? null);
      const file = new File([blob], `tag-${s.room.name.replace(/\W+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'TAG', text: `${v.title} in ${s.room.name} on TAG` });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Result card saved'); }
    } catch { /* cancelled */ } finally { setSharing(false); }
  }

  return (
    <Slash>
      <div className="screen" style={{ gap: 26 }}>
        <div style={{ position: 'relative', paddingTop: 24 }}>
          <motion.div aria-hidden style={{ position: 'absolute', left: -40, right: -40, top: 58, height: 64, background: v.win === false ? 'var(--surface3)' : 'var(--accent)', skewY: -5, zIndex: 0 }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4 }} />
          <div style={{ position: 'relative' }}>
            <div className="eyebrow">{s.room.name} · final</div>
            <h1 className="display" style={{ fontSize: 'min(20vw, 96px)', margin: '4px 0 0', fontWeight: 800, color: v.win === false ? 'var(--muted)' : 'var(--text)' }}>{v.title}</h1>
            <div className="display" style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>{reason}</div>
          </div>
        </div>
        {s.progress && <ProgressBar p={s.progress} big />}
        {meM && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)' }} className="cut">
            {[['Role', meM.role === 'hunter' ? 'Hunter' : 'Runner'], [meM.role === 'hunter' ? 'Catches' : 'Tasks', meM.role === 'hunter' ? meM.catches : meM.tasks], ['Moved', fmtDist(meM.distance ?? 0)]].map(([k, val]) => (
              <div key={k as string} style={{ background: 'var(--surface)', padding: '14px 12px' }}>
                <div className="display mono" style={{ fontSize: 26 }}>{val}</div>
                <div className="eyebrow" style={{ fontSize: 10 }}>{k}</div>
              </div>
            ))}
          </div>
        )}
        <Section title="Standouts">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {top.map((x) => (
              <div key={x.t} className="card center" style={{ padding: '14px 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar src={x.m!.selfie} name={x.m!.username} size={52} /></div>
                <div className="eyebrow" style={{ fontSize: 9, marginTop: 8 }}>{x.t}</div>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{x.m!.username}</div>
                <div className="muted mono" style={{ fontSize: 12 }}>{x.v(x.m!)}</div>
              </div>
            ))}
          </div>
        </Section>
        <Section title={`All players · ${players.length}`}>
          <div className="card" style={{ padding: '0 14px' }}>
            {[...players].sort((a, b) => (a.role === b.role ? (b.tasks + b.catches * 3) - (a.tasks + a.catches * 3) : a.role === 'hunter' ? -1 : 1)).map((m) => (
              <div key={m.id} className="list-row">
                <Avatar src={m.selfie} name={m.username} size={36} out={!m.alive} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>@{m.username}</b> {m.id === profile?.id && <span className="tag" style={{ fontSize: 10 }}>You</span>}
                  <div className="muted" style={{ fontSize: 11 }}>{m.role === 'hunter' ? 'Hunter' : 'Runner'} · {m.alive ? 'made it' : m.out_reason === 'caught' ? 'caught' : 'out'}</div>
                </div>
                <div className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{m.role === 'hunter' ? `${m.catches} ✕` : `${m.tasks} ▣`}<div className="muted" style={{ fontSize: 11 }}>{fmtDist(m.distance ?? 0)}</div></div>
              </div>
            ))}
          </div>
        </Section>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Everyone's location data from this match has been deleted.</p>
        <div className="stack">
          <Button size="lg" block loading={sharing} onClick={share}><IconShare /> Share result</Button>
          <Button kind="ghost" block onClick={() => { refresh(); nav('/home'); }}>Back to rooms</Button>
        </div>
      </div>
    </Slash>
  );
}

async function loadImg(src: string | null) {
  if (!src) return null;
  return new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function renderCard(s: RoomState, title: string, reason: string, me: Member | undefined, selfie: string | null) {
  await document.fonts.ready;
  const W = 1080, H = 1350; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const runner = me?.role === 'runner';
  const bg = runner ? '#120e0b' : '#060a14', accent = runner ? '#ff6214' : me ? '#ffd000' : '#ff4a1c', text = '#f3ede2', muted = '#9c9183';
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(243,237,226,.06)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.save(); g.translate(0, 470); g.transform(1, -0.09, 0, 1, 0, 0); g.fillStyle = accent; g.fillRect(-40, 0, W + 80, 200); g.restore();
  g.fillStyle = muted; g.font = '600 34px "Barlow Condensed"'; g.fillText('TAG // LIVE MANHUNT', 80, 120);
  g.fillStyle = text; g.font = '700 46px "Barlow Condensed"'; g.fillText(s.room.name.toUpperCase().slice(0, 30), 80, 180);
  g.save(); g.translate(80, 610); g.transform(1, 0, -0.14, 1, 0, 0); g.fillStyle = bg; g.font = '800 220px "Barlow Condensed"'; g.fillText(title.toUpperCase(), 0, 0); g.restore();
  g.fillStyle = text; g.font = '600 40px "Barlow Condensed"'; g.fillText(reason.toUpperCase(), 80, 760);
  const p = s.progress;
  if (p) {
    g.fillStyle = '#2d2822'; g.fillRect(80, 820, W - 160, 26);
    g.fillStyle = accent; g.fillRect(80, 820, ((W - 160) * Math.min(100, p.pct)) / 100, 26);
    g.fillStyle = text; g.fillRect(80 + ((W - 160) * p.mark) / 100 - 3, 806, 6, 54);
    g.font = '700 44px "Barlow Condensed"'; g.fillText(`${Math.round(p.pct)}%  ·  MARK ${p.mark}%`, 80, 910);
  }
  const img = await loadImg(selfieUrl(selfie));
  if (img) { g.save(); g.beginPath(); g.moveTo(80, 980); g.lineTo(300, 980); g.lineTo(320, 1000); g.lineTo(320, 1220); g.lineTo(100, 1220); g.lineTo(80, 1200); g.closePath(); g.clip(); g.drawImage(img, 80, 980, 240, 240); g.restore(); }
  if (me) {
    g.fillStyle = text; g.font = '700 60px "Barlow Condensed"'; g.fillText(`@${me.username}`.toUpperCase(), 360, 1040);
    g.fillStyle = accent; g.font = '700 40px "Barlow Condensed"'; g.fillText(runner ? 'RUNNER' : 'HUNTER', 360, 1094);
    g.fillStyle = muted; g.font = '600 40px "Barlow Condensed"';
    g.fillText(`${runner ? `${me.tasks} TASKS` : `${me.catches} CATCHES`}  ·  ${fmtDist(me.distance ?? 0).toUpperCase()} MOVED`, 360, 1150);
  }
  g.fillStyle = muted; g.font = '600 30px "Barlow Condensed"'; g.fillText(location.host.toUpperCase(), 80, H - 70);
  try { return await new Promise<Blob>((res, rej) => { try { c.toBlob((b) => (b ? res(b) : rej()), 'image/png'); } catch (e) { rej(e); } }); }
  catch { if (selfie) return renderCard(s, title, reason, me, null); throw new Error('Could not draw the card'); }
}
