import { createPortal } from 'react-dom';
import { HunterAmbience, RunnerAmbience } from '../components/Ambience';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FieldReport } from '../components/Diagrams';
import { TapePiece } from '../components/Scenes';
import { LightTrails } from '../components/Art';
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
      {createPortal(s.room.winner === 'runners' ? <RunnerAmbience intensity={0.55} /> : s.room.winner === 'hunters' ? <HunterAmbience hunting={false} intensity={0.5} /> : null, document.body)}
      <div className="screen" style={{ gap: 26 }}>
        <div style={{ position: 'relative', paddingTop: 28, isolation: 'isolate', overflow: 'visible', contain: 'paint', margin: '0 -20px', padding: '28px 20px 0' }}>
          {v.win !== false && <div aria-hidden style={{ position: 'absolute', left: -20, right: -20, top: -80, height: 360, zIndex: -1, pointerEvents: 'none', maskImage: 'linear-gradient(#000 50%, transparent)', WebkitMaskImage: 'linear-gradient(#000 50%, transparent)' }}><LightTrails height="100%" /></div>}
          {[160, 260].map((d, i) => (
            <motion.span key={d} aria-hidden style={{ position: 'absolute', right: -d / 2.6, top: -d / 3, width: d, height: d, borderRadius: '50%', border: `1.5px solid ${v.win === false ? 'var(--line2)' : 'var(--accent)'}`, opacity: 0.35 - i * 0.12 }}
              initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 0.35 - i * 0.12 }} transition={{ duration: 1.4, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }} />
          ))}
          <div style={{ position: 'relative' }}>
            <div className="eyebrow">{s.room.name}, final result</div>
            <motion.h1 initial={{ opacity: 0, y: 16, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{ fontSize: 'min(19vw, 92px)', margin: '6px 0 0', fontWeight: 800, letterSpacing: '-0.055em', color: v.win === false ? 'var(--muted)' : v.win ? undefined : 'var(--text)', paddingRight: 8 }} className={`display ${v.win ? 'text-flare' : ''}`}>{v.title}</motion.h1>
            <div style={{ fontSize: 18, fontWeight: 550, marginTop: 6 }}>{reason}</div>
          </div>
        </div>
        {s.progress && <ProgressBar p={s.progress} big />}
        <div style={{ position: 'relative' }}>
          <TapePiece text="CASE FILE" rotate={-8} style={{ top: -10, left: -6 }} />
          <FieldReport members={s.members} meId={profile?.id} />
        </div>
        {meM && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)', borderRadius: 20, overflow: 'hidden' }}>
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
          <Button size="lg" block loading={sharing} onClick={share}><IconShare /> Share poster</Button>
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
/** Movie-poster result image, 1080×1350 (Instagram portrait). */
async function renderCard(s: RoomState, title: string, reason: string, me: Member | undefined, selfie: string | null): Promise<Blob> {
  await document.fonts.ready;
  const W = 1080, H = 1350; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const runner = me?.role === 'runner';
  const accent = runner ? '#ff6a1a' : me ? '#ffd400' : '#ffb27a';
  const DISPLAY = '"Archivo Variable", "Inter Variable", system-ui', BODY = '"Inter Variable", system-ui';
  const cond = (f: string) => { g.font = f; try { (g as any).fontStretch = 'condensed'; } catch { /* older browsers */ } };
  const plain = (f: string) => { g.font = f; try { (g as any).fontStretch = 'normal'; } catch { /* */ } };

  // night sky
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0b1033'); sky.addColorStop(0.45, '#2a0a18'); sky.addColorStop(0.8, '#120507'); sky.addColorStop(1, '#000');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.2, H * 0.95, 10, W * 0.2, H * 0.95, 900); glow.addColorStop(0, 'rgba(232,54,31,.55)'); glow.addColorStop(1, 'rgba(232,54,31,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // stars
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,242,224,${0.2 + rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * W, rnd() * 620, rnd() * 1.8 + 0.4, 0, Math.PI * 2); g.fill(); }
  // light trails
  const trail = (pts: number[], c1: string, c2: string, w: number) => {
    const gr = g.createLinearGradient(pts[0], pts[1], pts[6], pts[7]); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.4, c1); gr.addColorStop(1, c2);
    g.strokeStyle = gr; g.lineCap = 'round';
    for (const [lw, blur, a] of [[w * 3, 40, 0.5], [w, 12, 1]] as const) { g.save(); g.globalAlpha = a; g.lineWidth = lw; g.shadowColor = c2; g.shadowBlur = blur; g.beginPath(); g.moveTo(pts[0], pts[1]); g.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); g.stroke(); g.restore(); }
  };
  trail([-80, 1050, 260, 860, 520, 1100, 1160, 760], '#e8361f', '#ffb020', 10);
  trail([1160, 300, 820, 420, 700, 160, 200, 520], '#ffb020', '#ffd400', 6);
  // skyline
  g.fillStyle = '#060304'; let x = -10;
  while (x < W) { const w = 50 + rnd() * 90, h = 120 + rnd() * 260; g.fillRect(x, H - 150 - h, w, h + 150);
    for (let yy = H - 140 - h; yy < H - 170; yy += 26) for (let xx = x + 10; xx < x + w - 12; xx += 20) if (rnd() > 0.72) { g.fillStyle = rnd() > 0.85 ? '#fff2e0' : '#ffb020'; g.fillRect(xx, yy, 7, 9); g.fillStyle = '#060304'; }
    x += w + 4; }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 330, W, 330);

  // top billing
  plain(`600 26px ${BODY}`); g.fillStyle = 'rgba(255,242,224,.7)'; g.textAlign = 'center';
  (g as any).letterSpacing = '8px'; g.fillText('A  T A G  P R O D U C T I O N', W / 2, 86); (g as any).letterSpacing = '0px';
  // selfie medallion
  const img = await loadImg(selfieUrl(selfie));
  const cx = W / 2, cy = 300, R = 120;
  const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); ring.addColorStop(0, '#ffd400'); ring.addColorStop(0.5, accent); ring.addColorStop(1, '#e8361f');
  g.beginPath(); g.arc(cx, cy, R + 12, 0, Math.PI * 2); g.fillStyle = ring; g.shadowColor = accent; g.shadowBlur = 40; g.fill(); g.shadowBlur = 0;
  g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill();
  if (img) { g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip(); g.drawImage(img, cx - R, cy - R, R * 2, R * 2); g.restore(); }
  // title
  const tg = g.createLinearGradient(0, 470, 0, 690); tg.addColorStop(0, '#fff7b0'); tg.addColorStop(0.45, title === 'Defeat' ? '#c9c2bc' : '#ffb020'); tg.addColorStop(1, title === 'Defeat' ? '#6f625a' : '#e8361f');
  let size = 250; cond(`800 ${size}px ${DISPLAY}`); while (g.measureText(title.toUpperCase()).width > W - 120 && size > 120) { size -= 10; cond(`800 ${size}px ${DISPLAY}`); }
  g.fillStyle = tg; g.shadowColor = 'rgba(232,54,31,.6)'; g.shadowBlur = 40; g.fillText(title.toUpperCase(), W / 2, 470 + size * 0.85); g.shadowBlur = 0;
  plain(`600 40px ${BODY}`); g.fillStyle = '#fff2e0'; g.fillText(reason, W / 2, 470 + size * 0.85 + 70);
  cond(`800 54px ${DISPLAY}`); g.fillStyle = accent; g.fillText(s.room.name.toUpperCase().slice(0, 28), W / 2, 470 + size * 0.85 + 150);
  // credits block
  const lines: string[] = [];
  if (me) lines.push(`STARRING @${me.username.toUpperCase()} AS THE ${runner ? 'RUNNER' : 'HUNTER'}`);
  if (me) lines.push(`${runner ? `${me.tasks} TASKS CLEARED` : `${me.catches} RUNNERS TAGGED`}   ·   ${fmtDist(me.distance ?? 0).toUpperCase()} ON FOOT`);
  if (s.progress) lines.push(`SHARED BAR ${Math.round(s.progress.pct)}%   ·   WIN MARK ${s.progress.mark}%`);
  lines.push(`DIRECTED BY @${(s.room.admin?.username || 'ADMIN').toUpperCase()}   ·   ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}`);
  cond(`600 30px ${DISPLAY}`); g.fillStyle = 'rgba(255,242,224,.82)';
  lines.forEach((l, i) => g.fillText(l, W / 2, H - 230 + i * 42));
  plain(`600 24px ${BODY}`); g.fillStyle = 'rgba(255,242,224,.5)'; g.fillText(location.host, W / 2, H - 40);
  try { return await new Promise<Blob>((res, rej) => { try { c.toBlob((b) => (b ? res(b) : rej()), 'image/png'); } catch (e) { rej(e); } }); }
  catch { if (selfie) return renderCard(s, title, reason, me, null); throw new Error('Could not draw the poster'); }
}
