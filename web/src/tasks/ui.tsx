import { memo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { GlyphKey } from './gen';

const P: Record<GlyphKey, string> = {
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16z',
  square: 'M6.5 5h11A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5z',
  triangle: 'M12 4 20.5 19.5h-17z',
  diamond: 'M12 3 20.5 12 12 21 3.5 12z',
  star: 'M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8l-5.3 2.9 1.1-6-4.4-4.2 6-.8z',
  cross: 'M6.2 4.4 12 10.2l5.8-5.8 1.8 1.8-5.8 5.8 5.8 5.8-1.8 1.8-5.8-5.8-5.8 5.8-1.8-1.8 5.8-5.8-5.8-5.8z',
  plus: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  hexagon: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z',
  ring: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zm0 3.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 1 1 0-8.8z',
  half: 'M3.5 15a8.5 8.5 0 0 1 17 0z',
  arrow: 'M12 3l7.5 8.5h-5V21h-5v-9.5h-5z',
  bolt: 'M13.8 2 5 13.6h6.2L9.6 22 19 9.8h-6.3z',
  moon: 'M15.5 3.4a8.6 8.6 0 1 0 5.2 14.6A7.2 7.2 0 0 1 15.5 3.4z',
  drop: 'M12 2.8c3.6 4.7 6.3 8.2 6.3 11.4a6.3 6.3 0 0 1-12.6 0c0-3.2 2.7-6.7 6.3-11.4z',
  chevron: 'M3.6 8.6 12 17l8.4-8.4-2.4-2.4-6 6-6-6z',
  flag: 'M5.5 3h2.2v18H5.5zM7.7 4H19l-3.2 4.3L19 12.6H7.7z',
  ell: 'M5 3.5h4.5V15H19v4.5H5z',
  bars: 'M4 5.5h16v3.2H4zm0 5h16v3.2H4zm0 5h16v3.2H4z',
};
export const Glyph = memo(function Glyph({ g, size = 28, color = 'currentColor', rot = 0, flip = false, scale = 1, style }:
  { g: GlyphKey; size?: number; color?: string; rot?: number; flip?: boolean; scale?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ display: 'block', transform: `rotate(${rot}deg) scale(${flip ? -scale : scale}, ${scale})`, transition: 'transform .25s', ...style }}>
      <path d={P[g]} fill={color} fillRule="evenodd" />
    </svg>
  );
});

/** Square-ish game cell with consistent feel across tasks */
export function Cell({ children, onTap, state = 'idle', disabled, label, style }:
  { children?: ReactNode; onTap?: () => void; state?: 'idle' | 'lit' | 'good' | 'bad' | 'dim' | 'hint' | 'sel'; disabled?: boolean; label?: string; style?: CSSProperties }) {
  const bg = { idle: 'var(--surface2)', lit: 'var(--accent)', good: 'var(--ok)', bad: 'var(--danger)', dim: 'var(--surface)', hint: 'color-mix(in srgb, var(--accent) 35%, var(--surface2))', sel: '#ede6da' }[state];
  return (
    <motion.button type="button" aria-label={label} disabled={disabled} whileTap={disabled ? undefined : { scale: 0.93 }}
      onPointerDown={(e) => { if (disabled || !onTap) return; e.preventDefault(); onTap(); }}
      style={{ aspectRatio: '1', borderRadius: 10, background: bg, display: 'grid', placeItems: 'center', boxShadow: state === 'lit' ? '0 0 24px var(--accent-glow)' : 'inset 0 0 0 1px rgba(237,230,218,.06)',
        transition: 'background .12s, box-shadow .12s', touchAction: 'manipulation', color: state === 'sel' || state === 'lit' ? '#0b0b0c' : 'var(--text)', ...style }}>
      {children}
    </motion.button>
  );
}

export function Grid({ cols, children, gap = 8, width = 'min(86vw, 360px)', style }: { cols: number; children: ReactNode; gap?: number; width?: string; style?: CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, width, ...style }}>{children}</div>;
}

/** Status line under the board: what to do now + a counter */
export function Status({ left, right, tone }: { left: ReactNode; right?: ReactNode; tone?: 'ok' | 'bad' }) {
  return (
    <div className="row between" style={{ width: 'min(86vw, 360px)', minHeight: 22 }}>
      <span className="eyebrow" style={{ color: tone === 'bad' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : undefined }}>{left}</span>
      {right != null && <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{right}</span>}
    </div>
  );
}

export function Slots({ n, values, width = 'min(86vw, 360px)', tone }: { n: number; values: (string | number)[]; width?: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="row" style={{ gap: 6, width, justifyContent: 'center' }}>
      {Array.from({ length: n }, (_, i) => {
        const v = values[i];
        return (
          <div key={i} className="display mono" style={{ flex: 1, maxWidth: 52, height: 56, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 26,
            background: v !== undefined ? (tone === 'bad' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--accent)') : 'var(--surface2)',
            color: v !== undefined ? '#0b0b0c' : 'var(--faint)', transition: 'background .12s' }}>{v ?? '·'}</div>
        );
      })}
    </div>
  );
}

export function Keypad({ keys, onKey, cols = 5, disabled, width = 'min(86vw, 360px)', dim }: { keys: (string | number)[]; onKey: (k: string | number) => void; cols?: number; disabled?: boolean; width?: string; dim?: (k: string | number) => boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7, width }}>
      {keys.map((k) => (
        <motion.button key={String(k)} type="button" whileTap={{ scale: 0.92 }} disabled={disabled || dim?.(k)}
          onPointerDown={(e) => { e.preventDefault(); if (!disabled && !dim?.(k)) onKey(k); }}
          className="display mono" style={{ minHeight: 50, borderRadius: 10, fontSize: String(k).length > 2 ? 14 : 22, background: 'var(--surface2)', color: 'var(--text)', opacity: dim?.(k) ? 0.3 : 1, touchAction: 'manipulation', boxShadow: 'inset 0 0 0 1px rgba(237,230,218,.08)' }}>
          {k}
        </motion.button>
      ))}
    </div>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="row" style={{ gap: 8, width: 'min(86vw, 360px)' }}>{children}</div>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
