import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { mulberry32, shuffle } from '../lib/rng';
import { haptic } from '../lib/feel';

export type GameProps = { seed: number; onWin: () => void; onFail: (why: string) => void };
export const GAME_INFO = [
  { name: 'Pattern Lock', brief: 'Watch 6 cells light up, then tap them back in order. One slip and it locks.' },
  { name: 'Cipher', brief: 'Shift each letter back to decode the word. Two tries.' },
  { name: 'Code Breaker', brief: 'Crack the 4-digit code (0–7, no repeats) in 7 guesses. ● = right spot, ○ = wrong spot.' },
  { name: 'Dead Zone', brief: 'Lock the needle inside the zone 3 times. It speeds up. 2 misses and you\'re out.' },
  { name: 'Riddle Run', brief: 'Answer 3 in a row, 20 seconds each.' },
];

/* ---------- 1. PATTERN LOCK ---------- */
export function MemoryGame({ seed, onWin, onFail }: GameProps) {
  const rnd = useMemo(() => mulberry32(seed), [seed]);
  const seq = useMemo(() => shuffle([...Array(16).keys()], rnd).slice(0, 6), [rnd]);
  const [phase, setPhase] = useState<'ready' | 'show' | 'input' | 'done'>('ready');
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== 'show') return;
    let i = 0; let alive = true;
    const next = () => {
      if (!alive) return;
      if (i >= seq.length) { setLit(null); setPhase('input'); return; }
      setLit(seq[i]); haptic.tap();
      setTimeout(() => { setLit(null); i++; setTimeout(next, 170); }, 480);
    };
    const t = setTimeout(next, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [phase, seq]);
  function tap(c: number) {
    if (phase !== 'input') return;
    if (c === seq[step]) {
      haptic.tap(); setLit(c); setTimeout(() => setLit(null), 150);
      if (step + 1 === seq.length) { setPhase('done'); setTimeout(onWin, 350); } else setStep(step + 1);
    } else { setWrong(c); setPhase('done'); haptic.warn(); setTimeout(() => onFail('Wrong cell'), 700); }
  }
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 18 }}>
      <div className="eyebrow">{phase === 'show' ? 'Memorise' : phase === 'input' ? `Repeat · ${step}/${seq.length}` : phase === 'ready' ? 'Ready?' : ''}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: 'min(84vw, 340px)' }}>
        {[...Array(16).keys()].map((c) => {
          const on = lit === c, bad = wrong === c, shouldBe = wrong !== null && seq[step] === c;
          return (
            <button key={c} onClick={() => tap(c)} aria-label={`Cell ${c + 1}`} className="cut cut-sm"
              style={{ aspectRatio: '1', background: bad ? 'var(--danger)' : on ? 'var(--accent)' : shouldBe ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--surface2)',
                transform: on ? 'scale(0.94)' : 'none', transition: 'background .1s, transform .1s', boxShadow: on ? '0 0 24px var(--accent-glow)' : 'none' }} />
          );
        })}
      </div>
      {phase === 'ready' && <button className="btn btn-primary" onClick={() => setPhase('show')}>Show pattern</button>}
    </div>
  );
}

/* ---------- 2. CIPHER ---------- */
const WORDS = ['SHADOW', 'HUNTER', 'ESCAPE', 'FOOTSTEP', 'CORRIDOR', 'STAIRWELL', 'SILENCE', 'DECOY', 'RADAR', 'SIGNAL', 'HIDEOUT', 'COURTYARD',
  'LANTERN', 'COMPASS', 'WHISPER', 'GHOST', 'PHANTOM', 'VAULT', 'CANTEEN', 'LIBRARY', 'ROOFTOP', 'BALCONY', 'SPRINT', 'TRACKER', 'BEACON',
  'CIPHER', 'MIDNIGHT', 'PURSUIT', 'GARDEN', 'BASEMENT', 'ALLEYWAY', 'SCANNER', 'OUTPOST', 'AMBUSH', 'CAMOUFLAGE', 'STEALTH', 'DISTRICT', 'TUNNEL'];
