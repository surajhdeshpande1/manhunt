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
