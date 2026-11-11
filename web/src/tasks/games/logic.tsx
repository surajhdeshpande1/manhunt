import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { haptic } from '../../lib/feel';
import { mulberry32 } from '../../lib/rng';
import { shuf } from '../core';
import { genLights, genNext, genOdd, genPipes, genScramble, genSum, lightsPress, pipeFlow, rot, scrambleOk, type Pipe } from '../gen';
import { Actions, Cell, Glyph, Grid, Status } from '../ui';
import type { GP } from './types';

/* 9 · LIGHTS OUT */
export function LightsOut({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genLights(seed, level, twist), [seed, level, twist]);
  const [b, setB] = useState<boolean[]>(p.board);
  const [moves, setMoves] = useState(0);
  const over = useRef(false);
  function tap(i: number) {
    if (over.current) return;
    haptic.tap();
    const nb = lightsPress(b, i, p.n, p.x); const m = moves + 1;
    setB(nb); setMoves(m);
    if (nb.every((v) => !v)) { over.current = true; haptic.ok(); setTimeout(onWin, 400); }
    else if (m >= p.limit) { over.current = true; haptic.warn(); setTimeout(() => onFail('Out of moves'), 500); }
  }
  return (
    <>
      <Status left={p.x ? 'X-flip: diagonals flip' : 'Flips the cross: ✚'} right={`${p.limit - moves} move${p.limit - moves === 1 ? '' : 's'} left`} />
      <Grid cols={p.n} gap={8} width={p.n === 3 ? 'min(70vw, 270px)' : 'min(80vw, 320px)'}>
        {b.map((v, i) => (
          <Cell key={i} label={`Light ${i + 1} ${v ? 'on' : 'off'}`} onTap={() => tap(i)} state={v ? 'lit' : 'dim'}>
            <span style={{ width: '40%', height: '40%', borderRadius: '50%', background: v ? '#0b0b0c' : 'rgba(237,230,218,.08)', boxShadow: v ? 'none' : 'inset 0 0 0 1px rgba(237,230,218,.12)' }} />
          </Cell>
        ))}
      </Grid>
      <Actions><button className="btn btn-quiet grow" onClick={() => { if (over.current) return; setB(p.board); setMoves(moves); haptic.tap(); }} title="Reset the board (moves still count)">Reset board</button></Actions>
    </>
  );
}