export function CipherGame({ seed, onWin, onFail }: GameProps) {
  const { word, shift, enc } = useMemo(() => {
    const r = mulberry32(seed);
    const word = WORDS[Math.floor(r() * WORDS.length)];
    const shift = 3 + Math.floor(r() * 9);
    const enc = word.split('').map((ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65)).join('');
    return { word, shift, enc };
  }, [seed]);
  const [guess, setGuess] = useState('');
  const [tries, setTries] = useState(2);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  function submit() {
    if (guess.trim().toUpperCase() === word) { haptic.ok(); onWin(); return; }
    haptic.warn(); setShake((s) => s + 1);
    if (tries <= 1) onFail(`It was ${word}`); else { setTries(tries - 1); setGuess(''); }
  }
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 16, width: '100%' }}>
      <div className="eyebrow">Shift each letter back {shift} · {tries} {tries === 1 ? 'try' : 'tries'} left</div>
      <motion.div key={shake} animate={{ x: shake ? [0, -10, 9, -6, 4, 0] : 0 }} className="display mono" style={{ fontSize: 'min(11vw, 48px)', letterSpacing: '0.2em', color: 'var(--accent)' }}>{enc}</motion.div>
      <div className="scroll-x" style={{ width: '100%', maxWidth: 420 }}>
        <div className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--muted)', lineHeight: 1.6 }}>
          <div>{A.split('').join(' ')}</div>
          <div style={{ color: 'var(--text)' }}>{A.split('').map((_, i) => A[(i - shift + 26) % 26]).join(' ')}</div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: -8 }}>Top row = coded letter. Bottom row = real letter.</div>
      <form className="row" style={{ width: '100%', maxWidth: 420, gap: 8 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="input-wrap cut grow"><input ref={input} className="input display" style={{ letterSpacing: '0.2em', fontSize: 20, textTransform: 'uppercase' }}
          value={guess} onChange={(e) => setGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} maxLength={word.length} autoCapitalize="characters" autoComplete="off" aria-label="Decoded word" /></div>
        <button className="btn btn-primary" style={{ minHeight: 52 }} disabled={guess.length !== word.length} type="submit">Crack</button>
      </form>
    </div>
  );
}

/* ---------- 3. CODE BREAKER ---------- */
export function LockGame({ seed, onWin, onFail }: GameProps) {
  const code = useMemo(() => shuffle([0, 1, 2, 3, 4, 5, 6, 7], mulberry32(seed)).slice(0, 4), [seed]);
  const [cur, setCur] = useState<number[]>([]);
  const [rows, setRows] = useState<{ g: number[]; hit: number; blow: number }[]>([]);
  const left = 7 - rows.length;
  function press(d: number) { if (cur.length < 4 && !cur.includes(d)) { haptic.tap(); setCur([...cur, d]); } }
  function submit() {
    if (cur.length !== 4) return;
    const hit = cur.filter((d, i) => code[i] === d).length;
    const blow = cur.filter((d, i) => code[i] !== d && code.includes(d)).length;
    const next = [...rows, { g: cur, hit, blow }];
    setRows(next); setCur([]);
    if (hit === 4) { haptic.ok(); setTimeout(onWin, 300); }
    else if (next.length >= 7) { haptic.warn(); setTimeout(() => onFail(`Code was ${code.join('')}`), 500); }
    else haptic.tap();
  }
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 12, width: '100%', maxWidth: 380 }}>
      <div className="eyebrow">{left} guess{left === 1 ? '' : 'es'} left</div>
      <div className="stack" style={{ gap: 4, width: '100%', minHeight: 120 }}>
        {rows.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="row between cut cut-sm" style={{ background: 'var(--surface2)', padding: '6px 12px' }}>
            <span className="display mono" style={{ fontSize: 22, letterSpacing: '0.3em' }}>{r.g.join('')}</span>
            <span className="mono" style={{ fontSize: 18, letterSpacing: '0.15em' }}>
              <span className="accent">{'●'.repeat(r.hit)}</span><span className="muted">{'○'.repeat(r.blow)}</span>{r.hit + r.blow === 0 && <span className="muted">—</span>}
            </span>
          </motion.div>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cut cut-sm display mono" style={{ width: 52, height: 60, display: 'grid', placeItems: 'center', fontSize: 30, background: cur[i] !== undefined ? 'var(--accent)' : 'var(--surface2)', color: cur[i] !== undefined ? 'var(--accent-ink)' : 'var(--faint)' }}>{cur[i] ?? '·'}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: '100%' }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
          <button key={d} className="chip display" disabled={cur.includes(d)} style={{ minHeight: 52, fontSize: 24, opacity: cur.includes(d) ? 0.3 : 1 }} onClick={() => press(d)}>{d}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, width: '100%' }}>
        <button className="btn btn-quiet grow" onClick={() => setCur(cur.slice(0, -1))} disabled={!cur.length}>Delete</button>
        <button className="btn btn-primary grow" onClick={submit} disabled={cur.length !== 4}>Try</button>
      </div>
    </div>
  );
}

