import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '../../lib/feel';
import { sfx } from '../../lib/sound';
import { mulberry32 } from '../../lib/rng';
import { genEcho, genFlash, genMirror, genPairs, genTrail } from '../gen';
import { Cell, Glyph, Grid, Status } from '../ui';
import type { GP } from './types';

/* 0 · ECHO */
export function Echo({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genEcho(seed, level, twist), [seed, level, twist]);
  const [phase, setPhase] = useState<'show' | 'input' | 'done'>('show');
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [bad, setBad] = useState<number | null>(null);
  const [layout, setLayout] = useState<number[]>(() => [...Array(p.tiles).keys()]);
  useEffect(() => {
    let alive = true, i = 0; const ts: number[] = [];
    const next = () => {
      if (!alive) return;
      if (i >= p.seq.length) { setLit(null); setLayout(p.order); setPhase('input'); return; }
      setLit(p.seq[i]); haptic.tap(); sfx.tap();
      ts.push(window.setTimeout(() => { setLit(null); i++; ts.push(window.setTimeout(next, p.gapMs)); }, p.flashMs));
    };
    ts.push(window.setTimeout(next, 700));
    return () => { alive = false; ts.forEach(clearTimeout); };
  }, [p]);
  function tap(id: number) {
    if (phase !== 'input') return;
    if (id === p.answer[step]) {
      haptic.tap(); setLit(id); setTimeout(() => setLit((l) => (l === id ? null : l)), 160);
      if (step + 1 === p.answer.length) { setPhase('done'); setTimeout(onWin, 350); } else setStep(step + 1);
    } else { setBad(id); setPhase('done'); haptic.warn(); setTimeout(() => onFail('Wrong tile'), 650); }
  }
  return (
    <>
      <Status left={phase === 'show' ? 'Watch…' : phase === 'input' ? (twist === 'reverse' ? 'Tap it backwards' : 'Your turn') : ''} right={phase === 'input' ? `${step}/${p.answer.length}` : `${p.seq.length} flashes`} />
      <Grid cols={p.cols} width={p.cols === 2 ? 'min(64vw, 260px)' : 'min(86vw, 340px)'}>
        {layout.map((id) => (
          <motion.div key={id} layout transition={{ type: 'spring', damping: 22, stiffness: 220 }}>
            <Cell label={`Tile ${id + 1}`} state={bad === id ? 'bad' : lit === id ? 'lit' : 'idle'} onTap={() => tap(id)} disabled={phase !== 'input'} style={{ width: '100%' }}>
              <Glyph g={p.glyphs[id]} size={p.cols === 2 ? 46 : 36} color={lit === id ? '#0b0b0c' : p.colors[id]} />
            </Cell>
          </motion.div>
        ))}
      </Grid>
    </>
  );
}

