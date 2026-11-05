/**
 * TAG sound cues — synthesised with WebAudio, no files to download.
 * Phones only allow audio after the first tap, so the engine unlocks on the first pointerdown.
 * A mute switch lives in Profile → Sound and is remembered on this device.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'tag-sound';
const subs = new Set<() => void>();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const pendingOnUnlock: (() => void)[] = [];

export function soundOn(): boolean { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } }
export function setSound(on: boolean) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private */ } if (master) master.gain.value = on ? 0.8 : 0; subs.forEach((f) => f()); }
export function useSoundOn() { return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, soundOn, () => true); }

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC() as AudioContext;
  master = ctx.createGain(); master.gain.value = soundOn() ? 0.8 : 0;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  return ctx;
}
export function unlocked() { return !!ctx && ctx.state === 'running'; }
/** Run now if audio is available, otherwise as soon as the user first taps. */
export function whenUnlocked(fn: () => void) { if (unlocked()) fn(); else pendingOnUnlock.push(fn); }
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = ensure(); if (!c) return;
    c.resume().then(() => { while (pendingOnUnlock.length) pendingOnUnlock.shift()!(); });
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/* ---------- building blocks ---------- */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; to?: number; attack?: number } = {}) {
  const c = ctx; if (!c || !master || !soundOn()) return;
  const t = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator(); const g = c.createGain();
  o.type = opts.type ?? 'sine'; o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const peak = opts.gain ?? 0.2, a = opts.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, opts: { gain?: number; at?: number; freq?: number; q?: number; sweepTo?: number } = {}) {
  const c = ctx; if (!c || !master || !soundOn()) return;
  const t = c.currentTime + (opts.at ?? 0);
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(opts.freq ?? 1200, t); f.Q.value = opts.q ?? 0.8;
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(opts.gain ?? 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}

/* ---------- opening-film score ----------
   A 10-second cartoon-heist cue, scheduled sample-accurately against the film's clock.
   score(from) plays everything from second `from` onward, so a late start (iPhone needs a tap first)
   joins in sync instead of starting over. */
let wet: ConvolverNode | null = null;
function bus(): AudioNode | null {
  const c = ctx; if (!c || !master) return null;
  if (!wet) {
    // small synthetic room for warmth
    const len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    wet = c.createConvolver(); wet.buffer = ir; const wg = c.createGain(); wg.gain.value = 0.22; wet.connect(wg); wg.connect(master);
  }
  return master;
}
type V = { at: number; dur: number; gain: number };
function voice(t0: number, build: (c: AudioContext, out: GainNode, t: number) => void, v: V, wetSend = 0.3) {
  const c = ctx; if (!c || !master || !soundOn()) return;
  const t = t0 + v.at; if (v.at < -0.001) return;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v.gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
  g.connect(bus()!); if (wet && wetSend) { const s = c.createGain(); s.gain.value = wetSend; g.connect(s); s.connect(wet); }
  build(c, g, t);
}
const osc = (c: AudioContext, type: OscillatorType, f: number, t: number, dur: number, out: AudioNode, to?: number) => {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur); o.connect(out); o.start(t); o.stop(t + dur + 0.05); return o;
};
const lp = (c: AudioContext, f: number, out: AudioNode, q = 0.7) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; b.connect(out); return b; };
const noiseSrc = (c: AudioContext, dur: number) => { const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; };

const N: Record<string, number> = { D2: 73.42, F2: 87.31, G2: 98, Ab2: 103.83, A2: 110, Bb2: 116.54, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, A3: 220, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, D5: 587.33, F5: 698.46, A5: 880 };