/* ---------- 4. DEAD ZONE (reflex) ---------- */
export function ReflexGame({ seed, onWin, onFail }: GameProps) {
  const rnd = useMemo(() => mulberry32(seed), [seed]);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [zone, setZone] = useState(() => ({ at: 0.2 + rnd() * 0.6, w: 0.14 }));
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const pos = useRef(0); const dir = useRef(1); const needle = useRef<HTMLDivElement>(null);
  const speed = 0.55 + hits * 0.28; // bar-widths per second
  const done = useRef(false);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      pos.current += dir.current * speed * dt;
      if (pos.current > 1) { pos.current = 1; dir.current = -1; } else if (pos.current < 0) { pos.current = 0; dir.current = 1; }
      if (needle.current) needle.current.style.left = `${pos.current * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed]);
  function lock() {
    if (done.current) return;
    const inZone = Math.abs(pos.current - zone.at) <= zone.w / 2;
    if (inZone) {
      haptic.ok(); setFlash('hit');
      const h = hits + 1; setHits(h);
      if (h >= 3) { done.current = true; setTimeout(onWin, 350); return; }
      setZone({ at: 0.15 + rnd() * 0.7, w: [0.14, 0.11, 0.085][h] });
    } else {
      haptic.warn(); setFlash('miss');
      const m = misses + 1; setMisses(m);
      if (m >= 2) { done.current = true; setTimeout(() => onFail('Missed twice'), 450); }
    }
    setTimeout(() => setFlash(null), 220);
  }
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 22, width: '100%', maxWidth: 420 }}>
      <div className="row" style={{ gap: 16 }}>
        <span className="eyebrow">Hits <b className="accent">{hits}/3</b></span>
        <span className="eyebrow">Misses <b className="danger">{misses}/2</b></span>
      </div>
      <div onPointerDown={lock} style={{ position: 'relative', width: '100%', height: 84, background: 'var(--surface2)', touchAction: 'manipulation', cursor: 'pointer' }} className="cut">
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(zone.at - zone.w / 2) * 100}%`, width: `${zone.w * 100}%`, background: flash === 'hit' ? 'var(--ok)' : 'var(--accent)', opacity: 0.85, transition: 'left .2s, width .2s' }} />
        {[...Array(21)].map((_, i) => <div key={i} style={{ position: 'absolute', left: `${i * 5}%`, bottom: 0, width: 1, height: i % 5 ? 8 : 16, background: 'var(--line2)' }} />)}
        <div ref={needle} style={{ position: 'absolute', top: -6, bottom: -6, width: 3, marginLeft: -1.5, background: flash === 'miss' ? 'var(--danger)' : 'var(--text)', boxShadow: '0 0 12px var(--text)' }} />
      </div>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onPointerDown={(e) => { e.preventDefault(); lock(); }}>Lock</button>
    </div>
  );
}