/* 1 · PAIRS */
export function Pairs({ seed, level, twist, onWin }: GP) {
  const p = useMemo(() => genPairs(seed, level, twist), [seed, level, twist]);
  const [order, setOrder] = useState<number[]>(() => p.deck.map((_, i) => i));
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState(0);
  const busy = useRef(false);
  const rnd = useMemo(() => mulberry32(p.swapSeed), [p]);
  function tap(i: number) {
    if (busy.current || open.includes(i) || done.has(i)) return;
    haptic.tap(); sfx.tap();
    const o = [...open, i]; setOpen(o);
    if (o.length < 2) return;
    const [a, b] = o.map((k) => p.deck[k]);
    if (a.pair === b.pair && a.pair !== -1) {
      const d = new Set(done); d.add(o[0]); d.add(o[1]); setDone(d); setOpen([]); haptic.ok();
      if (d.size === p.pairs * 2) setTimeout(onWin, 400);
    } else {
      busy.current = true; const m = misses + 1; setMisses(m);
      setTimeout(() => {
        setOpen([]); busy.current = false;
        if (p.drift && m % 3 === 0) {
          // two face-down cards trade places
          setOrder((ord) => {
            const free = ord.map((v, pos) => ({ v, pos })).filter((x) => !done.has(x.v));
            if (free.length < 2) return ord;
            const a1 = free[Math.floor(rnd() * free.length)]; let b1 = free[Math.floor(rnd() * free.length)];
            for (let t = 0; t < 8 && b1.pos === a1.pos; t++) b1 = free[Math.floor(rnd() * free.length)];
            const nx = [...ord]; nx[a1.pos] = b1.v; nx[b1.pos] = a1.v; return nx;
          });
          haptic.warn();
        }
      }, 650);
    }
  }
  return (
    <>
      <Status left={p.byColour ? 'Match by colour' : p.drift ? 'Cards drift every 3 misses' : 'Find every pair'} right={`${done.size / 2}/${p.pairs} · ${misses} miss${misses === 1 ? '' : 'es'}`} />
      <Grid cols={p.cols} gap={7} width={p.cols === 5 ? 'min(90vw, 380px)' : 'min(86vw, 340px)'}>
        {order.map((k) => {
          const c = p.deck[k]; const face = open.includes(k) || done.has(k);
          return (
            <motion.div key={k} layout transition={{ type: 'spring', damping: 24, stiffness: 240 }}>
              <motion.button type="button" aria-label={face ? `Card ${c.glyph}` : 'Hidden card'} onPointerDown={(e) => { e.preventDefault(); tap(k); }}
                animate={{ rotateY: face ? 0 : 180 }} transition={{ duration: 0.22 }}
                style={{ width: '100%', aspectRatio: '0.8', borderRadius: 10, display: 'grid', placeItems: 'center', touchAction: 'manipulation',
                  background: face ? (done.has(k) ? 'color-mix(in srgb, var(--ok) 22%, var(--surface2))' : 'var(--surface2)') : 'linear-gradient(135deg, #2a2a2f, #1f1f23)',
                  boxShadow: face ? 'inset 0 0 0 1px rgba(237,230,218,.12)' : 'inset 0 0 0 1px rgba(201,162,39,.25)' }}>
                {face ? <Glyph g={c.glyph} size={p.cols === 5 ? 30 : 36} color={c.color} /> : <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(201,162,39,.4)' }} />}
              </motion.button>
            </motion.div>
          );
        })}
      </Grid>
    </>
  );
}

/* 2 · FLASH GRID */
export function FlashGrid({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genFlash(seed, level, twist), [seed, level, twist]);
  const [phase, setPhase] = useState<'ready' | 'show' | 'move' | 'input' | 'done'>('ready');
  const [got, setGot] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number[]>([]);
  useEffect(() => {
    const ts = [window.setTimeout(() => { setPhase('show'); haptic.tap(); }, 500),
      window.setTimeout(() => setPhase(p.turn || p.mirror ? 'move' : 'input'), 500 + p.showMs),
      ...(p.turn || p.mirror ? [window.setTimeout(() => setPhase('input'), 500 + p.showMs + 900)] : [])];
    return () => ts.forEach(clearTimeout);
  }, [p]);
  function tap(i: number) {
    if (phase !== 'input' || got.has(i) || wrong.includes(i)) return;
    if (p.answer.includes(i)) {
      haptic.tap(); const g = new Set(got); g.add(i); setGot(g);
      if (g.size === p.answer.length) { setPhase('done'); setTimeout(onWin, 350); }
    } else {
      haptic.warn(); const w = [...wrong, i]; setWrong(w);
      if (w.length > p.mistakes) { setPhase('done'); setTimeout(() => onFail('Wrong square'), 700); }
    }
  }
  const transform = phase === 'move' || phase === 'input' || phase === 'done' ? `rotate(${p.turn}deg) scaleX(${p.mirror ? -1 : 1})` : 'none';
  return (
    <>
      <Status left={phase === 'show' ? 'Memorise' : phase === 'move' ? (p.turn ? 'Turning…' : 'Flipping…') : phase === 'input' ? (twist === 'inverse' ? 'Tap the ones that were dark' : 'Tap them all') : 'Get ready'}
        right={phase === 'input' ? `${got.size}/${p.answer.length}${p.mistakes ? ` · ${p.mistakes - wrong.length + (wrong.length > p.mistakes ? 1 : 0)} slip` : ''}` : undefined} />
      <div style={{ transform, transition: 'transform .8s cubic-bezier(.65,0,.35,1)' }}>
        <Grid cols={p.n} gap={p.n >= 6 ? 5 : 7} width="min(84vw, 330px)">
          {[...Array(p.n * p.n).keys()].map((i) => {
            const st = phase === 'show' && p.lit.includes(i) ? 'lit' : got.has(i) ? 'good' : wrong.includes(i) ? 'bad'
              : phase === 'done' && p.answer.includes(i) && wrong.length > p.mistakes ? 'hint' : 'idle';
            return <Cell key={i} label={`Square ${i + 1}`} state={st} onTap={() => tap(i)} disabled={phase !== 'input'} />;
          })}
        </Grid>
      </div>
    </>
  );
}

/* 3 · TRAIL */
export function Trail({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genTrail(seed, level, twist), [seed, level, twist]);
  const [shown, setShown] = useState(-1);
  const [phase, setPhase] = useState<'show' | 'input' | 'done'>('show');
  const [step, setStep] = useState(0);
  const [bad, setBad] = useState<number | null>(null);
  useEffect(() => {
    let i = 0; const ts: number[] = [];
    const tick = () => {
      if (i >= p.path.length) { ts.push(window.setTimeout(() => { setShown(-1); setPhase('input'); }, p.stepMs + 150)); return; }
      setShown(i); haptic.tap(); i++; ts.push(window.setTimeout(tick, p.stepMs));
    };
    ts.push(window.setTimeout(tick, 700));
    return () => ts.forEach(clearTimeout);
  }, [p]);
  function tap(c: number) {
    if (phase !== 'input') return;
    if (c === p.answer[step]) {
      haptic.tap();
      if (step + 1 === p.answer.length) { setStep(step + 1); setPhase('done'); setTimeout(onWin, 350); } else setStep(step + 1);
    } else { setBad(c); setPhase('done'); haptic.warn(); setTimeout(() => onFail('Off the trail'), 700); }
  }
  const head = shown >= 0 ? p.path[shown] : -1;
  return (
    <>
      <Status left={phase === 'show' ? 'Follow the path' : phase === 'input' ? (twist === 'reverse' ? 'Trace it end → start' : 'Trace it start → end') : ''} right={phase === 'input' ? `${step}/${p.answer.length}` : `${p.path.length} steps`} />
      <Grid cols={p.n} gap={6} width="min(84vw, 330px)">
        {[...Array(p.n * p.n).keys()].map((c) => {
          const idx = p.path.indexOf(c);
          const trailOn = phase === 'show' && idx >= 0 && idx <= shown && shown - idx < 3;
          const st = bad === c ? 'bad' : head === c ? 'lit' : trailOn ? 'hint' : phase !== 'show' && p.answer.slice(0, step).includes(c) ? 'good' : 'idle';
          return <Cell key={c} label={`Square ${c + 1}`} state={st} onTap={() => tap(c)} disabled={phase !== 'input'} />;
        })}
      </Grid>
    </>
  );
}

/* 19 · MIRROR */
export function Mirror({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genMirror(seed, level, twist), [seed, level, twist]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [miss, setMiss] = useState(0);
  const [flash, setFlash] = useState<'bad' | null>(null);
  const over = useRef(false);
  function tap(i: number) {
    if (over.current) return;
    haptic.tap();
    const s = new Set(sel); if (s.has(i)) s.delete(i); else s.add(i); setSel(s);
    if (s.size === p.answer.length) {
      const ok = p.answer.every((a) => s.has(a));
      if (ok) { over.current = true; haptic.ok(); setTimeout(onWin, 300); return; }
      haptic.warn(); setFlash('bad'); setTimeout(() => setFlash(null), 500);
      const m = miss + 1; setMiss(m);
      if (m > p.mistakes) { over.current = true; setTimeout(() => onFail('Not a mirror image'), 600); }
    }
  }
  const small = 'min(46vw, 170px)';
  const axis = twist === 'turn' ? 'Turn 90° clockwise' : twist === 'flip' ? 'Mirror line: across the middle' : 'Mirror line: down the middle';
  return (
    <>
      <Status left={axis} right={`${sel.size}/${p.answer.length}`} tone={flash === 'bad' ? 'bad' : undefined} />
      <div style={{ position: 'relative' }}>
        <Grid cols={p.n} gap={4} width={small}>
          {[...Array(p.n * p.n).keys()].map((i) => <div key={i} style={{ aspectRatio: '1', borderRadius: 5, background: p.src.includes(i) ? 'var(--police)' : 'var(--surface2)' }} />)}
        </Grid>
      </div>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>{twist === 'turn' ? '↻ becomes' : twist === 'flip' ? '⇅ becomes' : '⇆ becomes'}</div>
      <div style={{ position: 'relative' }}>
        <Grid cols={p.n} gap={6} width="min(80vw, 300px)">
          {[...Array(p.n * p.n).keys()].map((i) => <Cell key={i} label={`Square ${i + 1}`} state={flash === 'bad' && sel.has(i) ? 'bad' : sel.has(i) ? 'sel' : 'idle'} onTap={() => tap(i)} />)}
        </Grid>
      </div>
    </>
  );
}