export function score(from = 0) {
  const c = ensure(); if (!c || !master || !soundOn()) return;
  bus();
  const t0 = c.currentTime + 0.03 - from;
  const at = (s: number) => s - from;
  const pluck = (s: number, f: number, g = 0.32, d = 0.42) => voice(t0, (c2, out, t) => { const f1 = lp(c2, 700, out, 2); osc(c2, 'triangle', f, t, d, f1); osc(c2, 'sine', f / 2, t, d * 0.8, f1); }, { at: at(s), dur: d, gain: g }, 0.15);
  const brush = (s: number, g = 0.1, d = 0.12) => voice(t0, (c2, out, t) => { const n = noiseSrc(c2, d); const b = c2.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = 2200; n.connect(b); b.connect(out); n.start(t); }, { at: at(s), dur: d, gain: g }, 0.25);
  const hat = (s: number) => voice(t0, (c2, out, t) => { const n = noiseSrc(c2, 0.04); const b = c2.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = 7000; n.connect(b); b.connect(out); n.start(t); }, { at: at(s), dur: 0.04, gain: 0.05 }, 0.1);
  const pizz = (s: number, f: number, g = 0.12) => voice(t0, (c2, out, t) => { osc(c2, 'triangle', f, t, 0.16, lp(c2, 3000, out)); }, { at: at(s), dur: 0.16, gain: g }, 0.4);
  const wood = (s: number, f = 1100, g = 0.14) => voice(t0, (c2, out, t) => { osc(c2, 'square', f, t, 0.05, lp(c2, 2600, out)); }, { at: at(s), dur: 0.06, gain: g }, 0.2);
  const swish = (s: number, d: number, f0: number, f1: number, g = 0.12) => voice(t0, (c2, out, t) => { const n = noiseSrc(c2, d); const b = c2.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 0.9; b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + d); n.connect(b); b.connect(out); n.start(t); }, { at: at(s), dur: d, gain: g }, 0.3);

  /* 0.0–1.4 · paper map unfolds, fuse draws the zone */
  [0.18, 0.42, 0.66].forEach((s) => swish(s, 0.22, 2600, 900, 0.16));
  voice(t0, (c2, out, t) => { const n = noiseSrc(c2, 0.9); const b = c2.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 3; b.frequency.value = 5200; n.connect(b); b.connect(out); n.start(t); }, { at: at(0.6), dur: 0.85, gain: 0.06 }, 0.1);
  [0.95, 1.05, 1.15, 1.25].forEach((s, i) => wood(s, 700 + i * 120, 0.07)); // buildings pop up

  /* bass line: sneaky walking D minor, 120 bpm from 1.4 s, double-time in the chase */
  const walk = ['D2', 'F2', 'G2', 'Ab2', 'A2', 'C3', 'A2', 'G2', 'D2', 'F2', 'G2', 'Ab2'];
  walk.forEach((n, i) => pluck(1.4 + i * 0.5, N[n]));
  [2.4, 3.4, 4.4, 5.4].forEach((s) => brush(s, 0.09));
  for (let s = 1.65; s < 5.6; s += 0.5) hat(s);
  /* runner lands: boing; tiptoe pizzicato while hiding */
  voice(t0, (c2, out, t) => { const o = osc(c2, 'sine', 180, t, 0.35, out, 520); const lfo = c2.createOscillator(); lfo.frequency.value = 18; const lg = c2.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.4); }, { at: at(1.58), dur: 0.35, gain: 0.16 }, 0.2);
  [['D5', 1.95], ['F5', 2.08], ['A4', 2.55], ['D5', 2.68], ['C5', 2.81]].forEach(([n, s]) => pizz(s as number, N[n as string]));
  wood(2.25, 520, 0.12); wood(2.32, 520, 0.08); // lid clank
  /* tasks: three rising dings */
  [[3.3, 'A4'], [3.75, 'C5'], [4.2, 'F5']].forEach(([s, n]) => { voice(t0, (c2, out, t) => { osc(c2, 'sine', N[n as string], t, 0.6, out); osc(c2, 'sine', N[n as string] * 2.01, t, 0.3, out); }, { at: at(s as number), dur: 0.6, gain: 0.12 }, 0.5); });
  /* hunters land: three wooden thunks */
  [4.55, 4.75, 4.95].forEach((s) => voice(t0, (c2, out, t) => { osc(c2, 'sine', 120, t, 0.25, out, 48); const n = noiseSrc(c2, 0.08); const b = c2.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 900; n.connect(b); b.connect(out); n.start(t); }, { at: at(s), dur: 0.3, gain: 0.5 }, 0.15));
  /* sonar ping + echo */
  [0, 0.32, 0.64].forEach((d, i) => voice(t0, (c2, out, t) => { osc(c2, 'sine', 1174.66, t, 1.0, out, 1100); }, { at: at(5.0 + d), dur: 1.0, gain: 0.12 / (i + 1) }, 0.6));
  /* flashlights click on */
  [5.35, 5.42, 5.49].forEach((s) => wood(s, 2400, 0.06));
  /* chase: double-time bass climbing, snare roll building */
  const run = ['D3', 'D2', 'F2', 'D3', 'G2', 'D3', 'Ab2', 'D3', 'A2', 'E3', 'Bb2', 'F3', 'C3', 'F3', 'D3', 'A3'];
  run.forEach((n, i) => pluck(5.6 + i * 0.12, N[n], 0.3, 0.2));
  [5.6, 6.08, 6.56, 7.04].forEach((s) => brush(s, 0.14));
  for (let i = 0; i < 12; i++) brush(7.0 + i * 0.04, 0.03 + i * 0.012, 0.05);
  swish(6.4, 0.35, 900, 4000, 0.1); // leap
  /* the scan: dead air, then BEEP, then the wah-wah sting */
  voice(t0, (c2, out, t) => { osc(c2, 'square', 1760, t, 0.09, lp(c2, 5000, out)); osc(c2, 'square', 1760, t + 0.14, 0.12, lp(c2, 5000, out)); }, { at: at(7.6), dur: 0.3, gain: 0.2 }, 0.2);
  ([[7.85, N.Bb4 / 2, 0.2], [8.06, N.A4 / 2, 0.2], [8.27, N.Ab2 * 2, 0.55]] as [number, number, number][]).forEach(([s, f, d]) =>
    voice(t0, (c2, out, t) => { const fl = lp(c2, 700, out, 6); fl.frequency.setValueAtTime(400, t); fl.frequency.linearRampToValueAtTime(1600, t + d * 0.5); fl.frequency.linearRampToValueAtTime(500, t + d); osc(c2, 'sawtooth', f, t, d, fl); }, { at: at(s), dur: d, gain: 0.14 }, 0.3));
  swish(7.95, 0.4, 1500, 300, 0.12); // sticker peels
  /* map folds away, logo pops, final stab with shimmer */
  swish(8.3, 0.5, 4500, 400, 0.16);
  voice(t0, (c2, out, t) => { osc(c2, 'sine', 500, t, 0.12, out, 1300); }, { at: at(8.88), dur: 0.14, gain: 0.18 }, 0.3);
  voice(t0, (c2, out, t) => { osc(c2, 'sine', 400, t, 0.12, out, 1100); }, { at: at(8.98), dur: 0.14, gain: 0.14 }, 0.3);
  (['D3', 'F3', 'A3', 'D4'] as const).forEach((n, i) => voice(t0, (c2, out, t) => { osc(c2, 'triangle', N[n], t, 1.6, lp(c2, 2400, out)); }, { at: at(9.05 + i * 0.015), dur: 1.6, gain: 0.08 }, 0.5));
  pluck(9.05, N.D2, 0.4, 1.0);
  voice(t0, (c2, out, t) => { const n = noiseSrc(c2, 1.2); const b = c2.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = 8000; n.connect(b); b.connect(out); n.start(t); }, { at: at(9.05), dur: 1.2, gain: 0.05 }, 0.6);
}
/* ---------- score for the one-line chase film ---------- */
export function scoreLine(from = 0) {
  const c = ensure(); if (!c || !master || !soundOn()) return;
  bus();
  const t0 = c.currentTime + 0.03 - from;
  const at = (s: number) => s - from;
  const v = (s: number, dur: number, gain: number, build: (c2: AudioContext, out: GainNode, t: number) => void, wetSend = 0.3) => voice(t0, build, { at: at(s), dur, gain }, wetSend);
  const heart = (s: number, g = 0.55) => { [0, 0.13].forEach((d, i) => v(s + d, 0.22, g * (i ? 0.7 : 1), (c2, out, t) => { osc(c2, 'sine', 62, t, 0.22, out, 38); }, 0.05)); };
  const pluck = (s: number, f: number, g = 0.26, d = 0.3) => v(s, d, g, (c2, out, t) => { const fl = lp(c2, 900, out, 3); osc(c2, 'triangle', f, t, d, fl); osc(c2, 'sine', f / 2, t, d, fl); }, 0.15);
  const tick = (s: number, g = 0.05) => v(s, 0.04, g, (c2, out, t) => { const n = noiseSrc(c2, 0.04); const b = c2.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = 7500; n.connect(b); b.connect(out); n.start(t); }, 0.1);
  const scratch = (s: number, d: number, g: number, f0 = 2500, f1 = 5000) => v(s, d, g, (c2, out, t) => { const n = noiseSrc(c2, d); const b = c2.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 4; b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + d); const am = c2.createGain(); const lfo = c2.createOscillator(); lfo.frequency.value = 23; const lg = c2.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5; n.connect(b); b.connect(am); am.connect(out); n.start(t); lfo.start(t); lfo.stop(t + d); }, 0.2);
  const pad = (s: number, d: number, fs: number[], g = 0.05) => fs.forEach((f) => v(s, d, g, (c2, out, t) => { const fl = lp(c2, 1100, out); const o = osc(c2, 'sawtooth', f, t, d, fl); o.detune.value = (Math.random() - 0.5) * 12; }, 0.5));

  /* 0–1.4 · a heartbeat line crosses the dark */
  pad(0, 2.6, [N.D2, N.A2], 0.035);
  heart(0.48, 0.45); heart(0.92, 0.5);
  /* 1.4–2.3 · the line sketches a runner; it comes alive */
  scratch(1.4, 0.9, 0.06);
  [N.D3, N.F3, N.A3, N.D4].forEach((f, i) => pluck(2.3 + i * 0.03, f, 0.12, 0.8));
  /* 2.6–4.6 · it runs, drawing the campus behind it */
  const os = ['D2', 'D3', 'A2', 'D3', 'F2', 'D3', 'A2', 'C3'];
  for (let i = 0; i < 9; i++) pluck(2.6 + i * 0.22, N[os[i % os.length]], 0.22, 0.2);
  for (let s = 2.71; s < 6.6; s += 0.22) tick(s);
  [[3.1, 'A4'], [3.32, 'D5'], [3.98, 'C5'], [4.2, 'A4']].forEach(([s, n]) => v(s as number, 0.2, 0.08, (c2, out, t) => { osc(c2, 'triangle', N[n as string], t, 0.2, lp(c2, 3000, out)); }, 0.4));
  /* 4.6 · the hunter's line arrives: low stab, torch click, the chase tightens */
  v(4.6, 0.7, 0.16, (c2, out, t) => { const fl = lp(c2, 600, out, 4); fl.frequency.setValueAtTime(300, t); fl.frequency.linearRampToValueAtTime(1400, t + 0.15); fl.frequency.linearRampToValueAtTime(400, t + 0.7); osc(c2, 'sawtooth', N.D2, t, 0.7, fl); osc(c2, 'sawtooth', N.Ab2, t, 0.7, fl); }, 0.3);
  v(4.75, 0.05, 0.12, (c2, out, t) => { osc(c2, 'square', 2400, t, 0.04, out); }, 0.2);
  const climb = ['D2', 'D3', 'F2', 'D3', 'G2', 'D3', 'Ab2', 'D3', 'A2', 'E3', 'Bb2', 'F3', 'C3', 'F3'];
  climb.forEach((n, i) => pluck(4.6 + i * 0.14, N[n], 0.26, 0.16));
  [5.0, 5.4, 5.8, 6.0, 6.2, 6.35, 6.5].forEach((s, i) => heart(s, 0.4 + i * 0.05));
  v(5.2, 1.4, 0.05, (c2, out, t) => { const n = noiseSrc(c2, 1.4); const b = c2.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 1; b.frequency.setValueAtTime(400, t); b.frequency.exponentialRampToValueAtTime(5000, t + 1.4); n.connect(b); b.connect(out); n.start(t); }, 0.3);
  /* 6.6 · everything stops. lunge. the lines tangle */
  v(6.85, 0.35, 0.16, (c2, out, t) => { const n = noiseSrc(c2, 0.35); const b = c2.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 1; b.frequency.setValueAtTime(800, t); b.frequency.exponentialRampToValueAtTime(4000, t + 0.35); n.connect(b); b.connect(out); n.start(t); }, 0.3);
  scratch(7.0, 0.45, 0.14, 1500, 6000);
  [N.D3, N.Ab2 * 2, N.C3 * 2.02].forEach((f) => v(7.05, 0.5, 0.06, (c2, out, t) => { osc(c2, 'sawtooth', f, t, 0.5, lp(c2, 2000, out)); }, 0.3));
  /* 7.5–8.1 · the knot pulls tight: reverse swell into a deep hit; two discs pop out */
  v(7.45, 0.62, 0.14, (c2, out, t) => { const n = noiseSrc(c2, 0.62); const b = c2.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = 3000; n.connect(b); b.connect(out); n.start(t); out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.14, t + 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.62); }, 0.4);
  v(8.07, 1.4, 0.7, (c2, out, t) => { osc(c2, 'sine', 70, t, 1.4, out, 30); }, 0.1);
  v(8.07, 0.4, 0.2, (c2, out, t) => { const n = noiseSrc(c2, 0.4); const b = c2.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 1500; n.connect(b); b.connect(out); n.start(t); }, 0.3);
  v(8.12, 0.14, 0.16, (c2, out, t) => { osc(c2, 'sine', 520, t, 0.12, out, 1300); }, 0.3);
  v(8.2, 0.14, 0.13, (c2, out, t) => { osc(c2, 'sine', 420, t, 0.12, out, 1100); }, 0.3);
  /* 8.4–10 · the name: a calm open chord, one last soft heartbeat */
  pad(8.4, 1.6, [N.D3, N.A3, N.E4, N.F4], 0.04);
  [N.D4, N.A4, N.E4 * 2].forEach((f, i) => v(8.45 + i * 0.12, 1.4, 0.07, (c2, out, t) => { osc(c2, 'sine', f, t, 1.4, out); }, 0.6));
  heart(9.35, 0.3);
}

