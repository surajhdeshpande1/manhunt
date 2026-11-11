import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '../../lib/feel';
import { binValue, genBinary, genGlyph, genSafe, genWires, scoreGuess, type Wire } from '../gen';
import { Actions, Glyph, Keypad, Slots, Status } from '../ui';
import type { GP } from './types';

/* 4 · SAFE CRACK */
export function SafeCrack({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genSafe(seed, level, twist), [seed, level, twist]);
  const [cur, setCur] = useState<number[]>([]);
  const [rows, setRows] = useState<{ g: number[]; m: number[] }[]>([]);
  const over = useRef(false);
  const left = p.guesses - rows.length;
  function press(d: number) { if (cur.length < p.len && (p.repeats || !cur.includes(d))) { haptic.tap(); setCur([...cur, d]); } }
  function submit() {
    if (cur.length !== p.len || over.current) return;
    const m = scoreGuess(p.code, cur);
    const next = [...rows, { g: cur, m }]; setRows(next); setCur([]);
    if (m.every((x) => x === 2)) { over.current = true; haptic.ok(); setTimeout(onWin, 350); }
    else if (next.length >= p.guesses) { over.current = true; haptic.warn(); setTimeout(() => onFail(`The code was ${p.code.join('')}`), 500); }
    else haptic.tap();
  }
  const col = (x: number) => (x === 2 ? 'var(--ok)' : x === 1 ? '#f2b134' : 'var(--surface3)');
  return (
    <>
      <Status left={p.blind ? 'Blind: counts only' : p.repeats ? 'Digits can repeat' : `Digits 0–${p.max}, no repeats`} right={`${left} guess${left === 1 ? '' : 'es'} left`} />
      <div className="stack" style={{ gap: 5, width: 'min(86vw, 360px)', minHeight: 60 }}>
        {rows.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="row" style={{ gap: 6, justifyContent: 'center' }}>
            {r.g.map((d, j) => (
              <div key={j} className="display mono" style={{ width: 44, height: 44, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 22,
                background: p.blind ? 'var(--surface2)' : col(r.m[j]), color: !p.blind && r.m[j] ? '#0b0b0c' : 'var(--text)' }}>{d}</div>
            ))}
            {p.blind && (
              <div className="mono" style={{ marginLeft: 6, fontSize: 15, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--ok)' }}>● {r.m.filter((x) => x === 2).length}</span><span style={{ color: '#f2b134' }}>● {r.m.filter((x) => x === 1).length}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
      <Slots n={p.len} values={cur} />
      <Keypad keys={[...Array(p.max + 1).keys()]} cols={p.max + 1 > 6 ? 4 : 3} onKey={(k) => press(Number(k))} dim={(k) => !p.repeats && cur.includes(Number(k))} />
      <Actions>
        <button className="btn btn-quiet grow" onClick={() => setCur(cur.slice(0, -1))} disabled={!cur.length}>Delete</button>
        <button className="btn btn-primary grow" onClick={submit} disabled={cur.length !== p.len}>Try</button>
      </Actions>
    </>
  );
}

/* 6 · GLYPH LOCK */
export function GlyphLock({ seed, level, twist, onWin, onFail }: GP) {
  const p = useMemo(() => genGlyph(seed, level, twist), [seed, level, twist]);
  const [cur, setCur] = useState<number[]>([]);
  const [hidden, setHidden] = useState(false);
  const [tries, setTries] = useState(2);
  const [bad, setBad] = useState(false);
  const over = useRef(false);
  useEffect(() => { if (!p.vanishMs) return; const t = setTimeout(() => { setHidden(true); haptic.warn(); }, p.vanishMs); return () => clearTimeout(t); }, [p]);
  function key(d: number) {
    if (over.current || cur.length >= p.answer.length) return;
    haptic.tap(); const c = [...cur, d]; setCur(c);
    if (c.length === p.answer.length) {
      if (c.join() === p.answer.join()) { over.current = true; haptic.ok(); setTimeout(onWin, 300); return; }
      haptic.warn(); setBad(true); setTimeout(() => { setBad(false); setCur([]); }, 600);
      if (tries <= 1) { over.current = true; setTimeout(() => onFail(`The code was ${p.answer.join('')}`), 650); } else setTries(tries - 1);
    }
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.legend.length > 6 ? 5 : p.legend.length}, 1fr)`, gap: 6, width: 'min(86vw, 360px)' }}>
        {p.legend.map((x) => (
          <div key={x.g} className="row" style={{ gap: 4, justifyContent: 'center', padding: '8px 4px', borderRadius: 10, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            <Glyph g={x.g} size={22} color="#ede6da" />
            <span className="display mono" style={{ fontSize: 20, filter: hidden ? 'blur(7px)' : 'none', transition: 'filter .4s' }}>{hidden ? '?' : x.d}</span>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {p.code.map((g, i) => (
          <div key={i} style={{ width: 48, height: 48, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface2)', boxShadow: i < cur.length ? '0 0 0 2px var(--accent)' : 'none' }}>
            <Glyph g={g} size={28} color="var(--police)" />
          </div>
        ))}
      </div>
      <Status left={twist === 'reverse' ? 'Enter it BACKWARDS' : p.vanishMs && !hidden ? 'Legend vanishes soon' : 'Punch in the digits'} right={`${tries} tr${tries === 1 ? 'y' : 'ies'}`} />
      <Slots n={p.answer.length} values={cur} tone={bad ? 'bad' : undefined} />
      <Keypad keys={p.pad} cols={5} onKey={(k) => key(Number(k))} />
      <Actions><button className="btn btn-quiet grow" onClick={() => setCur(cur.slice(0, -1))} disabled={!cur.length}>Delete</button></Actions>
    </>
  );
}

/* 7 · BINARY */
export function Binary({ seed, level, twist, onWin }: GP) {
  const p = useMemo(() => genBinary(seed, level, twist), [seed, level, twist]);
  const [on, setOn] = useState<boolean[]>(() => Array(p.bits).fill(false));
  const over = useRef(false);
  const sum = on.reduce((s, v, i) => s + (v ? binValue(p.bits, i, p.fromLeft) : 0), 0);
  function flip(i: number) {
    if (over.current) return;
    haptic.tap(); const o = [...on]; o[i] = !o[i]; setOn(o);
    const s = o.reduce((a, v, j) => a + (v ? binValue(p.bits, j, p.fromLeft) : 0), 0);
    if (s === p.target) { over.current = true; haptic.ok(); setTimeout(onWin, 450); }
  }
  return (
    <>
      <div className="stack center" style={{ gap: 4 }}>
        <div className="eyebrow">Make</div>
        <div className="display mono" style={{ fontSize: p.expr ? 40 : 64, color: 'var(--police)' }}>{p.expr ?? p.target}</div>
      </div>
      <div className="row" style={{ gap: 6, justifyContent: 'center', width: 'min(92vw, 400px)' }}>
        {on.map((v, i) => (
          <div key={i} className="stack center" style={{ gap: 6, flex: 1, maxWidth: 52 }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', visibility: p.labels ? 'visible' : 'hidden' }}>{binValue(p.bits, i, p.fromLeft)}</span>
            <motion.button type="button" aria-label={`Switch ${i + 1}`} whileTap={{ scale: 0.92 }} onPointerDown={(e) => { e.preventDefault(); flip(i); }}
              style={{ width: '100%', height: 92, borderRadius: 12, background: v ? 'var(--accent)' : 'var(--surface2)', position: 'relative', touchAction: 'manipulation', boxShadow: 'inset 0 0 0 1px rgba(237,230,218,.1)' }}>
              <motion.span animate={{ top: v ? 8 : 50 }} style={{ position: 'absolute', left: 6, right: 6, height: 34, borderRadius: 8, background: v ? '#0b0b0c' : '#3a3a40' }} />
            </motion.button>
            <span className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{v ? 1 : 0}</span>
          </div>
        ))}
      </div>
      <Status left={p.fromLeft ? 'Values run from the left' : 'Values run from the right'} right={level <= 2 ? `= ${sum}` : undefined} />
    </>
  );
}

/* 8 · WIRE CUT */
const WCOL: Record<Wire, string> = { orange: '#e8641e', yellow: '#f2c230', black: '#141416', white: '#f1ece2', blue: '#3e7bfa' };
export const WIRE_RULES = ['Exactly one ORANGE wire → cut it.', 'Last wire is BLACK → cut the FIRST wire.', 'Two or more YELLOW → cut the LAST yellow.', 'Otherwise → cut the SECOND wire.'];
export function WireCut({ seed, level, twist, onWin, onFail, penalize }: GP) {
  const p = useMemo(() => genWires(seed, level, twist), [seed, level, twist]);
  const [cut, setCut] = useState<number | null>(null);
  const [peek, setPeek] = useState(false);
  function snip(i: number) {
    if (cut !== null) return;
    setCut(i);
    if (i === p.answer) { haptic.ok(); setTimeout(onWin, 500); }
    else { haptic.warn(); setTimeout(() => onFail(`Rule ${p.rule}: ${WIRE_RULES[p.rule - 1]}`), 700); }
  }
  const showManual = p.manual === 'open' || peek;
  return (
    <>
      <Status left={p.flip ? 'Read BOTTOM to TOP' : 'Read top to bottom'} right={`${p.wires.length} wires`} />
      <div className="stack" style={{ gap: 10, width: 'min(86vw, 360px)', padding: '14px 12px', borderRadius: 14, background: '#1b1b1f', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
        {p.wires.map((w, i) => (
          <motion.button key={i} type="button" aria-label={`Cut ${w} wire ${i + 1}`} onPointerDown={(e) => { e.preventDefault(); snip(i); }} whileTap={{ scale: 0.98 }}
            style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center', touchAction: 'manipulation' }}>
            <span style={{ width: 14, height: 22, borderRadius: 3, background: '#55555c' }} />
            {cut === i ? (
              <><span style={{ flex: 1, height: 12, borderRadius: '6px 2px 2px 6px', background: WCOL[w] }} /><span style={{ width: 18 }} /><span style={{ flex: 1, height: 12, borderRadius: '2px 6px 6px 2px', background: WCOL[w] }} /></>
            ) : <span style={{ flex: 1, height: 12, borderRadius: 6, background: WCOL[w], boxShadow: w === 'black' ? 'inset 0 0 0 1px #3a3a40' : 'none' }} />}
            <span style={{ width: 14, height: 22, borderRadius: 3, background: '#55555c' }} />
            {cut === i && <span style={{ position: 'absolute', left: '50%', top: -2, fontSize: 18, transform: 'translateX(-50%)' }}>✂</span>}
          </motion.button>
        ))}
      </div>
      {p.manual !== 'none' && (
        showManual ? (
          <div className="stack" style={{ gap: 4, width: 'min(86vw, 360px)', padding: 12, borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            {WIRE_RULES.map((t, i) => <div key={i} style={{ fontSize: 13, fontWeight: 600 }}><span className="mono" style={{ color: 'var(--police)' }}>{i + 1} · </span>{t}</div>)}
          </div>
        ) : <button className="btn btn-quiet" onClick={() => { penalize(5000); setPeek(true); haptic.warn(); }}>Peek at the manual (−5 s)</button>
      )}
      {p.manual === 'none' && <div className="muted" style={{ fontSize: 13 }}>No manual this time. You know the 4 rules.</div>}
    </>
  );
}
