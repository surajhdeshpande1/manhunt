import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import { motion } from 'framer-motion';
import { Avatar, Button, X } from '../components/ui';
import { haptic } from '../lib/feel';
import { rpc } from '../lib/supabase';

export const qrPayload = (roomId: string, token: string) => `TAG1:${roomId}:${token}`;

export function RunnerQR({ roomId, token, username, selfie, onClose }: { roomId: string; token: string; username: string; selfie: string | null; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(qrPayload(roomId, token), { errorCorrectionLevel: 'M', margin: 1, width: 720, color: { dark: '#0e0d0c', light: '#ffffff' } }).then(setSrc);
  }, [roomId, token]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: '#ffffff', color: '#0e0d0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
      <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', right: 12, width: 48, height: 48, display: 'grid', placeItems: 'center', color: '#0e0d0c' }}><X s={28} /></button>
      <div className="row" style={{ gap: 12 }}>
        <Avatar src={selfie} name={username} size={52} />
        <div>
          <div className="display" style={{ fontSize: 30 }}>@{username}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--runner)' }}>Runner · catch code</div>
        </div>
      </div>
      {src ? <img src={src} alt="Your catch QR code" style={{ width: 'min(82vw, 380px)', height: 'auto', imageRendering: 'pixelated' }} /> : <span className="spinner" />}
      <p style={{ maxWidth: 320, textAlign: 'center', margin: 0, color: '#6e6357' }}>Caught? Hold this up for the hunter to scan. Turn your brightness up.</p>
    </motion.div>
  );
}

type ScanState = { k: 'scan' } | { k: 'check' } | { k: 'ok'; name: string; d: number } | { k: 'err'; msg: string };

export function Scanner({ roomId, getFix, onClose, onCaught }: {
  roomId: string; getFix: () => { lat: number; lng: number; acc: number } | null; onClose: () => void; onCaught?: (name: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const busy = useRef(false);
  const [st, setSt] = useState<ScanState>({ k: 'scan' });
  const [camErr, setCamErr] = useState<string | null>(null);

  useEffect(() => {
    const s = new QrScanner(video.current!, (r) => handle(r.data), { preferredCamera: 'environment', highlightScanRegion: false, highlightCodeOutline: false, maxScansPerSecond: 8 });
    scanner.current = s;
    s.start().catch(() => setCamErr('Camera blocked. Allow camera access for this site, then reopen the scanner.'));
    return () => { s.stop(); s.destroy(); };
  }, []);

  async function handle(data: string) {
    if (busy.current) return;
    const m = /^TAG1:([0-9a-f-]{36}):([0-9a-f]{24})$/.exec(data.trim());
    if (!m) { return; }
    if (m[1] !== roomId) { busy.current = true; haptic.warn(); setSt({ k: 'err', msg: 'That QR is from a different room.' }); return; }
    busy.current = true; haptic.tap(); setSt({ k: 'check' }); scanner.current?.pause();
    const f = getFix();
    try {
      const r = await rpc<{ username: string; distance: number }>('catch_runner', { p_room: roomId, p_token: m[2], p_lat: f?.lat ?? null, p_lng: f?.lng ?? null, p_acc: f?.acc ?? null });
      haptic.big(); setSt({ k: 'ok', name: r.username, d: r.distance }); onCaught?.(r.username);
    } catch (e: any) { haptic.warn(); setSt({ k: 'err', msg: e.message }); }
  }
  function again() { busy.current = false; setSt({ k: 'scan' }); scanner.current?.start(); }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 600, background: '#000' }}>
      <video ref={video} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 'min(72vw, 300px)', aspectRatio: '1', position: 'relative', boxShadow: '0 0 0 100vmax rgba(0,0,0,.6)', borderRadius: 28 }}>
          {['top:0;left:0;border-width:3px 0 0 3px', 'top:0;right:0;border-width:3px 3px 0 0', 'bottom:0;left:0;border-width:0 0 3px 3px', 'bottom:0;right:0;border-width:0 3px 3px 0'].map((c, i) => (
            <span key={i} style={{ position: 'absolute', width: 34, height: 34, borderStyle: 'solid', borderColor: '#fff', borderRadius: 4, ...Object.fromEntries(c.split(';').map((kv) => kv.split(':')).map(([k, v]) => [k.replace(/-(\w)/g, (_, x) => x.toUpperCase()), v])) }} />
          ))}
          {st.k === 'scan' && <motion.div style={{ position: 'absolute', left: 8, right: 8, height: 2, background: 'var(--hunter)', boxShadow: '0 0 16px var(--hunter)', borderRadius: 2 }} animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#eef2fa' }}>
        <div>
          <div className="display" style={{ fontSize: 26, color: '#fff' }}>Scan to catch</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Point at the runner's QR. You must be close.</div>
        </div>
        <button onClick={onClose} aria-label="Close scanner" style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', color: '#fff' }}><X s={28} /></button>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
        {camErr && <div className="card card-pad" style={{ background: '#141416', color: '#f5f5f7' }}>{camErr}</div>}
        {st.k === 'check' && <div className="card card-pad row" style={{ background: '#141416', color: '#f5f5f7', gap: 12 }}><span className="spinner" /> Verifying catch…</div>}
        {st.k === 'ok' && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card card-pad stack" style={{ background: 'var(--hunter)', color: '#000' }}>
            <div className="display" style={{ fontSize: 34 }}>@{st.name} caught</div>
            <div style={{ fontWeight: 600 }}>Confirmed at {st.d} m. Everyone has been notified.</div>
            <Button kind="quiet" onClick={onClose} style={{ background: '#000', color: '#fff' }}>Back to the hunt</Button>
          </motion.div>
        )}
        {st.k === 'err' && (
          <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card card-pad stack" style={{ background: '#0d162b', color: '#eef2fa', borderLeft: '3px solid #ff3d3d' }}>
            <div style={{ fontWeight: 600 }}>{st.msg}</div>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" onClick={again}>Scan again</Button>
              <Button size="sm" kind="quiet" onClick={onClose}>Close</Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