/* ---------- score for "Caught in the act" ---------- */
export function scoreCaught(from = 0) {
  const c = ensure(); if (!c || !master || !soundOn()) return;
  bus();
  const t0 = c.currentTime + 0.03 - from;
  const at = (s: number) => s - from;
  const v = (s: number, dur: number, gain: number, build: (c2: AudioContext, out: GainNode, t: number) => void, wetSend = 0.25) => voice(t0, build, { at: at(s), dur, gain }, wetSend);
  const nz = (s: number, d: number, g: number, type: BiquadFilterType, f0: number, f1?: number, q = 1, ws = 0.2) => v(s, d, g, (c2, out, t) => { const n = noiseSrc(c2, d); const b = c2.createBiquadFilter(); b.type = type; b.Q.value = q; b.frequency.setValueAtTime(f0, t); if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + d); n.connect(b); b.connect(out); n.start(t); }, ws);
  const kick = (s: number, g = 0.6) => v(s, 0.28, g, (c2, out, t) => { osc(c2, 'sine', 130, t, 0.28, out, 42); }, 0.02);
  const snare = (s: number, g = 0.22) => { nz(s, 0.16, g, 'highpass', 1800, undefined, 0.7, 0.3); v(s, 0.1, g * 0.6, (c2, out, t) => { osc(c2, 'triangle', 220, t, 0.1, out, 160); }, 0.2); };
  const hat = (s: number, g = 0.05) => nz(s, 0.035, g, 'highpass', 8000, undefined, 0.7, 0.05);
  const snap = (s: number) => { nz(s, 0.05, 0.16, 'bandpass', 2600, undefined, 2, 0.4); };
  const bass = (s: number, f: number, d = 0.18, g = 0.3) => v(s, d, g, (c2, out, t) => { const fl = lp(c2, 600, out, 4); fl.frequency.setValueAtTime(1200, t); fl.frequency.exponentialRampToValueAtTime(300, t + d); osc(c2, 'sawtooth', f, t, d, fl); osc(c2, 'sine', f, t, d, out); }, 0.05);
  const pizz = (s: number, f: number, g = 0.12) => v(s, 0.16, g, (c2, out, t) => { osc(c2, 'triangle', f, t, 0.16, lp(c2, 3000, out)); }, 0.35);
  const stab = (s: number, fs: number[], d = 0.22, g = 0.06) => fs.forEach((f) => v(s, d, g, (c2, out, t) => { const fl = lp(c2, 2400, out, 2); osc(c2, 'sawtooth', f, t, d, fl); osc(c2, 'sawtooth', f * 1.005, t, d, fl); }, 0.3));
  const rattle = (s: number) => [0, 0.09, 0.18, 0.27].forEach((d, i) => { nz(s + d, 0.06, 0.12, 'bandpass', 3800 + i * 200, undefined, 6, 0.1); v(s + d, 0.05, 0.08, (c2, out, t) => { osc(c2, 'sine', 2600 + i * 90, t, 0.04, out); }, 0.1); });
  const hiss = (s: number, d: number) => nz(s, d, 0.13, 'bandpass', 5200, 6400, 0.8, 0.15);

  /* 0–2.6 · sneaky groove under the spray can */
  rattle(0.1);
  [['D2', 0.2], ['D2', 0.65], ['F2', 0.9], ['G2', 1.1], ['Ab2', 1.55], ['A2', 1.8], ['C3', 2.0], ['A2', 2.25]].forEach(([n, s]) => bass(s as number, N[n as string], 0.22, 0.24));
  [0.42, 0.87, 1.32, 1.77, 2.22].forEach(snap);
  [0.2, 0.65, 1.1, 1.55, 2.0].forEach((s) => kick(s, 0.35));
  hiss(0.7, 0.55); rattle(1.3); hiss(1.55, 0.5);
  [['D5', 2.1], ['F5', 2.2], ['A5', 2.3]].forEach(([n, s]) => pizz(s as number, N[n as string] ?? 880, 0.1)); // proud flourish

  /* 2.6 · CLICK — the torch. music drops out */
  v(2.6, 0.05, 0.18, (c2, out, t) => { osc(c2, 'square', 1900, t, 0.04, out); }, 0.3);
  v(2.6, 1.2, 0.35, (c2, out, t) => { osc(c2, 'sine', 55, t, 1.2, out, 40); }, 0.3);
  /* 2.75 · the dog: two sharp barks */
  [2.75, 2.92].forEach((s) => { v(s, 0.12, 0.2, (c2, out, t) => { const fl = lp(c2, 2200, out, 5); osc(c2, 'sawtooth', 620, t, 0.12, fl, 380); }, 0.3); nz(s, 0.1, 0.1, 'bandpass', 1500, 900, 2, 0.2); });
  /* 3.0 · uh-oh */
  v(3.02, 0.18, 0.16, (c2, out, t) => { osc(c2, 'sawtooth', N.D3, t, 0.18, lp(c2, 900, out, 4)); }, 0.3);
  v(3.2, 0.3, 0.16, (c2, out, t) => { osc(c2, 'sawtooth', N.A2, t, 0.3, lp(c2, 700, out, 4), 98); }, 0.3);
  /* 3.25 · the can drops and clatters */
  [3.28, 3.38, 3.44].forEach((s, i) => v(s, 0.12, 0.12 / (i + 1), (c2, out, t) => { osc(c2, 'square', 1400 - i * 150, t, 0.06, lp(c2, 4000, out)); osc(c2, 'sine', 3100, t, 0.08, out); }, 0.4));
  /* 3.35 · WHISTLE and the chase beat drops (150 bpm) */
  v(3.35, 0.7, 0.13, (c2, out, t) => { const o = osc(c2, 'sine', 2800, t, 0.7, out); const l = c2.createOscillator(); l.frequency.value = 32; const lg = c2.createGain(); lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.7); }, 0.3);
  const b = 0.2; // eighth note
  const riff = ['D2', 'D2', 'D3', 'D2', 'F2', 'G2', 'D3', 'Ab2', 'D2', 'D2', 'D3', 'D2', 'C3', 'A2', 'G2', 'F2'];
  for (let i = 0; i < 21; i++) {
    const s = 3.45 + i * b;
    if (s > 7.66) break;
    bass(s, N[riff[i % riff.length]], 0.17, 0.26);
    hat(s + b / 2);
    if (i % 4 === 0) kick(s, 0.55);
    if (i % 4 === 2) snare(s, 0.2);
    if (i % 8 === 0) stab(s, [N.D4, N.F4, N.A4], 0.2, 0.05);
  }
  /* obstacles */
  v(4.45, 0.35, 0.16, (c2, out, t) => { osc(c2, 'sine', 300, t, 0.3, out, 900); }, 0.2); // jump
  v(4.9, 0.08, 0.14, (c2, out, t) => { osc(c2, 'sawtooth', 900, t, 0.08, lp(c2, 2500, out), 1300); }, 0.2); // dog yip
  v(5.15, 0.18, 0.14, (c2, out, t) => { osc(c2, 'sawtooth', 140, t, 0.18, lp(c2, 600, out), 110); }, 0.1); // hunter grunt
  nz(5.55, 0.42, 0.14, 'bandpass', 600, 2400, 1.2, 0.2); // slide
  v(6.2, 0.3, 0.2, (c2, out, t) => { osc(c2, 'square', 520, t, 0.04, lp(c2, 3000, out)); osc(c2, 'sine', 700, t, 0.3, out, 240); }, 0.3); // BONK
  nz(6.5, 0.35, 0.16, 'lowpass', 2400, 600, 0.6, 0.3); // splash
  nz(7.5, 0.25, 0.14, 'bandpass', 500, 3500, 1, 0.2); // lunge
  /* 7.7 · the grab: record scratch, freeze, silence */
  v(7.7, 0.32, 0.2, (c2, out, t) => { const n = noiseSrc(c2, 0.32); const bq = c2.createBiquadFilter(); bq.type = 'bandpass'; bq.Q.value = 5; bq.frequency.setValueAtTime(3000, t); bq.frequency.exponentialRampToValueAtTime(400, t + 0.16); bq.frequency.exponentialRampToValueAtTime(2200, t + 0.32); n.connect(bq); bq.connect(out); n.start(t); osc(c2, 'sawtooth', 400, t, 0.3, lp(c2, 1500, out), 70); }, 0.2);
  stab(7.72, [N.D3, N.Ab2 * 2, N.D4], 0.6, 0.07);
  v(7.72, 0.9, 0.5, (c2, out, t) => { osc(c2, 'sine', 65, t, 0.9, out, 34); }, 0.2);
  /* 8.45 · the painted logo: spray burst, two drips, final chord */
  hiss(8.45, 0.35);
  [8.75, 8.9].forEach((s, i) => v(s, 0.25, 0.1, (c2, out, t) => { osc(c2, 'sine', 1200 - i * 200, t, 0.22, out, 500 - i * 80); }, 0.5));
  stab(8.55, [N.D3, N.A3, N.D4, N.F4], 1.3, 0.05);
  kick(8.55, 0.6); bass(8.55, N.D2, 1.0, 0.3);
  [N.A4, N.D5, N.F5].forEach((f, i) => v(8.7 + i * 0.1, 1.1, 0.06, (c2, out, t) => { osc(c2, 'triangle', f, t, 1.1, out); }, 0.6));
}

