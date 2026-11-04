import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import type { Member, Settings } from '../lib/types';
import { haptic } from '../lib/feel';
import { Silhouette } from './Scenes';

const ease = [0.22, 1, 0.36, 1] as const;
const C = { orange: '#ff6a1a', ember: '#e8361f', yellow: '#ffd400', gold: '#f2b33d', copper: '#d9772b', wine: '#4a0f1f', plum: '#2a0a18', cream: '#fff2e0', rust: '#a63a12' };

/* =====================================================================
   HOW IT WORKS — four illustrated plates, swipeable
   ===================================================================== */
function Plate({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 220" width="100%" style={{ display: 'block', borderRadius: 12, overflow: 'hidden' }} aria-hidden>
      <defs>
        <linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.plum} /><stop offset="100%" stopColor="#000" /></linearGradient>
      </defs>
      <rect width="320" height="220" fill="url(#pl-sky)" />
      {children}
    </svg>
  );
}
function Buildings({ fill = '#0d0608' }: { fill?: string }) {
  const b = [[0, 70], [34, 110], [70, 60], [104, 130], [150, 84], [188, 120], [226, 70], [262, 104], [296, 80]];
  return <>{b.map(([x, h], i) => <rect key={i} x={x} y={220 - h} width={32} height={h} fill={fill} />)}</>;
}
const PLATES: { title: string; body: string; art: ReactNode }[] = [
  {
    title: 'Runners hide',
    body: 'Roles are secret until the match starts. Runners get a head start to disappear into the campus.',
    art: (
      <Plate>
        <Buildings />
        <circle cx="160" cy="60" r="34" fill="none" stroke={C.copper} strokeOpacity=".35" strokeWidth="2" />
        <motion.circle cx="160" cy="60" r="34" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeDasharray="214" style={{ rotate: -90, transformOrigin: '160px 60px' }}
          initial={{ strokeDashoffset: 214 }} animate={{ strokeDashoffset: 60 }} transition={{ duration: 2.4, ease }} />
        <text x="160" y="66" textAnchor="middle" fill={C.cream} style={{ font: '700 17px Inter Variable, system-ui' }}>7:00</text>
        <motion.g initial={{ opacity: 0, x: 250 }} animate={{ opacity: 1, x: 232 }} transition={{ delay: 1, duration: 0.8 }}><g transform="translate(0 112)"><Silhouette pose="crouch" color={C.orange} size={78} /></g></motion.g>
        {[[64, 170], [214, 150], [128, 190]].map(([x, y], i) => (
          <g key={i}>
            <motion.circle r="12" fill={C.orange} opacity={0.25} initial={{ cx: 160, cy: 120 }} animate={{ cx: x, cy: y }} transition={{ delay: 0.3 + i * 0.25, duration: 1.4, ease }} />
            <motion.circle r="5" fill={C.orange} initial={{ cx: 160, cy: 120 }} animate={{ cx: x, cy: y }} transition={{ delay: 0.3 + i * 0.25, duration: 1.4, ease }} />
          </g>
        ))}
      </Plate>
    ),
  },
  {
    title: 'Hunters close in',
    body: 'Runners flash onto the hunters’ map at intervals. The safe zone shrinks, so there is less and less room to hide.',
    art: (
      <Plate>
        <motion.circle cx="160" cy="125" fill="none" stroke={C.cream} strokeOpacity=".5" strokeDasharray="3 6" initial={{ r: 100 }} animate={{ r: [100, 70, 100] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.path d="M250 -10 L 120 230 L 300 230 Z" fill={C.yellow} opacity=".16" style={{ transformOrigin: '250px -10px' }} animate={{ rotate: [10, -16, 10] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
        <Buildings fill="#0a0506" />
        {[[110, 120], [196, 150]].map(([x, y], i) => (
          <motion.g key={i} transform={`translate(${x} ${y})`} animate={{ opacity: [0.15, 1, 0.15] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.6 }}>
            <circle r="14" fill={C.orange} opacity=".3" /><circle r="5" fill={C.orange} />
          </motion.g>
        ))}
        <motion.g animate={{ x: [200, 170, 200] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
          <g transform="translate(0 112)"><Silhouette pose="scan" color={C.yellow} beam={C.yellow} size={92} /></g>
        </motion.g>
      </Plate>
    ),
  },
  {
    title: 'Runners clear tasks',
    body: 'Mini-games fill one shared bar. Reach the mark together and the runners win.',
    art: (
      <Plate>
        <Buildings fill="#0a0506" />
        <g transform="translate(160 112)">
          <circle r="62" fill="none" stroke="rgba(255,242,224,.1)" strokeWidth="12" />
          <motion.circle r="62" fill="none" stroke="url(#pl-prog)" strokeWidth="12" strokeLinecap="round" strokeDasharray="390" style={{ rotate: -90 }}
            initial={{ strokeDashoffset: 390 }} animate={{ strokeDashoffset: 390 * 0.32 }} transition={{ duration: 2.6, ease }} />
          <line x1="0" y1="-74" x2="0" y2="-50" stroke={C.yellow} strokeWidth="3" strokeLinecap="round" transform="rotate(252)" />
          <text y="8" textAnchor="middle" fill={C.cream} style={{ font: '800 26px Inter Variable, system-ui' }}>68%</text>
        </g>
        <defs><linearGradient id="pl-prog" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={C.ember} /><stop offset="100%" stopColor={C.yellow} /></linearGradient></defs>
      </Plate>
    ),
  },
  {
    title: 'One scan, you’re tagged',
    body: 'A hunter who gets within a few metres scans the runner’s code. GPS confirms it, and everyone hears about it.',
    art: (
      <Plate>
        <Buildings fill="#0a0506" />
        {[0, 0.5, 1].map((d) => (
          <motion.circle key={d} cx="160" cy="110" fill="none" stroke={C.yellow} strokeWidth="1.5" initial={{ r: 20, opacity: 0.8 }} animate={{ r: 110, opacity: 0 }} transition={{ duration: 2, delay: d, repeat: Infinity }} />
        ))}
        <g transform="translate(70 104)"><Silhouette pose="sprint" color={C.orange} size={96} /></g>
        <g transform="translate(150 98)"><Silhouette pose="scan" color={C.yellow} beam={C.cream} size={104} /></g>
        <g transform="translate(222 52)">
          <rect width="56" height="56" rx="10" fill={C.cream} />
          {[[8, 8], [34, 8], [8, 34]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width="14" height="14" fill="#000" /><rect x={x + 4} y={y + 4} width="6" height="6" fill={C.cream} /></g>)}
          <rect x="36" y="36" width="5" height="5" fill="#000" /><rect x="44" y="42" width="5" height="5" fill="#000" />
        </g>
      </Plate>
    ),
  },
];

export function HowItWorks({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (n: number) => { if (n < 0 || n >= PLATES.length) return; haptic.tap(); setDir(n > i ? 1 : -1); setI(n); };
  const end = (_: unknown, info: PanInfo) => { if (info.offset.x < -50) go(i + 1); else if (info.offset.x > 50) go(i - 1); };
  const p = PLATES[i];
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={i} custom={dir} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25} onDragEnd={end}
            initial={{ x: `${dir * 60}%`, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: `${-dir * 60}%`, opacity: 0 }} transition={{ duration: 0.45, ease }}>
            {p.art}
          </motion.div>
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
          <div className="display" style={{ fontSize: 26, fontWeight: 780 }}>{p.title}</div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 15.5, lineHeight: 1.5, minHeight: 70 }}>{p.body}</p>
        </motion.div>
      </AnimatePresence>
      <div className="row between">
        <div className="row" style={{ gap: 6 }}>
          {PLATES.map((_, n) => (
            <button key={n} aria-label={`Step ${n + 1}`} onClick={() => go(n)} style={{ padding: 6, margin: -6 }}>
              <motion.span animate={{ width: n === i ? 24 : 7, background: n === i ? C.orange : 'var(--line2)' }} style={{ display: 'block', height: 7, borderRadius: 4 }} />
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-hot" onClick={() => (i === PLATES.length - 1 ? onClose() : go(i + 1))}>{i === PLATES.length - 1 ? 'Got it' : 'Next'}</button>
      </div>
    </div>
  );
}

/* =====================================================================
   PHASE TIMELINE — the shape of a match, drawn to scale
   ===================================================================== */
export function PhaseTimeline({ st }: { st: Settings }) {
  const id = useId().replace(/:/g, '');
  const total = st.hide_secs + st.match_secs;
  const hideW = Math.max(12, (st.hide_secs / total) * 100);
  const huntW = 100 - hideW;
  const reveals: number[] = []; for (let t = st.reveal_every; t < st.match_secs; t += st.reveal_every) reveals.push(t / st.match_secs);
  const shrinks: number[] = []; for (let t = st.shrink_every; t < st.match_secs; t += st.shrink_every) shrinks.push(t / st.match_secs);
  const m = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
  return (
    <div className="card" style={{ padding: '18px 16px 16px', borderRadius: 12 }}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 650 }}>How this match runs</div>
        <div className="muted mono" style={{ fontSize: 13 }}>{m(total)} total</div>
      </div>
      <svg viewBox="0 0 100 26" width="100%" height="64" preserveAspectRatio="none" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <defs><linearGradient id={`${id}h`} x1="0" x2="1"><stop offset="0%" stopColor={C.ember} /><stop offset="100%" stopColor={C.yellow} /></linearGradient></defs>
        <motion.rect x="0" y="9" height="8" rx="4" fill={C.copper} initial={{ width: 0 }} animate={{ width: hideW - 0.8 }} transition={{ duration: 0.8, ease }} />
        <motion.rect x={hideW} y="9" height="8" rx="4" fill={`url(#${id}h)`} initial={{ width: 0 }} animate={{ width: huntW }} transition={{ delay: 0.5, duration: 1.1, ease }} />
        {reveals.slice(0, 40).map((r, i) => (
          <motion.rect key={`r${i}`} x={hideW + r * huntW - 0.25} y="3" width="0.5" height="5" fill={C.yellow} initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: 1 + i * 0.03 }} />
        ))}
        {shrinks.slice(0, 30).map((r, i) => (
          <motion.circle key={`s${i}`} cx={hideW + r * huntW} cy="21.5" r="1.1" fill="none" stroke="var(--text)" strokeWidth="0.35" vectorEffect="non-scaling-stroke" initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 1.2 + i * 0.04 }} />
        ))}
      </svg>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}>
        <span><span style={{ color: C.copper, fontWeight: 650 }}>Hide</span> <span className="muted">{m(st.hide_secs)}</span></span>
        <span><span style={{ color: C.orange, fontWeight: 650 }}>Hunt</span> <span className="muted">{m(st.match_secs)}</span></span>
      </div>
      <div className="row" style={{ gap: 16, marginTop: 12, fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 2, height: 10, background: C.yellow, borderRadius: 1 }} />Reveal every {m(st.reveal_every)}</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.3px solid var(--text)' }} />Zone shrinks every {m(st.shrink_every)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
        {[['Tasks', `${st.tasks_per_runner} each`], ['Win mark', `${st.win_pct}%`], ['Catch range', `${st.catch_radius_m} m`]].map(([k, v]) => (
          <div key={k} style={{ background: 'var(--quiet-fill)', borderRadius: 14, padding: '10px 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{v}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   WIN DIAL — wins against matches, as a single gauge
   ===================================================================== */
export function WinDial({ wins, matches, size = 132 }: { wins: number; matches: number; size?: number }) {
  const id = useId().replace(/:/g, '');
  const pct = matches ? wins / matches : 0;
  const R = 52, L = 2 * Math.PI * R * 0.75;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-label={`Win rate ${Math.round(pct * 100)} percent`}>
        <defs><linearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor={C.ember} /><stop offset="60%" stopColor={C.orange} /><stop offset="100%" stopColor={C.yellow} /></linearGradient></defs>
        <g transform="rotate(135 60 60)">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line2)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${L} 999`} />
          <motion.circle cx="60" cy="60" r={R} fill="none" stroke={`url(#${id}g)`} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${L} 999`}
            initial={{ strokeDashoffset: L }} animate={{ strokeDashoffset: L * (1 - pct) }} transition={{ duration: 1.4, ease, delay: 0.2 }} />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="display" style={{ fontSize: size * 0.27, fontWeight: 800 }}>{Math.round(pct * 100)}<span style={{ fontSize: size * 0.13 }}>%</span></div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: -2 }}>win rate</div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   FIELD REPORT — every player on one ring after the match
   ===================================================================== */
export function FieldReport({ members, meId }: { members: Member[]; meId?: string }) {
  const hunters = members.filter((m) => m.role === 'hunter');
  const runners = members.filter((m) => m.role === 'runner');
  const S = 300, cx = 150, cy = 150, R = 118, r = 46;
  const at = (i: number, n: number, rad: number, off = -Math.PI / 2) => [cx + rad * Math.cos(off + (i / Math.max(1, n)) * Math.PI * 2), cy + rad * Math.sin(off + (i / Math.max(1, n)) * Math.PI * 2)];
  const safe = runners.filter((m) => m.alive).length;
  return (
    <div className="card" style={{ padding: 16, borderRadius: 12 }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 650 }}>Field report</div>
        <div className="muted" style={{ fontSize: 13 }}>{safe} of {runners.length} runners made it</div>
      </div>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ display: 'block', maxWidth: 340, margin: '0 auto' }} aria-hidden>
        <defs>
          <radialGradient id="fr-core"><stop offset="0%" stopColor={C.yellow} stopOpacity=".22" /><stop offset="100%" stopColor={C.yellow} stopOpacity="0" /></radialGradient>
        </defs>
        <motion.circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line2)" strokeDasharray="2 5" initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: 90, repeat: Infinity, ease: 'linear' }} style={{ transformOrigin: `${cx}px ${cy}px` }} />
        <circle cx={cx} cy={cy} r={r + 26} fill="url(#fr-core)" />
        {runners.map((m, i) => {
          const [x, y] = at(i, runners.length, R);
          return (
            <g key={m.id}>
              {!m.alive && <motion.line x1={cx} y1={cy} x2={x} y2={y} stroke={C.ember} strokeOpacity=".35" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6 + i * 0.08, duration: 0.6 }} />}
              <motion.g initial={{ scale: 0, x, y }} animate={{ scale: 1, x, y }} transition={{ delay: 0.2 + i * 0.06, type: 'spring', damping: 14 }}>
                {m.alive ? (<><circle r="15" fill={C.orange} opacity=".22" /><circle r="8" fill={C.orange} /></>) : (<><circle r="8" fill="none" stroke={C.ember} strokeWidth="1.8" /><path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke={C.ember} strokeWidth="1.8" strokeLinecap="round" /></>)}
                {m.id === meId && <circle r="13" fill="none" stroke="var(--text)" strokeWidth="1.5" />}
              </motion.g>
            </g>
          );
        })}
        {hunters.map((m, i) => {
          const [x, y] = hunters.length === 1 ? [cx, cy] : at(i, hunters.length, r - 18);
          return (
            <motion.g key={m.id} initial={{ scale: 0, x, y }} animate={{ scale: 1, x, y }} transition={{ delay: 0.1 + i * 0.06, type: 'spring', damping: 12 }}>
              <circle r="9" fill={C.yellow} />
              {m.id === meId && <circle r="14" fill="none" stroke="var(--text)" strokeWidth="1.5" />}
            </motion.g>
          );
        })}
      </svg>
      <div className="row" style={{ gap: 16, justifyContent: 'center', fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: C.yellow }} />Hunters</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: C.orange }} />Escaped</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', border: `1.6px solid ${C.ember}` }} />Tagged</span>
      </div>
    </div>
  );
}
