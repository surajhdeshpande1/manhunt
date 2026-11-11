import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { haptic } from '../../lib/feel';
import { INK, genEmber, genInk, genSteady, genZone } from '../gen';
import { Status } from '../ui';
import type { GP } from './types';

/* 11 · DEAD ZONE */
export function DeadZone({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genZone(seed, level, twist), [seed, level, twist]);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const pos = useRef(0), dir = useRef(1), zoneAt = useRef(p.zones[0].at);
  const needle = useRef<HTMLDivElement>(null), zoneEl = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const z = p.zones[Math.min(hits, p.zones.length - 1)];
  const speed = p.speed0 + hits * p.speedStep;
  useEffect(() => {
    let raf = 0, last = performance.now(); const t0 = last;
    zoneAt.current = z.at;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      pos.current += dir.current * speed * dt;
      if (pos.current > 1) { pos.current = 1; dir.current = -1; } else if (pos.current < 0) { pos.current = 0; dir.current = 1; }
      if (p.drift) {
        const half = z.w / 2;
        zoneAt.current = Math.min(1 - half - 0.01, Math.max(half + 0.01, z.at + Math.sin((t - t0) / 900 + p.driftPhase) * 0.18));
        if (zoneEl.current) zoneEl.current.style.left = `${(zoneAt.current - half) * 100}%`;
      }
      if (needle.current) {
        needle.current.style.left = `${pos.current * 100}%`;
        if (p.ghost) needle.current.style.opacity = Math.abs(pos.current - zoneAt.current) < z.w / 2 + 0.09 ? '0' : '1';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed, z, p]);
  function lock() {
    if (done.current) return;
    if (Math.abs(pos.current - zoneAt.current) <= z.w / 2) {
      haptic.ok(); setFlash('hit'); const h = hits + 1; setHits(h);
      if (h >= p.hits) { done.current = true; setTimeout(onWin, 350); return; }
    } else {
      haptic.warn(); setFlash('miss'); const m = misses + 1; setMisses(m);
      if (m >= p.misses) { done.current = true; setTimeout(() => onFail(`Missed ${m}×`), 450); }
    }
    setTimeout(() => setFlash(null), 200);
  }
  return (
    <>
      <Status left={<>Hits <b style={{ color: 'var(--accent)' }}>{hits}/{p.hits}</b></>} right={<>Misses <b style={{ color: 'var(--danger)' }}>{misses}/{p.misses}</b></>} />
      <div onPointerDown={(e) => { e.preventDefault(); lock(); }} style={{ position: 'relative', width: 'min(88vw, 380px)', height: 88, background: 'var(--surface2)', borderRadius: 12, overflow: 'hidden', touchAction: 'manipulation' }}>
        <div ref={zoneEl} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(z.at - z.w / 2) * 100}%`, width: `${z.w * 100}%`, background: flash === 'hit' ? 'var(--ok)' : 'var(--accent)', opacity: 0.88 }} />
        {[...Array(21)].map((_, i) => <div key={i} style={{ position: 'absolute', left: `${i * 5}%`, bottom: 0, width: 1, height: i % 5 ? 8 : 16, background: 'var(--line2)' }} />)}
        <div ref={needle} style={{ position: 'absolute', top: -4, bottom: -4, width: 4, marginLeft: -2, background: flash === 'miss' ? 'var(--danger)' : '#ede6da', borderRadius: 2, transition: 'opacity .08s' }} />
      </div>
      <button className="btn btn-primary btn-lg" style={{ width: 'min(88vw, 380px)' }} onPointerDown={(e) => { e.preventDefault(); lock(); }}>LOCK</button>
    </>
  );
}

/* 12 · EMBER STRIKE */
type Target = { id: number; x: number; y: number; kind: 'good' | 'bad' | 'fake'; born: number };
export function EmberStrike({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genEmber(seed, level, twist), [seed, level, twist]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [hits, setHits] = useState(0);
  const [missed, setMissed] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const over = useRef(false), n = useRef(0), hitsRef = useRef(0), missRef = useRef(0);
  useEffect(() => {
    const spawn = window.setInterval(() => {
      if (over.current) return;
      const s = p.spawns[n.current % p.spawns.length]; const id = n.current++;
      setTargets((ts) => [...ts, { id, x: 0.08 + s.x * 0.84, y: 0.08 + s.y * 0.84, kind: s.kind, born: performance.now() }]);
    }, p.every);
    const reap = window.setInterval(() => {
      const now = performance.now();
      setTargets((ts) => {
        const gone = ts.filter((t) => now - t.born > p.life);
        const lost = gone.filter((t) => t.kind === 'good').length;
        if (lost && !over.current) {
          missRef.current += lost; setMissed(missRef.current);
          if (missRef.current > p.maxMiss) { over.current = true; haptic.warn(); setTimeout(() => onFail('Too many got away'), 300); }
        }
        return gone.length ? ts.filter((t) => now - t.born <= p.life) : ts;
      });
    }, 100);
    return () => { clearInterval(spawn); clearInterval(reap); };
  }, [p]);
  function hit(t: Target) {
    if (over.current) return;
    setTargets((ts) => ts.filter((x) => x.id !== t.id));
    if (t.kind !== 'good') { over.current = true; haptic.warn(); setTimeout(() => onFail(t.kind === 'fake' ? 'That was a fake' : 'You hit the wrong colour'), 300); return; }
    haptic.tap(); hitsRef.current++; setHits(hitsRef.current);
    if (p.swap && !swapped && hitsRef.current >= Math.ceil(p.need / 2)) { setSwapped(true); haptic.big(); }
    if (hitsRef.current >= p.need) { over.current = true; haptic.ok(); setTimeout(onWin, 300); }
  }
  // colours: "good" targets are orange until a swap, then yellow
  const colorOf = (k: Target['kind']) => (k === 'fake' ? '#b23a2b' : (k === 'good') !== swapped ? '#e8641e' : '#f2c230');
  return (
    <>
      <Status left={swapped ? <b style={{ color: '#f2c230' }}>SWAPPED · hit YELLOW now</b> : 'Hit orange · never yellow'} right={`${hits}/${p.need} · ${missed}/${p.maxMiss} lost`} />
      <div style={{ position: 'relative', width: 'min(90vw, 380px)', height: 'min(56vh, 420px)', borderRadius: 14, background: 'radial-gradient(circle at 50% 40%, #1d1d21, #111113)', boxShadow: 'inset 0 0 0 1px var(--line)', overflow: 'hidden', touchAction: 'manipulation' }}>
        <AnimatePresence>
          {targets.map((t) => (
            <motion.button key={t.id} type="button" aria-label={t.kind === 'good' ? 'Target' : 'Do not touch'} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.14 }}
              onPointerDown={(e) => { e.preventDefault(); hit(t); }}
              style={{ position: 'absolute', left: `calc(${t.x * 100}% - ${p.size / 2}px)`, top: `calc(${t.y * 100}% - ${p.size / 2}px)`, width: p.size, height: p.size, borderRadius: '50%',
                background: colorOf(t.kind), boxShadow: `0 0 0 3px #0b0b0c, 0 0 18px ${colorOf(t.kind)}88`, touchAction: 'manipulation' }}>
              <motion.span style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '3px solid rgba(11,11,12,.55)' }} initial={{ scale: 1 }} animate={{ scale: 0.2 }} transition={{ duration: p.life / 1000, ease: 'linear' }} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/* 13 · STEADY HAND */