/* ---------- score for "Surrounded" ---------- */
export function scoreSurround(from = 0) {
  const c = ensure(); if (!c || !master || !soundOn()) return;
  bus();
  const t0 = c.currentTime + 0.03 - from;
  const at = (s: number) => s - from;
  const v = (s: number, dur: number, gain: number, build: (c2: AudioContext, out: GainNode, t: number) => void, wetSend = 0.25) => voice(t0, build, { at: at(s), dur, gain }, wetSend);
  const nz = (s: number, d: number, g: number, type: BiquadFilterType, f0: number, f1?: number, q = 1, ws = 0.2) => v(s, d, g, (c2, out, t) => { const n = noiseSrc(c2, d); const b = c2.createBiquadFilter(); b.type = type; b.Q.value = q; b.frequency.setValueAtTime(f0, t); if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + d); n.connect(b); b.connect(out); n.start(t); }, ws);
  const heart = (s: number, g = 0.5) => [0, 0.14].forEach((d, i) => v(s + d, 0.24, g * (i ? 0.7 : 1), (c2, out, t) => { osc(c2, 'sine', 60, t, 0.24, out, 36); }, 0.05));
  const kick = (s: number, g = 0.65) => v(s, 0.3, g, (c2, out, t) => { osc(c2, 'sine', 150, t, 0.3, out, 40); }, 0.02);
  const snare = (s: number, g = 0.24) => { nz(s, 0.18, g, 'highpass', 1600, undefined, 0.7, 0.35); v(s, 0.1, g * 0.5, (c2, out, t) => { osc(c2, 'triangle', 240, t, 0.1, out, 170); }, 0.2); };
  const hat = (s: number, g = 0.045) => nz(s, 0.03, g, 'highpass', 8500, undefined, 0.7, 0.05);
  const reese = (s: number, f: number, d: number, g = 0.12) => v(s, d, g, (c2, out, t) => { const fl = lp(c2, 500, out, 3); fl.frequency.setValueAtTime(380, t); fl.frequency.linearRampToValueAtTime(900, t + d * 0.5); fl.frequency.linearRampToValueAtTime(420, t + d); const a = osc(c2, 'sawtooth', f, t, d, fl); const b = osc(c2, 'sawtooth', f, t, d, fl); a.detune.value = -14; b.detune.value = 14; osc(c2, 'sine', f, t, d, out); }, 0.05);
  const click = (s: number) => { v(s, 0.05, 0.16, (c2, out, t) => { osc(c2, 'square', 2200, t, 0.03, out); }, 0.4); v(s + 0.01, 0.6, 0.06, (c2, out, t) => { osc(c2, 'sine', 110, t, 0.6, out, 90); }, 0.4); };
  const stab = (s: number, fs: number[], d = 0.25, g = 0.05) => fs.forEach((f) => v(s, d, g, (c2, out, t) => { const fl = lp(c2, 2600, out, 2); osc(c2, 'sawtooth', f, t, d, fl); osc(c2, 'sawtooth', f * 1.006, t, d, fl); }, 0.35));

  /* 0–2.2 · one heartbeat in the dark, the plaza opens */
  heart(0.15, 0.55); heart(1.05, 0.55);
  v(0.9, 3.6, 0.04, (c2, out, t) => { const fl = lp(c2, 700, out); osc(c2, 'sawtooth', N.D2, t, 3.6, fl); osc(c2, 'sawtooth', N.D2 * 1.5, t, 3.6, fl); }, 0.6);
  /* 1.4–2.2 · four torches click on */
  [1.35, 1.55, 1.75, 1.95].forEach(click);
  /* 2.2–4.4 · the squeeze: heartbeat accelerates, tremolo strings rise, ticking clock */
  [2.2, 2.85, 3.4, 3.85, 4.15, 4.35].forEach((s, i) => heart(s, 0.45 + i * 0.05));
  for (let s = 2.2; s < 4.4; s += 0.25) nz(s, 0.03, 0.05, 'bandpass', 3200, undefined, 8, 0.1);
  v(2.2, 2.25, 0.05, (c2, out, t) => { const fl = lp(c2, 1800, out, 1); const o = osc(c2, 'sawtooth', N.A3, t, 2.25, fl, N.D4); const tr2 = c2.createOscillator(); tr2.frequency.value = 14; const tg = c2.createGain(); tg.gain.value = 0.5; tr2.connect(tg); tg.connect(out.gain); tr2.start(t); tr2.stop(t + 2.25); o.detune.value = 0; }, 0.5);
  nz(3.3, 1.15, 0.06, 'bandpass', 500, 6000, 1, 0.4);
  /* 4.4–4.6 · silence, one breath */
  nz(4.42, 0.16, 0.05, 'bandpass', 900, 1400, 1, 0.3);
  /* 4.6 · BREAK OUT — impact, then 172 bpm drum & bass */
  kick(4.6, 0.8); v(4.6, 1.1, 0.4, (c2, out, t) => { osc(c2, 'sine', 55, t, 1.1, out, 30); }, 0.2);
  nz(4.6, 0.6, 0.18, 'bandpass', 3000, 400, 0.8, 0.4);
  stab(4.6, [N.D3, N.A3, N.D4, N.F4], 0.35, 0.06);
  const e = 60 / 172 / 2; // eighth
  for (let i = 0; i < 26; i++) {
    const s = 4.75 + i * e; if (s > 7.55) break;
    const bar = i % 8;
    if (bar === 0 || bar === 5) kick(s, 0.6);
    if (bar === 2 || bar === 6) snare(s, 0.22);
    hat(s); hat(s + e / 2, 0.025);
    if (bar === 0) reese(s, i % 16 === 0 ? N.D2 : N.F2, e * 4, 0.12);
    if (bar === 4) reese(s, i % 16 === 4 ? N.C3 / 2 : N.A2 / 2 * 2, e * 4, 0.11);
  }
  nz(4.62, 0.35, 0.16, 'bandpass', 500, 4000, 1, 0.2); // the dash whoosh
  v(5.0, 0.35, 0.22, (c2, out, t) => { osc(c2, 'square', 480, t, 0.04, lp(c2, 3000, out)); osc(c2, 'sine', 760, t, 0.32, out, 220); }, 0.3); // BONK
  [5.08, 5.2, 5.32].forEach((s, i) => v(s, 0.2, 0.06, (c2, out, t) => { osc(c2, 'sine', 2100 + i * 300, t, 0.18, out); }, 0.6)); // dizzy stars
  stab(5.9, [N.D4, N.F4, N.A4], 0.18, 0.045); stab(6.6, [N.E4, N.A4, N.C5], 0.18, 0.045);
  nz(6.2, 0.4, 0.1, 'bandpass', 700, 3500, 1.2, 0.2); // swerve
  /* 7.5–8.05 · cornered: everything rises into the beams meeting */
  nz(7.45, 0.6, 0.12, 'highpass', 1500, 9000, 0.7, 0.4);
  v(7.45, 0.6, 0.06, (c2, out, t) => { const o = osc(c2, 'sawtooth', N.D3, t, 0.6, lp(c2, 2500, out), N.D4 * 2); o.detune.value = 0; }, 0.4);
  heart(7.55, 0.6); heart(7.8, 0.65);
  /* 8.05 · the flash and the mark */
  kick(8.05, 0.85); v(8.05, 1.6, 0.5, (c2, out, t) => { osc(c2, 'sine', 62, t, 1.6, out, 30); }, 0.2);
  nz(8.05, 1.4, 0.07, 'highpass', 7000, undefined, 0.7, 0.7);
  stab(8.1, [N.D3, N.A3, N.D4, N.E4, N.A4], 1.6, 0.04);
  [N.A4, N.D5, N.A5].forEach((f, i) => v(8.3 + i * 0.12, 1.3, 0.06, (c2, out, t) => { osc(c2, 'sine', f, t, 1.3, out); }, 0.7));
}

