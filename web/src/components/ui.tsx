import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { selfieUrl } from '../lib/supabase';
import { haptic } from '../lib/feel';

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'primary' | 'ghost' | 'danger' | 'quiet'; size?: 'sm' | 'md' | 'lg'; block?: boolean; loading?: boolean; arrow?: boolean;
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

/* ---------- Logo ---------- */
export function Logo({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`display ${className}`} style={{ fontSize: size, fontWeight: 800, letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center', gap: size * 0.12, transform: 'skewX(-8deg)' }}>
      <span style={{ display: 'inline-block', width: size * 0.16, height: size * 0.72, background: 'var(--accent)', transform: 'skewX(-14deg)' }} />
      TAG
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
            <motion.div key={t.id} className={`toast cut cut-sm ${t.err ? 'err' : ''}`}
              initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>{t.text}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Slash page transition ---------- */
export function Slash({ children, k, className = '' }: { children: ReactNode; k?: string; className?: string }) {
  return (
    <motion.div key={k} className={className} style={{ minHeight: '100%', position: 'relative' }}
      initial={{ clipPath: 'polygon(0% 0%, 0% 0%, -25% 100%, -25% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 125% 0%, 100% 100%, -25% 100%)' }}
      transition={{ duration: 0.5, ease: [0.7, 0, 0.2, 1] }}>
      <motion.div aria-hidden style={{ position: 'fixed', top: 0, bottom: 0, width: 3, background: 'var(--accent)', zIndex: 50, pointerEvents: 'none', transform: 'skewX(-14deg)' }}
        initial={{ left: '-5%', opacity: 1 }} animate={{ left: '110%', opacity: 0 }} transition={{ duration: 0.5, ease: [0.7, 0, 0.2, 1] }} />
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
            className="cut cut-lg"
            style={{ width: '100%', maxWidth: 560, maxHeight: full ? '100%' : '88%', height: full ? '100%' : undefined, overflow: 'auto', background: 'var(--bg2)',
              padding: `20px 20px calc(env(safe-area-inset-bottom) + 20px)`, borderTop: '1px solid var(--line2)' }}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}>
            {title && (
              <div className="row between" style={{ marginBottom: 16 }}>
                <div className="display" style={{ fontSize: 26 }}>{title}</div>
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
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="square" strokeLinejoin="miter" aria-hidden><path d={d} /></svg>
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

/* ---------- Small helpers ---------- */
export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="row between"><div className="eyebrow">{title}</div>{right}</div>
      {children}
    </section>
  );
}
export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="frame soft cut" style={{ ['--c' as any]: '14px' }}>
      <div className="inner cut ticks center" style={{ ['--c' as any]: '14px', padding: '28px 20px', background: 'var(--bg2)' }}>
        <div className="display" style={{ fontSize: 22, marginBottom: 6 }}>{title}</div>
        {body && <div className="muted" style={{ maxWidth: 320, margin: '0 auto' }}>{body}</div>}
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