export function SteadyHand({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genSteady(seed, level, twist), [seed, level, twist]);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  const H = Math.round(W * 1.15);
  const [prog, setProg] = useState(0);
  const [drag, setDrag] = useState(false);
  const [resets, setResets] = useState(0);
  const [dot, setDot] = useState<[number, number]>(p.pts[0]);
  const over = useRef(false);
  useEffect(() => { const w = box.current?.clientWidth; if (w) setW(w); }, []);
  const half = (i: number) => ((p.width * (p.narrow ? 1 - 0.45 * (i / (p.pts.length - 1)) : 1)) * W) / 2;
  const d = 'M' + p.pts.map(([x, y]) => `${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join(' L');
  function nearest(px: number, py: number) {
    let best = 0, bd = Infinity;
    const lo = Math.max(0, prog - 4), hi = Math.min(p.pts.length - 1, prog + 10);
    for (let i = lo; i <= hi; i++) { const dx = p.pts[i][0] * W - px, dy = p.pts[i][1] * H - py; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } }
    return { i: best, d: Math.sqrt(bd) };
  }
  function local(e: React.PointerEvent) { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number]; }
  function fault() {
    haptic.warn(); setDrag(false); setProg(0); setDot(p.pts[0]);
    const r = resets + 1; setResets(r);
    if (r > p.resets) { over.current = true; setTimeout(() => onFail('Left the track'), 300); }
  }
  function down(e: React.PointerEvent) {
    if (over.current) return;
    const [x, y] = local(e); const cur = p.pts[prog];
    if (Math.hypot(cur[0] * W - x, cur[1] * H - y) < Math.max(30, half(prog) + 14)) { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag(true); haptic.tap(); }
  }
  function move(e: React.PointerEvent) {
    if (!drag || over.current) return;
    const [x, y] = local(e); const { i, d } = nearest(x, y);
    if (d > half(i) + 6) { fault(); return; }
    setDot([x / W, y / H]);
    if (i > prog) setProg(i);
    if (i >= p.pts.length - 2) { over.current = true; setDrag(false); haptic.ok(); setTimeout(onWin, 300); }
  }
  const start = p.pts[0], end = p.pts[p.pts.length - 1];
  return (
    <>
      <Status left={drag ? 'Steady…' : prog ? 'Press the dot to carry on' : 'Press the dot and drag'} right={`${p.resets - resets} reset${p.resets - resets === 1 ? '' : 's'} left`} />
      <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
        style={{ position: 'relative', width: 'min(86vw, 340px)', height: H, borderRadius: 14, background: '#141416', boxShadow: 'inset 0 0 0 1px var(--line)', touchAction: 'none', overflow: 'hidden' }}>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <defs>
            {p.fog && <radialGradient id={`fog${seed}`}><stop offset="0.55" stopColor="#fff" /><stop offset="1" stopColor="#000" /></radialGradient>}
            {p.fog && <mask id={`fm${seed}`}><rect width={W} height={H} fill="#000" /><circle cx={dot[0] * W} cy={dot[1] * H} r={86} fill={`url(#fog${seed})`} /><circle cx={end[0] * W} cy={end[1] * H} r={26} fill="#fff" /></mask>}
          </defs>
          <g mask={p.fog ? `url(#fm${seed})` : undefined}>
            {p.narrow
              ? p.pts.slice(1).map((pt, i) => <line key={i} x1={p.pts[i][0] * W} y1={p.pts[i][1] * H} x2={pt[0] * W} y2={pt[1] * H} stroke="#2c2c32" strokeWidth={half(i) * 2} strokeLinecap="round" />)
              : <path d={d} stroke="#2c2c32" strokeWidth={half(0) * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            <path d={d} stroke="rgba(237,230,218,.25)" strokeWidth={2} fill="none" strokeDasharray="4 6" />
            <path d={'M' + p.pts.slice(0, prog + 1).map(([x, y]) => `${x * W} ${y * H}`).join(' L')} stroke="#e8641e" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <circle cx={end[0] * W} cy={end[1] * H} r={16} fill="none" stroke="var(--ok)" strokeWidth={4} />
          <circle cx={start[0] * W} cy={start[1] * H} r={6} fill="#55555c" />
        </svg>
        <div style={{ position: 'absolute', left: dot[0] * W - 15, top: dot[1] * H - 15, width: 30, height: 30, borderRadius: '50%', background: '#ede6da', boxShadow: drag ? '0 0 0 6px rgba(232,100,30,.45)' : '0 0 0 3px #0b0b0c', pointerEvents: 'none' }} />
      </div>
    </>
  );
}

/* 14 · INK */
export function Ink({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genInk(seed, level, twist), [seed, level, twist]);
  const [round, setRound] = useState(0);
  const [lives, setLives] = useState(p.lives);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const over = useRef(false), started = useRef(performance.now());
  const bar = useRef<HTMLDivElement>(null);
  const q = p.rounds[round];
  const want = q.askWord ? q.word : q.ink;
  function next(ok: boolean) {
    if (over.current) return;
    if (!ok) {
      haptic.warn(); setFlash('bad');
      if (lives <= 0) { over.current = true; setTimeout(() => onFail(q.askWord ? 'That round asked for the WORD' : 'Tap the ink, not the word'), 400); return; }
      setLives(lives - 1);
    } else { haptic.tap(); setFlash('ok'); }
    setTimeout(() => setFlash(null), 160);
    if (round + 1 >= p.rounds.length) { over.current = true; setTimeout(onWin, 250); return; }
    setRound(round + 1);
  }
  useEffect(() => {
    started.current = performance.now(); let raf = 0;
    const loop = () => {
      const f = (performance.now() - started.current) / p.ms;
      if (bar.current) bar.current.style.width = `${Math.max(0, 1 - f) * 100}%`;
      if (f >= 1) { next(false); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [round]);
  return (
    <>
      <Status left={<b style={{ color: q.askWord ? '#f2c230' : 'var(--text)' }}>{q.askWord ? 'TAP THE WORD' : 'TAP THE INK'}</b>} right={`${round + 1}/${p.rounds.length}${p.lives ? ` · ${lives} spare` : ''}`} />
      <div style={{ width: 'min(86vw, 360px)', height: 4, borderRadius: 2, background: 'var(--surface3)', overflow: 'hidden' }}><div ref={bar} style={{ height: '100%', background: 'var(--accent)' }} /></div>
      <motion.div key={round} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.12 }}
        className="display" style={{ fontSize: 'clamp(54px, 17vw, 76px)', color: INK[q.ink][1], height: 96, display: 'grid', placeItems: 'center', textShadow: flash === 'bad' ? '0 0 30px #c44536' : 'none' }}>
        {INK[q.word][0]}
      </motion.div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, width: 'min(86vw, 360px)' }}>
        {q.order.map((c) => (
          <motion.button key={c} type="button" whileTap={{ scale: 0.94 }} onPointerDown={(e) => { e.preventDefault(); next(c === want); }}
            style={{ minHeight: 58, minWidth: 0, borderRadius: 12, background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', touchAction: 'manipulation', fontWeight: 800, letterSpacing: '.04em', color: 'var(--text)', overflow: 'hidden' }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: INK[c][1], flex: 'none' }} />{INK[c][0]}
          </motion.button>
        ))}
      </div>
    </>
  );
}
