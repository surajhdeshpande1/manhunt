import { useState, type ReactNode } from 'react';
import { Modal } from '../components/ui';
import type { Fix, GeoStatus } from './useRoom';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
const ANDROID = /Android/.test(ua);
const CHROME_IOS = /CriOS/.test(ua);

const NB = '\u00a0'; // keep a number and its unit on one line
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}${NB}km` : `${Math.round(m)}${NB}m`);

/** One line on how good this phone's location is, worded for the player. */
export function gpsLine(status: GeoStatus, fix: Fix | null, rawAcc: number | null, lobby = false): { text: string; tone: 'ok' | 'warn' | 'bad' | 'wait' } {
  switch (status) {
    case 'ok': return { text: `GPS ±${km(fix!.acc)}${lobby ? ' · ready to play' : ''}`, tone: 'ok' };
    case 'weak': return { text: `Weak GPS${fix ? ` (±${km(fix.acc)})` : ''}. ${lobby ? 'Step outside before the match starts.' : 'Readings are ignored until it improves. Step into the open.'}`, tone: 'warn' };
    case 'coarse': return { text: `${lobby ? 'Your phone is only sharing a rough location' : 'Rough location only'}${rawAcc ? ` (±${km(rawAcc)})` : ''}. Turn on Precise Location.`, tone: 'bad' };
    case 'lost': return { text: 'No GPS fix for a while. Keep TAG on screen and step into the open.', tone: 'warn' };
    case 'denied': return { text: 'Location is blocked for TAG. Allow it to play.', tone: 'bad' };
    case 'unsupported': return { text: 'This browser has no location support.', tone: 'bad' };
    default: return { text: 'Finding your GPS…', tone: 'wait' };
  }
}

function Steps({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', boxShadow: first ? '0 0 0 1.5px var(--accent)' : undefined }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{title}</div>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13.5, lineHeight: 1.45 }}>{children}</ol>
    </div>
  );
}

/** What to change on the phone so TAG gets an exact position. Shows this phone's own steps first. */
export function GpsHelp({ open, onClose, status }: { open: boolean; onClose: () => void; status: GeoStatus }) {
  const browser = CHROME_IOS ? 'Chrome' : 'Safari Websites';
  const iphonePrecise = (
    <Steps key="ip" title="iPhone: share your exact spot" first={IOS}>
      <li>Open <b>Settings → Privacy &amp; Security → Location Services</b> and make sure it is on.</li>
      <li>Tap <b>{browser}</b>{CHROME_IOS ? '' : ' (or Chrome, if you play in Chrome)'}.</li>
      <li>Choose <b>While Using the App</b> and turn on <b>Precise Location</b>.</li>
    </Steps>
  );
  const androidPrecise = (
    <Steps key="an" title="Android: share your exact spot" first={ANDROID}>
      <li>Open <b>Settings → Location</b> and make sure it is on.</li>
      <li>Tap <b>App location permissions → Chrome</b> (or the browser you use).</li>
      <li>Choose <b>Allow only while using the app</b> and turn on <b>Use precise location</b>.</li>
      <li>Under <b>Location services</b>, turn on <b>Google Location Accuracy</b>.</li>
    </Steps>
  );
  const iphoneSite = (
    <Steps key="is" title="iPhone: allow TAG" first={IOS}>
      <li>In Safari, tap the page menu (<b>aA</b>) next to the address, then <b>Website Settings</b>.</li>
      <li>Set <b>Location</b> to <b>Allow</b>, then reload TAG.</li>
    </Steps>
  );
  const androidSite = (
    <Steps key="as" title="Android: allow TAG" first={ANDROID}>
      <li>In Chrome, tap the icon at the left of the address bar, then <b>Permissions</b>.</li>
      <li>Turn <b>Location</b> on, then reload TAG.</li>
    </Steps>
  );
  const blocked = status === 'denied';
  const order = (a: ReactNode, b: ReactNode) => (ANDROID ? [b, a] : [a, b]);
  return (
    <Modal open={open} onClose={onClose} title={blocked ? 'Let TAG see your location' : 'Get an exact GPS fix'}>
      <div style={{ display: 'grid', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          {blocked ? 'Your browser is blocking location for TAG, so you can’t be placed in the game.'
            : 'Hunters and runners see each other where the GPS says, and catches are checked by distance, so a rough or weak fix costs you.'}
        </p>
        {blocked ? order(iphoneSite, androidSite) : order(iphonePrecise, androidPrecise)}
        {blocked && order(iphonePrecise, androidPrecise)}
        <Steps key="tips" title="For the best fix">
          <li>Get out from under roofs and away from tall walls. GPS needs open sky.</li>
          <li>Keep TAG open on screen. Phones pause location for web apps in the background.</li>
          <li>Leave Wi-Fi switched on, even if you aren’t connected. It helps the phone place itself.</li>
          <li>Battery saver and Low Power Mode can slow location down.</li>
        </Steps>
      </div>
    </Modal>
  );
}

/** A compact GPS status pill that opens the help sheet; for the lobby. */
export function GpsChip({ status, fix, rawAcc }: { status: GeoStatus; fix: Fix | null; rawAcc: number | null }) {
  const [help, setHelp] = useState(false);
  if (status === 'off') return null;
  const l = gpsLine(status, fix, rawAcc, true);
  const color = l.tone === 'ok' ? 'var(--ok)' : l.tone === 'bad' ? 'var(--danger)' : l.tone === 'warn' ? '#e0a526' : 'var(--muted)';
  const fixable = status !== 'ok' && status !== 'waiting' && status !== 'unsupported';
  return (
    <>
      <button type="button" onClick={() => fixable && setHelp(true)} aria-live="polite"
        className="row" style={{ gap: 8, width: '100%', justifyContent: 'center', padding: '0 0 10px', background: 'none', border: 0, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: fixable ? 'pointer' : 'default', textAlign: 'left' }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', flex: 'none', background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` }} />
        <span>{l.text}{fixable && <span style={{ color: 'var(--accent)', marginLeft: 6, textDecoration: 'underline' }}>How to fix</span>}</span>
      </button>
      <GpsHelp open={help} onClose={() => setHelp(false)} status={status} />
    </>
  );
}
