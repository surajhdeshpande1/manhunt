import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { selfieUrl } from '../lib/supabase';
import { haptic } from '../lib/feel';
import { NightCampus } from './Scenes';

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'primary' | 'hot' | 'ghost' | 'danger' | 'quiet'; size?: 'sm' | 'md' | 'lg'; block?: boolean; loading?: boolean; arrow?: boolean;
};
export function Button({ kind = 'primary', size = 'md', block, loading, arrow, className = '', children, onClick, disabled, ...rest }: BtnProps) {
  const cls = ['btn', `btn-${kind}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  const content = (
    <>
      {loading ? <span className="spinner" /> : children}
      {arrow && !loading && <span className="arrow">→</span>}
    </>
  );
  return (
    <button className={cls} disabled={disabled || loading} onClick={(e) => { haptic.tap(); onClick?.(e); }} {...rest}>
      {kind === 'ghost' ? (<><span className="btn-in" /><span className="btn-label">{content}</span></>) : content}
    </button>
  );
}

/* ---------- Field ---------- */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; prefix?: string };
export function Field({ label, error, hint, prefix, id, ...rest }: FieldProps) {
  const fid = id || `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <div className={`input-wrap cut ${error ? 'err' : ''}`} style={{ ['--c' as any]: '8px' }}>
        {prefix ? (
          <div className="row" style={{ gap: 0, background: 'var(--surface)' }}>
            <span className="mono" style={{ padding: '0 0 0 14px', color: 'var(--muted)' }}>{prefix}</span>
            <input id={fid} className="input" style={{ paddingLeft: 8 }} {...rest} />
          </div>
        ) : <input id={fid} className="input" {...rest} />}
      </div>
      {error ? <div className="field-err">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ src, name, size = 40, out, className = '' }: { src?: string | null; name?: string; size?: number; out?: boolean; className?: string }) {
  const url = selfieUrl(src);
  const [broken, setBroken] = useState(false);
  return (
    <div className={`avatar ${out ? 'out' : ''} ${className}`} style={{ ['--s' as any]: `${size}px`, ['--c' as any]: `${Math.max(5, size / 6)}px` }}>
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> :
        <span className="initials" style={{ fontSize: size * 0.4 }}>{(name || '?').slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

/* ---------- Logo ----------
   Two players at the moment of contact: the runner (blue) and the hunter (red) touching. */
export function LogoMark({ size = 28, style }: { size?: number; style?: React.CSSProperties }) {
  const id = useRef(`lm${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <svg width={size * 1.7} height={size} viewBox="0 0 34 20" aria-hidden style={{ display: 'block', overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#e8361f" /><stop offset="100%" stopColor="#ff8a2a" /></linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#ffb020" /><stop offset="100%" stopColor="#fff07a" /></linearGradient>
      </defs>
      <circle cx="10" cy="10" r="8.6" fill={`url(#${id}r)`} />
      <circle cx="24" cy="10" r="8.6" fill={`url(#${id}h)`} />
      <circle cx="24" cy="10" r="8.6" fill="none" stroke="#000" strokeWidth="1.6" />
    </svg>
  );
}
export function Logo({ size = 44, className = '' }: { size?: number; className?: string; still?: boolean }) {
  return (
    <span className={`display ${className}`} aria-label="TAG"
      style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.06em', display: 'inline-flex', alignItems: 'center', gap: size * 0.2, lineHeight: 1 }}>
      <LogoMark size={size * 0.56} />
      <span className="logo-word" style={{ transform: `translateY(-${size * 0.04}px)` }}>tag</span>
    </span>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; err?: boolean };
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, err }]);
    if (err) haptic.warn();
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), err ? 4800 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className={`toast ${t.err ? 'err' : ''}`} layout
              initial={{ opacity: 0, y: -24, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.96 }} transition={{ type: 'spring', damping: 22, stiffness: 340 }}
              onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>{t.text}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Page transition: film cut ----------
   A dark frame wipes off to the right behind a hot light streak, and the new scene
   comes up out of a soft blur. ~0.5 s, never blocks input. */
function FilmCut() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 650); return () => clearTimeout(t); }, []);
  if (!on || typeof document === 'undefined') return null;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return null;
  const ease = [0.7, 0, 0.2, 1] as const;
  return createPortal(
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 880, pointerEvents: 'none', overflow: 'hidden' }}>
      <motion.div style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}
        initial={{ clipPath: 'inset(0 0 0 0%)' }} animate={{ clipPath: 'inset(0 0 0 100%)' }} transition={{ duration: 0.5, ease }} />
      <motion.div style={{ position: 'absolute', top: '-10%', bottom: '-10%', width: 3, rotate: 8, background: 'linear-gradient(180deg, transparent, #ffd400 30%, #ff6a1a 60%, transparent)',
        boxShadow: '0 0 18px 4px rgba(255,106,26,.7), 0 0 50px 12px rgba(255,176,32,.25)' }}
        initial={{ left: '-2%' }} animate={{ left: '102%' }} transition={{ duration: 0.5, ease }} />
    </div>,
    document.body,
  );
}
export function Slash({ children, k, className = '' }: { children: ReactNode; k?: string; className?: string }) {
  return (
    <motion.div key={k} className={className} style={{ minHeight: '100%', position: 'relative' }}
      initial={{ opacity: 0.4, filter: 'blur(8px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={(e) => { const el = (e as any)?.target as HTMLElement | undefined; if (el?.style) el.style.filter = 'none'; }}>
      <FilmCut />
      {children}
    </motion.div>
  );
}

/* ---------- Bottom sheet modal ---------- */
export function Modal({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; full?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'var(--scrim)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: full ? '100%' : '90%', height: full ? '100%' : undefined, overflow: 'auto', background: 'var(--bg2)',
              borderRadius: full ? 0 : '28px 28px 0 0', boxShadow: 'inset 0 1px 0 var(--line2), 0 -30px 60px -20px rgba(0,0,0,.5)',
              padding: `10px 20px calc(env(safe-area-inset-bottom) + 20px)` }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 34, stiffness: 380, mass: 0.9 }}>
            {!full && <div aria-hidden style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--line2)', margin: '0 auto 12px' }} />}
            {title && (
              <div className="row between" style={{ marginBottom: 16 }}>
                <div className="display" style={{ fontSize: 27 }}>{title}</div>
                <button className="icon-btn" aria-label="Close" onClick={onClose}><X /></button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ---------- Icons (inline, thin) ---------- */
const I = ({ d, s = 22, w = 1.8 }: { d: string; s?: number; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
export const X = (p: { s?: number }) => <I s={p.s} d="M5 5l14 14M19 5L5 19" />;
export const Back = (p: { s?: number }) => <I s={p.s} d="M15 4l-8 8 8 8" />;
export const IconRooms = (p: { s?: number }) => <I s={p.s} d="M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z" />;
export const IconHost = (p: { s?: number }) => <I s={p.s} d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M12 18v3" />;
export const IconProfile = (p: { s?: number }) => <I s={p.s} d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />;
export const IconLock = (p: { s?: number }) => <I s={p.s} d="M6 11h12v10H6zM8 11V7a4 4 0 018 0v4" />;
export const IconGlobe = (p: { s?: number }) => <I s={p.s} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />;
export const IconScan = (p: { s?: number }) => <I s={p.s} d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M7 12h10" />;
export const IconQR = (p: { s?: number }) => <I s={p.s} d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />;
export const IconChat = (p: { s?: number }) => <I s={p.s} d="M4 5h16v11H9l-5 4z" />;
export const IconMic = (p: { s?: number }) => <I s={p.s} d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3" />;
export const IconCopy = (p: { s?: number }) => <I s={p.s} d="M8 8h12v12H8zM4 16V4h12" />;
export const IconShare = (p: { s?: number }) => <I s={p.s} d="M12 3v13M7 8l5-5 5 5M5 14v7h14v-7" />;
export const IconPhone = (p: { s?: number }) => <I s={p.s} d="M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z" />;
export const IconRefresh = (p: { s?: number }) => <I s={p.s} d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />;
export const IconPlus = (p: { s?: number }) => <I s={p.s} d="M12 4v16M4 12h16" />;
export const IconCheck = (p: { s?: number }) => <I s={p.s} d="M4 12l5 5L20 6" />;
export const IconMap = (p: { s?: number }) => <I s={p.s} d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />;
export const IconUndo = (p: { s?: number }) => <I s={p.s} d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />;
export const IconTarget = (p: { s?: number }) => <I s={p.s} d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 2v4M12 18v4M2 12h4M18 12h4" />;
export const IconSOS = (p: { s?: number }) => <I s={p.s} d="M12 3l9 16H3zM12 10v4M12 17v.5" />;
export const IconMenu = (p: { s?: number }) => <I s={p.s} d="M4 7h16M4 12h16M4 17h16" />;

/* ---------- Segmented control (sliding thumb) ---------- */
let segId = 0;
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: ReactNode; disabled?: boolean }[] }) {
  const [id] = useState(() => `seg${segId++}`);
  return (
    <div role="tablist" style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, padding: 4, borderRadius: 14, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" role="tab" aria-selected={on} disabled={o.disabled} onClick={() => { haptic.tap(); onChange(o.v); }}
            style={{ position: 'relative', height: 42, minWidth: 0, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, fontSize: 'clamp(12.5px, 3.7vw, 14.5px)', padding: '0 4px', whiteSpace: 'nowrap',
              color: on ? 'var(--accent-ink)' : 'var(--muted)', opacity: o.disabled ? 0.4 : 1, transition: 'color .3s var(--ease-out)' }}>
            {on && <motion.span layoutId={id} transition={{ type: 'spring', damping: 30, stiffness: 420 }} style={{ position: 'absolute', inset: 0, borderRadius: 11, background: 'var(--accent)' }} />}
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Small helpers ---------- */
export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="row between"><div className="eyebrow sec-title">{title}</div>{right}</div>
      {children}
    </section>
  );
}
export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="card center" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
      <NightCampus height={110} seed={title.length} />
      <div style={{ padding: '6px 22px 26px' }}>
        <div className="display" style={{ fontSize: 21, marginBottom: 6 }}>{title}</div>
        {body && <div className="muted" style={{ maxWidth: 320, margin: '0 auto', fontSize: 14.5 }}>{body}</div>}
        {children && <div style={{ marginTop: 16 }}>{children}</div>}
      </div>
    </div>
  );
}
export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
/** re-render every `ms` (for countdowns) */
export function useTick(ms = 250) {
  const [, set] = useState(0);
  useInterval(() => set((x) => x + 1), ms);
}