/* ---------- 5. RIDDLE RUN ---------- */
const QS: [string, string, string[]][] = [
  ['What has keys but can\'t open locks?', 'A piano', ['A map', 'A prison', 'A safe']],
  ['The more you take, the more you leave behind. What are they?', 'Footsteps', ['Photos', 'Breaths', 'Memories']],
  ['What gets wetter the more it dries?', 'A towel', ['A sponge', 'Rain', 'Ice']],
  ['What has a neck but no head?', 'A bottle', ['A shirt', 'A guitar pick', 'A snake']],
  ['I\'m tall when I\'m young and short when I\'m old. What am I?', 'A candle', ['A tree', 'A pencil', 'A shadow']],
  ['What can travel around the world while staying in a corner?', 'A stamp', ['A spider', 'A clock', 'Wi-Fi']],
  ['What has hands but can\'t clap?', 'A clock', ['A statue', 'A glove', 'A robot']],
  ['What runs but never walks, has a mouth but never talks?', 'A river', ['A clock', 'A road', 'The wind']],
  ['What comes once in a minute, twice in a moment, never in a thousand years?', 'The letter M', ['A blink', 'A second', 'The letter E']],
  ['What can you catch but not throw?', 'A cold', ['A ball', 'A bus', 'A fish']],
  ['What belongs to you but others use it more than you?', 'Your name', ['Your phone', 'Your room', 'Your bike']],
  ['What has many teeth but can\'t bite?', 'A comb', ['A zip', 'A saw', 'A shark doll']],
  ['Forward I am heavy, backward I am not. What am I?', 'A ton', ['A weight', 'A rock', 'A tank']],
  ['What goes up but never comes down?', 'Your age', ['A balloon', 'Smoke', 'Prices']],
  ['What can fill a room but takes up no space?', 'Light', ['Air', 'Water', 'Sound']],
  ['Which planet is known as the Red Planet?', 'Mars', ['Jupiter', 'Venus', 'Mercury']],
  ['How many sides does a hexagon have?', '6', ['5', '7', '8']],
  ['What is the capital of Karnataka?', 'Bengaluru', ['Mysuru', 'Hubballi', 'Belagavi']],
  ['Binary 1010 equals which decimal number?', '10', ['8', '12', '5']],
  ['Which gas do plants absorb from the air?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Helium']],
  ['What is 15% of 200?', '30', ['15', '20', '35']],
  ['Who wrote the Indian national anthem?', 'Rabindranath Tagore', ['Bankim Chandra', 'Sarojini Naidu', 'Kuvempu']],
  ['Which is the largest ocean?', 'Pacific', ['Atlantic', 'Indian', 'Arctic']],
  ['What does CPU stand for?', 'Central Processing Unit', ['Computer Power Unit', 'Core Program Utility', 'Central Peripheral Unit']],
  ['If you\'re running a race and pass the person in 2nd, what place are you in?', '2nd', ['1st', '3rd', 'Last']],
  ['How many minutes are in 3 hours?', '180', ['160', '200', '120']],
  ['Which river is called the Dakshina Ganga?', 'Godavari', ['Krishna', 'Kaveri', 'Tungabhadra']],
  ['The next number: 2, 6, 12, 20, 30, …?', '42', ['40', '36', '44']],
  ['Which is a prime number?', '29', ['21', '27', '33']],
  ['What is the boiling point of water at sea level?', '100 °C', ['90 °C', '110 °C', '120 °C']],
  ['A rooster lays an egg on a roof. Which way does it roll?', 'Roosters don\'t lay eggs', ['Left', 'Right', 'Down the middle']],
  ['What has one eye but can\'t see?', 'A needle', ['A storm', 'A potato', 'A camera']],
  ['What word becomes shorter when you add two letters?', 'Short', ['Long', 'Small', 'Tiny']],
  ['HTTP 404 means…', 'Not found', ['Server error', 'Forbidden', 'Moved']],
  ['Which shape has all sides equal and all angles 90°?', 'Square', ['Rhombus', 'Rectangle', 'Trapezium']],
  ['How many bits are in a byte?', '8', ['4', '16', '10']],
];
export function RiddleGame({ seed, onWin, onFail }: GameProps) {
  const set = useMemo(() => {
    const r = mulberry32(seed);
    return shuffle(QS, r).slice(0, 3).map(([q, a, w]) => ({ q, a, opts: shuffle([a, ...w], r) }));
  }, [seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [left, setLeft] = useState(20);
  const over = useRef(false);
  useEffect(() => {
    setLeft(20);
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [i]);
  useEffect(() => {
    if (left <= 0 && !picked && !over.current) { over.current = true; haptic.warn(); onFail('Out of time'); }
  }, [left, picked]);
  function choose(o: string) {
    if (picked) return;
    setPicked(o);
    const ok = o === set[i].a;
    if (ok) haptic.tap(); else haptic.warn();
    setTimeout(() => {
      if (!ok) { over.current = true; onFail(`Answer: ${set[i].a}`); return; }
      if (i === 2) { over.current = true; onWin(); return; }
      setPicked(null); setI(i + 1);
    }, 650);
  }
  const q = set[i];
  return (
    <div className="stack" style={{ gap: 16, width: '100%', maxWidth: 440 }}>
      <div className="row between"><span className="eyebrow">Question {i + 1}/3</span><span className={`display mono ${left <= 5 ? 'danger' : ''}`} style={{ fontSize: 22 }}>{left}s</span></div>
      <div style={{ height: 3, background: 'var(--surface3)' }}><div style={{ width: `${(left / 20) * 100}%`, height: '100%', background: left <= 5 ? 'var(--danger)' : 'var(--accent)', transition: 'width 1s linear' }} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="stack" style={{ gap: 10 }}>
          <div className="display" style={{ fontSize: 24, lineHeight: 1.15, textTransform: 'none', letterSpacing: 0 }}>{q.q}</div>
          {q.opts.map((o) => {
            const show = picked !== null;
            const bg = show && o === q.a ? 'var(--ok)' : show && o === picked ? 'var(--danger)' : 'var(--surface2)';
            return <button key={o} onClick={() => choose(o)} className="cut cut-sm" style={{ padding: '14px 16px', textAlign: 'left', background: bg, color: show && (o === q.a || o === picked) ? '#0e0d0c' : 'var(--text)', fontWeight: 600, transition: 'background .15s' }}>{o}</button>;
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const GAMES = [MemoryGame, CipherGame, LockGame, ReflexGame, RiddleGame];