/* 10 · PIPELINE */
function PipeArt({ mask, lit, size }: { mask: number; lit: boolean; size: number }) {
  const c = lit ? '#e8641e' : '#6b6b73', w = size * 0.22, h = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {mask & 1 ? <rect x={h - w / 2} y={0} width={w} height={h + w / 2} fill={c} rx={2} /> : null}
      {mask & 2 ? <rect x={h - w / 2} y={h - w / 2} width={h + w / 2} height={w} fill={c} rx={2} /> : null}
      {mask & 4 ? <rect x={h - w / 2} y={h - w / 2} width={w} height={h + w / 2} fill={c} rx={2} /> : null}
      {mask & 8 ? <rect x={0} y={h - w / 2} width={h + w / 2} height={w} fill={c} rx={2} /> : null}
      <circle cx={h} cy={h} r={w * 0.62} fill={c} />
    </svg>
  );
}
export function Pipeline({ seed, level, twist, onWin }: GP) {
  const p = useMemo(() => genPipes(seed, level, twist), [seed, level, twist]);
  const [cells, setCells] = useState<Pipe[]>(p.cells);
  const over = useRef(false);
  const flow = useMemo(() => pipeFlow(cells, p.n, p.inRow, p.outRow), [cells, p]);
  const visible = useMemo(() => {
    if (!p.dark) return null;
    const v = new Set<number>([p.inRow * p.n]);
    for (const c of flow.seen) { v.add(c); const r = Math.floor(c / p.n), k = c % p.n; [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]].forEach(([a, b]) => { if (a >= 0 && b >= 0 && a < p.n && b < p.n) v.add(a * p.n + b); }); }
    return v;
  }, [flow, p]);
  useEffect(() => { if (flow.done && !over.current) { over.current = true; haptic.ok(); setTimeout(onWin, 650); } }, [flow.done]);
  function turn(i: number) {
    if (over.current || cells[i].bolted) { if (cells[i].bolted) haptic.warn(); return; }
    haptic.tap(); setCells((cs) => cs.map((c, j) => (j === i ? { ...c, rot: (c.rot + 1) % 4 } : c)));
  }
  const size = Math.floor(Math.min(330, window.innerWidth * 0.8) / p.n) - 4;
  return (
    <>
      <Status left={p.dark ? 'Blackout: light the way' : 'Connect IN to OUT'} right={`${flow.seen.size} lit`} />
      <div className="row" style={{ gap: 4, alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>{[...Array(p.n).keys()].map((r) => <div key={r} style={{ height: size, width: 22, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 900, color: r === p.inRow ? '#e8641e' : 'transparent' }}>IN▸</div>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.n}, ${size}px)`, gap: 4 }}>
          {cells.map((c, i) => {
            const hide = visible && !visible.has(i);
            return (
              <motion.button key={i} type="button" aria-label={`Pipe ${i + 1}`} onPointerDown={(e) => { e.preventDefault(); turn(i); }} whileTap={{ scale: 0.92 }}
                style={{ width: size, height: size, borderRadius: 8, background: c.bolted ? '#232327' : 'var(--surface2)', display: 'grid', placeItems: 'center', touchAction: 'manipulation',
                  boxShadow: c.bolted ? 'inset 0 0 0 2px #3a3a40' : 'inset 0 0 0 1px rgba(237,230,218,.06)', opacity: hide ? 0.3 : 1, transition: 'opacity .2s' }}>
                {!hide && <motion.div animate={{ rotate: 0 }}><PipeArt mask={rot(c.base, c.rot)} lit={flow.seen.has(i)} size={size - 6} /></motion.div>}
                {c.bolted && !hide && <span style={{ position: 'absolute', width: 5, height: 5, borderRadius: 3, background: '#8a8a92', transform: `translate(${size / 2 - 9}px, ${-size / 2 + 9}px)` }} />}
              </motion.button>
            );
          })}
        </div>
        <div className="stack" style={{ gap: 4 }}>{[...Array(p.n).keys()].map((r) => <div key={r} style={{ height: size, width: 26, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 900, color: r === p.outRow ? (flow.done ? 'var(--ok)' : '#ede6da') : 'transparent' }}>▸OUT</div>)}</div>
      </div>
    </>
  );
}

/* 15 · ODD ONE */
export function OddOne({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genOdd(seed, level, twist), [seed, level, twist]);
  const [round, setRound] = useState(0);
  const [found, setFound] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number[]>([]);
  const [miss, setMiss] = useState(0);
  const [perm, setPerm] = useState<number[] | null>(null);
  const over = useRef(false);
  const q = p.rounds[round];
  const rnd = useMemo(() => mulberry32(p.shuffleSeed + round), [p, round]);
  useEffect(() => { setPerm(null); setFound([]); setWrong([]); }, [round]);
  useEffect(() => {
    if (!p.restless) return;
    const t = setInterval(() => { setPerm(shuf([...Array(q.n * q.n).keys()], rnd)); haptic.tap(); }, 2600);
    return () => clearInterval(t);
  }, [p, q, rnd]);
  function tap(i: number) {
    if (over.current || found.includes(i) || wrong.includes(i)) return;
    if (q.odd.includes(i)) {
      haptic.ok(); const f = [...found, i]; setFound(f);
      if (f.length === q.odd.length) {
        if (round + 1 === p.rounds.length) { over.current = true; setTimeout(onWin, 400); } else setTimeout(() => setRound(round + 1), 450);
      }
    } else {
      haptic.warn(); setWrong([...wrong, i]); const m = miss + 1; setMiss(m);
      if (m > p.mistakes) { over.current = true; setTimeout(() => onFail('That one matched'), 600); }
    }
  }
  const order = perm ?? [...Array(q.n * q.n).keys()];
  const shade = (hex: string, k: number) => `color-mix(in srgb, ${hex} ${Math.round((1 - k) * 100)}%, ${k > 0 ? '#ffffff' : '#000000'})`;
  return (
    <>
      <Status left={twist === 'two' ? 'Find BOTH odd ones' : 'Find the odd one'} right={`Round ${round + 1}/${p.rounds.length}`} />
      <div>
        <motion.div key={round} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
          <Grid cols={q.n} gap={6} width={q.n >= 5 ? 'min(86vw, 340px)' : 'min(80vw, 310px)'}>
            {order.map((i) => {
              const odd = q.odd.includes(i);
              const rotd = q.rot + (odd && q.mode === 'turn' ? q.diff : 0);
              const color = odd && q.mode === 'shade' ? shade(q.color, q.diff) : q.color;
              return (
                <motion.div key={i} layout transition={{ type: 'spring', damping: 24, stiffness: 260 }}>
                  <Cell label={`Symbol ${i + 1}`} state={found.includes(i) ? 'good' : wrong.includes(i) ? 'bad' : 'idle'} onTap={() => tap(i)} style={{ width: '100%' }}>
                    <Glyph g={q.glyph} size={q.n >= 5 ? 30 : 36} color={found.includes(i) ? '#0b0b0c' : color} rot={rotd} flip={odd && q.mode === 'mirror'} scale={odd && q.mode === 'size' ? q.diff : 1} />
                  </Cell>
                </motion.div>
              );
            })}
          </Grid>
        </motion.div>
      </div>
    </>
  );
}

/* 16 · TARGET SUM */
export function TargetSum({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genSum(seed, level, twist), [seed, level, twist]);
  const [sel, setSel] = useState<number[]>([]);
  const [hidden, setHidden] = useState(false);
  const [tries, setTries] = useState(p.tries);
  const [bad, setBad] = useState(false);
  const over = useRef(false);
  useEffect(() => { if (!p.hideMs) return; const t = setTimeout(() => { setHidden(true); haptic.warn(); }, p.hideMs); return () => clearTimeout(t); }, [p]);
  function tap(i: number) {
    if (over.current) return;
    haptic.tap();
    setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < p.k ? [...s, i] : s));
  }
  function check() {
    if (sel.length !== p.k || over.current) return;
    const sum = sel.reduce((a, i) => a + p.nums[i], 0);
    if (sum === p.target) { over.current = true; haptic.ok(); setTimeout(onWin, 300); return; }
    haptic.warn(); setBad(true); setTimeout(() => { setBad(false); setSel([]); }, 650);
    if (tries <= 1) { over.current = true; setTimeout(() => onFail(`${p.pick.map((i) => p.nums[i]).join(' + ').replace(/\+ -/g, '− ')} = ${p.target}`), 700); } else setTries(tries - 1);
  }
  return (
    <>
      <div className="stack center" style={{ gap: 2 }}>
        <div className="eyebrow">Target · use exactly {p.k}</div>
        <div className="display mono" style={{ fontSize: 58, color: 'var(--police)' }}>{p.target}</div>
      </div>
      <Grid cols={p.nums.length > 9 ? 4 : 3} gap={7} width="min(86vw, 340px)">
        {p.nums.map((v, i) => (
          <Cell key={i} label={`Number ${hidden ? 'hidden' : v}`} state={bad && sel.includes(i) ? 'bad' : sel.includes(i) ? 'sel' : 'idle'} onTap={() => tap(i)} style={{ aspectRatio: '1.5' }}>
            <span className="display mono" style={{ fontSize: 24 }}>{hidden && !sel.includes(i) ? '?' : v}</span>
          </Cell>
        ))}
      </Grid>
      <Status left={hidden ? 'From memory now' : `${sel.length}/${p.k} picked`} right={`${tries} tr${tries === 1 ? 'y' : 'ies'}`} />
      <Actions><button className="btn btn-primary grow" onClick={check} disabled={sel.length !== p.k}>Check</button></Actions>
    </>
  );
}

/* 17 · NEXT NUMBER */
export function NextNumber({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genNext(seed, level, twist), [seed, level, twist]);
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = p.rounds[round];
  function choose(o: number) {
    if (picked !== null) return;
    setPicked(o);
    if (o === q.answer) {
      haptic.ok();
      setTimeout(() => { if (round + 1 === p.rounds.length) onWin(); else { setPicked(null); setRound(round + 1); } }, 450);
    } else { haptic.warn(); setTimeout(() => onFail(`It was ${q.answer}`), 700); }
  }
  return (
    <>
      <Status left={twist === 'gap' ? 'Fill the gap' : twist === 'back' ? 'What came before?' : 'What comes next?'} right={`Row ${round + 1}/${p.rounds.length}`} />
      <AnimatePresence mode="wait">
        <motion.div key={round} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center', width: 'min(92vw, 400px)' }}>
          {q.shown.map((v, i) => (
            <div key={i} className="display mono" style={{ minWidth: 52, padding: '0 8px', height: 56, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: Math.abs(v ?? 0) > 999 ? 18 : 22,
              background: v === null ? 'transparent' : 'var(--surface2)', boxShadow: v === null ? 'inset 0 0 0 2px var(--accent)' : 'none', color: v === null ? 'var(--accent)' : 'var(--text)' }}>{v ?? '?'}</div>
          ))}
          {twist !== 'gap' && <div className="display mono" style={{ minWidth: 52, height: 56, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 22, boxShadow: 'inset 0 0 0 2px var(--accent)', color: 'var(--accent)' }}>?</div>}
        </motion.div>
      </AnimatePresence>
      <Grid cols={2} gap={8} width="min(86vw, 340px)">
        {q.options.map((o) => {
          const st = picked === null ? 'idle' : o === q.answer ? 'good' : o === picked ? 'bad' : 'idle';
          return <Cell key={o} label={`Answer ${o}`} state={st} onTap={() => choose(o)} style={{ aspectRatio: '2.4' }}><span className="display mono" style={{ fontSize: 24 }}>{o}</span></Cell>;
        })}
      </Grid>
    </>
  );
}

/* 18 · SCRAMBLE */
export function Scramble({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genScramble(seed, level, twist), [seed, level, twist]);
  const [used, setUsed] = useState<number[]>([]);
  const [tries, setTries] = useState(p.tries);
  const [bad, setBad] = useState(false);
  const over = useRef(false);
  const typed = used.map((i) => p.tiles[i]).join('');
  function tap(i: number) {
    if (over.current || used.includes(i) || used.length >= p.word.length) return;
    haptic.tap(); const u = [...used, i]; setUsed(u);
    if (u.length === p.word.length) {
      const w = u.map((k) => p.tiles[k]).join('');
      if (scrambleOk(p.word, w, p.backwards)) { over.current = true; haptic.ok(); setTimeout(onWin, 350); return; }
      haptic.warn(); setBad(true); setTimeout(() => { setBad(false); setUsed([]); }, 650);
      if (tries <= 1) { over.current = true; setTimeout(() => onFail(`It was ${p.word}`), 700); } else setTries(tries - 1);
    }
  }
  return (
    <>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        {p.hint && <span className="tag" style={{ fontSize: 13 }}>{p.cat}</span>}
        <span className="tag" style={{ fontSize: 13 }}>{p.word.length} letters</span>
        {p.backwards && <span className="tag bad" style={{ fontSize: 13 }}>Spell it backwards</span>}
      </div>
      <div className="row" style={{ gap: 5, justifyContent: 'center', width: 'min(92vw, 400px)', flexWrap: 'wrap' }}>
        {Array.from({ length: p.word.length }, (_, i) => (
          <div key={i} className="display mono" style={{ width: 38, height: 46, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 22,
            background: typed[i] ? (bad ? 'var(--danger)' : 'var(--accent)') : 'var(--surface2)', color: typed[i] ? '#0b0b0c' : 'var(--faint)' }}>{typed[i] ?? '·'}</div>
        ))}
      </div>
      <div className="row" style={{ gap: 7, justifyContent: 'center', flexWrap: 'wrap', width: 'min(92vw, 400px)' }}>
        {p.tiles.map((ch, i) => (
          <motion.button key={i} type="button" aria-label={`Letter ${ch}`} data-tile={i} whileTap={{ scale: 0.9 }} disabled={used.includes(i)} onPointerDown={(e) => { e.preventDefault(); tap(i); }}
            className="display mono" style={{ width: 48, height: 54, borderRadius: 10, fontSize: 24, background: used.includes(i) ? 'transparent' : '#ede6da', color: '#0b0b0c',
              boxShadow: used.includes(i) ? 'inset 0 0 0 1px var(--line)' : '0 3px 0 #9c9183', opacity: used.includes(i) ? 0.25 : 1, touchAction: 'manipulation' }}>{ch}</motion.button>
        ))}
      </div>
      <Status left={`${tries} tr${tries === 1 ? 'y' : 'ies'} left`} />
      <Actions>
        <button className="btn btn-quiet grow" onClick={() => setUsed(used.slice(0, -1))} disabled={!used.length}>Undo</button>
        <button className="btn btn-quiet grow" onClick={() => setUsed([])} disabled={!used.length}>Clear</button>
      </Actions>
    </>
  );
}
