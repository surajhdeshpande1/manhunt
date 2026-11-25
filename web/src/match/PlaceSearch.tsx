import { useEffect, useRef, useState } from 'react';
import { IconSearch } from '../components/ui';
import { mergePlaces, searchLocal, searchWeb, type Place } from '../lib/placeSearch';
import type { AreaPack } from '../geo/areaPack';

type Near = { lat: number; lng: number } | null;

/**
 * "Find a place" for the area editor: type a college, building or street and jump the map there.
 * Names TAG already has show at once; map search results follow a moment later.
 */
export function PlaceSearch({ near, packs, onPick, onClear }: {
  near: () => Near; packs: (AreaPack | null | undefined)[]; onPick: (p: Place) => void; onClear?: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Place[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'offline'>('idle');
  const [credit, setCredit] = useState('');
  const seq = useRef(0);
  const picked = useRef(''); // the name of a place just chosen: no need to search for it again
  const wrap = useRef<HTMLDivElement>(null);
  const packsRef = useRef(packs); packsRef.current = packs;
  const nearRef = useRef(near); nearRef.current = near;

  useEffect(() => {
    const text = q.trim();
    const my = ++seq.current;
    if (text.length < 2) { setRes([]); setState('idle'); return; }
    if (text === picked.current) return;
    const c = nearRef.current();
    searchLocal(text, c, packsRef.current).then((loc) => { if (my === seq.current) setRes(loc); }).catch(() => {});
    if (text.length < 3) { setState('done'); return; }
    setState('busy');
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const [loc, web] = await Promise.all([searchLocal(text, c, packsRef.current), searchWeb(text, c, ctl.signal)]);
        if (my !== seq.current) return;
        setRes(mergePlaces(loc, web.places)); setCredit(web.credit); setState('done');
      } catch {
        if (my === seq.current && !ctl.signal.aborted) setState('offline');
      }
    }, 450);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  // a tap anywhere else closes the list
  useEffect(() => {
    if (!open) return;
    const f = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, [open]);

  function pick(p: Place) {
    picked.current = p.name; setOpen(false); setQ(p.name);
    (document.activeElement as HTMLElement | null)?.blur?.();
    onPick(p);
  }
  function clear() { setQ(''); setRes([]); setState('idle'); setOpen(false); onClear?.(); }

  const show = open && q.trim().length >= 2;
  const webShown = res.some((p) => p.from === 'web');
  return (
    <div ref={wrap} style={{ position: 'relative', zIndex: 30, scrollMarginTop: 'calc(env(safe-area-inset-top) + 78px)' }}>
      <div className="input-wrap row" style={{ alignItems: 'center', paddingLeft: 13 }}>
        <span className="muted" aria-hidden style={{ display: 'grid' }}><IconSearch s={18} /></span>
        <input className="input" type="text" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
          placeholder="Find a place: college, building, street" aria-label="Find a place on the map" value={q}
          role="combobox" aria-expanded={show} aria-controls="place-results" aria-autocomplete="list"
          onChange={(e) => { picked.current = ''; setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); wrap.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) { e.preventDefault(); pick(res[0]); } else if (e.key === 'Escape') setOpen(false); }}
          style={{ height: 46, paddingLeft: 10 }} />
        {q && <button type="button" aria-label="Clear search" onClick={clear} className="muted" style={{ height: 46, padding: '0 14px', fontSize: 15 }}>✕</button>}
      </div>
      {show && (
        <div id="place-results" role="listbox" aria-label="Places"
          style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', background: 'var(--surface)', borderRadius: 12, overflow: 'hidden auto', maxHeight: 'min(360px, 52vh)',
            boxShadow: '0 0 0 1px var(--line2), 0 22px 44px -18px rgba(0,0,0,.75)' }}>
          {res.map((p, i) => (
            <button key={`${p.name}-${p.lat}-${p.lng}`} type="button" role="option" aria-selected={false} onClick={() => pick(p)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3 }}>{p.name}</div>
              {p.detail && <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.35 }}>{p.detail}</div>}
            </button>
          ))}
          {state === 'busy' && <div className="muted row" style={{ padding: '11px 14px', gap: 8, fontSize: 13, borderTop: res.length ? '1px solid var(--line)' : 0 }}><span className="spin" aria-hidden /> Searching the map…</div>}
          {state === 'done' && !res.length && <div className="muted" style={{ padding: '11px 14px', fontSize: 13 }}>No match. Try the college, area or town name.</div>}
          {state === 'offline' && <div className="muted" style={{ padding: '11px 14px', fontSize: 13, borderTop: res.length ? '1px solid var(--line)' : 0 }}>
            {res.length ? "Map search isn't reachable right now. These are names TAG already has." : "Map search isn't reachable right now. Check your connection and try again."}</div>}
          {webShown && credit && <div style={{ padding: '6px 14px 8px', fontSize: 10.5, color: 'var(--faint)', borderTop: '1px solid var(--line)' }}>{credit}</div>}
        </div>
      )}
    </div>
  );
}