/** Render the opening score to a WAV (used only to make preview videos: open the app with ?scorewav). */
export async function renderScoreWav(which: 'line' | 'pins' | 'caught' | 'surround' = 'surround'): Promise<string> {
  const save = { ctx, master, wet };
  const oc = new OfflineAudioContext(2, 44100 * 11, 44100);
  ctx = oc as unknown as AudioContext; master = oc.createGain(); master.gain.value = 0.8;
  const comp = oc.createDynamicsCompressor(); master.connect(comp); comp.connect(oc.destination); wet = null;
  (which === 'pins' ? score : which === 'line' ? scoreLine : which === 'caught' ? scoreCaught : scoreSurround)(-0.03);
  const buf = await oc.startRendering();
  ctx = save.ctx; master = save.master; wet = save.wet;
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, 44100, true); out.setUint32(28, 44100 * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let s = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
if (typeof window !== 'undefined' && location.search.includes('scorewav')) (window as any).__scoreWav = renderScoreWav;

/** Try to start audio without a tap (allowed for installed apps on Android Chrome and some desktops). */
export function tryAutoplay(): Promise<boolean> {
  const c = ensure(); if (!c) return Promise.resolve(false);
  if (c.state === 'running') return Promise.resolve(true);
  return new Promise((res) => {
    let done = false;
    c.resume().then(() => { if (!done) { done = true; res(c.state === 'running'); } }).catch(() => { if (!done) { done = true; res(false); } });
    setTimeout(() => { if (!done) { done = true; res(c.state === 'running'); } }, 250);
  });
}

/* ---------- cues ---------- */
export const sfx = {
  /** opening film: night drone, a riser, then the hit */
  intro(fromSec = 0) {
    const left = Math.max(0, 7.2 - fromSec);
    tone(55, Math.max(1, left + 2), { type: 'sawtooth', gain: 0.05, attack: 1.2 });
    tone(82.4, Math.max(1, left + 2), { type: 'triangle', gain: 0.06, attack: 1.5 });
    if (left > 1.6) noise(left, { gain: 0.05, freq: 300, sweepTo: 4000, at: 0 });
    tone(41, 1.6, { type: 'sine', gain: 0.5, at: left, to: 30 });
    noise(0.8, { gain: 0.35, freq: 2500, at: left, sweepTo: 400 });
    [261.6, 329.6, 392].forEach((f, i) => tone(f, 2.2, { type: 'triangle', gain: 0.06, at: left + 0.35 + i * 0.04, attack: 0.05 }));
  },
  tap() { tone(1800, 0.05, { type: 'square', gain: 0.02 }); },
  /** role reveal: a whoosh into a low hit */
  reveal(runner: boolean) {
    noise(0.7, { gain: 0.18, freq: 400, sweepTo: 5000 });
    tone(runner ? 98 : 73.4, 1.2, { type: 'sawtooth', gain: 0.12, at: 0.6, to: runner ? 90 : 65 });
    tone(runner ? 392 : 293.7, 0.9, { type: 'triangle', gain: 0.08, at: 0.62 });
  },
  /** countdown tick and the hunt siren */
  tick() { tone(880, 0.08, { type: 'square', gain: 0.05 }); },
  siren() { for (let i = 0; i < 3; i++) { tone(640, 0.45, { type: 'sawtooth', gain: 0.07, at: i * 0.5, to: 980 }); } noise(0.5, { gain: 0.12, freq: 120, at: 0 }); },
  /** someone was tagged */
  caught() { tone(60, 0.6, { type: 'sine', gain: 0.6, to: 35 }); noise(0.35, { gain: 0.3, freq: 1800, sweepTo: 300 }); tone(220, 0.5, { type: 'sawtooth', gain: 0.06, at: 0.05, to: 110 }); },
  /** runners appear / alerts */
  ping() { tone(1318.5, 0.25, { type: 'sine', gain: 0.12 }); tone(1975.5, 0.35, { type: 'sine', gain: 0.07, at: 0.08 }); },
  warn() { tone(330, 0.18, { type: 'square', gain: 0.06 }); tone(330, 0.18, { type: 'square', gain: 0.06, at: 0.25 }); },
  task() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.08, at: i * 0.06 })); },
  fail() { tone(196, 0.35, { type: 'sawtooth', gain: 0.07, to: 98 }); },
  win() { [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 1.8, { type: 'triangle', gain: 0.09, at: i * 0.12, attack: 0.03 })); noise(1.2, { gain: 0.08, freq: 6000, at: 0.4 }); },
  lose() { [220, 207.7, 196].forEach((f, i) => tone(f, 0.9, { type: 'sawtooth', gain: 0.05, at: i * 0.35 })); },
};
