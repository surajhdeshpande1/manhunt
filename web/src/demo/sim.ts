/**
 * The DEMO world: a complete in-browser copy of TAG's server. Every database function the app calls
 * is re-implemented here with the same rules (timers, reveals, shrinking zone, boundaries, catches,
 * tasks, win conditions, stats, badges, friends, invites, owner console), and fake players (bots)
 * move, hide, chase, do tasks and chat. Your own GPS is real.
 * Nothing here touches the real database.
 */
import { DEMO_ME as ME } from './mode';

type Pt = [number, number]; // [lng, lat]
type Zone = { lat: number; lng: number; r: number };
type Prof = {
  id: string; username: string; full_name: string; phone: string; dob: string; college: string; branch: string; year: number;
  selfie_path: string | null; is_organiser: boolean; is_owner: boolean; email: string; matches: number; wins: number; catches: number;
  tasks_done: number; times_caught: number; distance_m: number; title: string; card_style: string; bot?: boolean; task_mastery?: Record<string, number>;
};
type Room = {
  id: string; code: string; name: string; is_public: boolean; password: string | null; admin_id: string; status: string; paused_from: string | null;
  settings: any; boundary: Pt[] | null; nogo: Pt[][]; zone: Zone | null; zone_next: Zone | null; hide_ends_at: number | null; hunt_at: number | null;
  ends_at: number | null; next_shrink_at: number | null; paused_at: number | null; ended_at: number | null; winner: string | null; end_reason: string | null;
  max_players: number; runners_at_start: number; forced_reveal_until: number | null; created_at: number; auto_start_at?: number | null;
};
type Mem = {
  room_id: string; user_id: string; status: string; role: string | null; alive: boolean; out_reason: string | null; caught_by: string | null;
  tasks_done: number; task_seed: number | null; task_kind: number | null; task_started_at: number | null; last_task_at: number | null; catches: number;
  distance_m: number; oob_since: number | null; oob_reason: string | null; spoof_strikes: number; qr_token: string | null; via_invite: boolean; joined_at: number;
  ready?: boolean; last_task_kind?: number | null; task_streak?: number; ready_at?: number;
};
type Pos = { lat: number; lng: number; acc: number; at: number };
type Ev = { id: number; room_id: string; kind: string; vis: string; actor: string | null; target: string | null; data: any; at: number };
type Msg = { id: number; room_id: string; channel: string; user_id: string; body: string; at: number };
type Brain = { hold?: number; tx?: number; ty?: number; busyUntil?: number; nextTaskAt?: number; seen?: { lat: number; lng: number; id: string } | null; chatAt?: number };
type World = {
  v: number; seq: number; profiles: Record<string, Prof>; rooms: Record<string, Room>; members: Mem[]; pos: Record<string, Pos>;
  events: Ev[]; msgs: Msg[]; friends: { a: string; b: string; status: string; by: string; at: number }[];
  invites: { id: number; room_id: string; from_id: string; to_id: string; at: number }[];
  apps: { id: number; user_id: string; note: string; status: string; at: number }[]; badges: Record<string, { code: string; at: number }[]>;
  brains: Record<string, Brain>; home: { lat: number; lng: number }; ctl: { bots: number; speed: number };
};

const VERSION = 4;
const STORE = 'tag-demo-world';
const now = () => Date.now();
const iso = (t: number | null | undefined) => (t == null ? null : new Date(t).toISOString());
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const uid = () => 'b' + Math.random().toString(16).slice(2, 10) + '-' + Math.random().toString(16).slice(2, 6) + '-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const fail = (m: string): never => { throw new Error(m); };

/* ---------- geo ---------- */
const R = 6371000;
export function hav(a1: number, o1: number, a2: number, o2: number) {
  const r = Math.PI / 180, da = (a2 - a1) * r, dob = (o2 - o1) * r;
  const h = Math.sin(da / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dob / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function contains(poly: Pt[], lat: number, lng: number) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function edgeDist(poly: Pt[], lat: number, lng: number) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = (poly[j][0] - lng) * kx, ay = (poly[j][1] - lat) * ky, bx = (poly[i][0] - lng) * kx, by = (poly[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
const off = (lat: number, lng: number, dx: number, dy: number) => ({ lat: lat + dy / 110540, lng: lng + dx / (111320 * Math.cos((lat * Math.PI) / 180)) });
function areaAround(c: { lat: number; lng: number }, r = 230): { boundary: Pt[]; nogo: Pt[][] } {
  const boundary: Pt[] = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2 + 0.3; const k = r * (0.82 + ((i * 37) % 5) * 0.06); const p = off(c.lat, c.lng, Math.cos(a) * k, Math.sin(a) * k); return [p.lng, p.lat]; });
  const n = off(c.lat, c.lng, r * 0.45, -r * 0.35);
  const s = 22;
  const nogo: Pt[][] = [[[n.lng, n.lat], [off(n.lat, n.lng, s, 0).lng, n.lat], [off(n.lat, n.lng, s, 0).lng, off(n.lat, n.lng, 0, s).lat], [n.lng, off(n.lat, n.lng, 0, s).lat]]];
  return { boundary, nogo };
}
function initialZone(poly: Pt[]): Zone {
  let lat = 0, lng = 0; poly.forEach(([x, y]) => { lng += x; lat += y; }); lat /= poly.length; lng /= poly.length;
  let r = 0; poly.forEach(([x, y]) => { r = Math.max(r, hav(lat, lng, y, x)); });
  return { lat, lng, r: Math.round((r + 5) * 10) / 10 };
}

/* ---------- settings (same clamps as the server) ---------- */
function num(s: any, k: string, lo: number, hi: number, def: number) { const v = typeof s?.[k] === 'number' ? s[k] : def; return Math.max(lo, Math.min(hi, v)); }
function cleanSettings(s: any) {
  let c: string | null = null; try { c = s?.curfew_at ? new Date(s.curfew_at).toISOString() : null; } catch { c = null; }
  const o: any = {
    hide_secs: Math.round(num(s, 'hide_secs', 30, 1800, 420)), tasks_per_runner: Math.round(num(s, 'tasks_per_runner', 1, 99, 10)),
    cooldown_secs: Math.round(num(s, 'cooldown_secs', 0, 600, 30)), win_pct: Math.round(num(s, 'win_pct', 10, 100, 70)),
    reveal_every: Math.round(num(s, 'reveal_every', 30, 1800, 120)), reveal_for: Math.round(num(s, 'reveal_for', 5, 600, 45)),
    shrink_every: Math.round(num(s, 'shrink_every', 60, 3600, 300)), shrink_factor: num(s, 'shrink_factor', 0.3, 0.95, 0.8),
    min_zone_m: Math.round(num(s, 'min_zone_m', 20, 2000, 60)), match_secs: Math.round(num(s, 'match_secs', 300, 14400, 2400)),
    catch_radius_m: Math.round(num(s, 'catch_radius_m', 5, 200, 30)), buffer_m: Math.round(num(s, 'buffer_m', 0, 100, 10)),
    grace_secs: Math.round(num(s, 'grace_secs', 3, 120, 10)), max_acc_m: Math.round(num(s, 'max_acc_m', 10, 200, 35)), curfew_at: c,
    event: ['diwali', 'halloween', 'fest', 'holi'].includes(s?.event) ? s.event : 'none',
    task_kinds: (() => { const k = Array.isArray(s?.task_kinds) ? [...new Set<number>(s.task_kinds.map(Number).filter((x: number) => Number.isInteger(x) && x >= 0 && x <= 19))].sort((a, b) => a - b) : []; return k.length ? k : [...Array(20).keys()]; })(),
    task_difficulty: s?.task_difficulty === 'easy' || s?.task_difficulty === 'hard' ? s.task_difficulty : 'normal',
  };
  if (o.reveal_for > o.reveal_every) o.reveal_for = o.reveal_every;
  return o;
}
const QUICK = { hide_secs: 45, tasks_per_runner: 5, cooldown_secs: 20, win_pct: 70, reveal_every: 60, reveal_for: 20, shrink_every: 120, shrink_factor: 0.8, min_zone_m: 50, match_secs: 600, catch_radius_m: 30, buffer_m: 10, grace_secs: 10, max_acc_m: 100 };

/* ---------- bot faces ---------- */
const TONES = ['#c98a5a', '#a86d45', '#8a5636', '#d2a07a', '#b57b52', '#6e4429'];
const SHIRT = ['#d9541e', '#c9a227', '#3d4fd6', '#7fa38a', '#8ea0c8', '#b23a2b', '#ede6da'];
function face(seed: number) {
  const t = TONES[seed % TONES.length], s = SHIRT[(seed * 7) % SHIRT.length], h = ['#1b1410', '#2b1d14', '#120d0a'][seed % 3];
  const hair = seed % 2 ? `<path d="M22 34c0-14 9-22 18-22s18 8 18 22c-4-6-10-9-18-9s-14 3-18 9z" fill="${h}"/>` : `<path d="M20 38c0-16 9-26 20-26s20 10 20 26l-4 10c0-12-6-18-16-18s-16 6-16 18z" fill="${h}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#1f1f23"/><path d="M8 80c2-16 14-24 32-24s30 8 32 24z" fill="${s}"/><rect x="33" y="44" width="14" height="14" rx="4" fill="${t}"/><ellipse cx="40" cy="36" rx="15" ry="17" fill="${t}"/>${hair}<circle cx="34" cy="38" r="1.6" fill="#120d0a"/><circle cx="46" cy="38" r="1.6" fill="#120d0a"/><path d="M35 45q5 3 10 0" stroke="#5a2a18" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const NAMES: [string, string, string][] = [
  ['aarav_k', 'Aarav Kulkarni', 'CSE'], ['meera.s', 'Meera Shetty', 'ECE'], ['rohan_b', 'Rohan Badami', 'ME'], ['isha_p', 'Isha Patil', 'ISE'],
  ['kiran_h', 'Kiran Hegde', 'CV'], ['nidhi_r', 'Nidhi Rao', 'AIML'], ['pranav_j', 'Pranav Joshi', 'EEE'], ['sneha_m', 'Sneha Mudhol', 'ISE'],
  ['vikram_n', 'Vikram Naik', 'CSE'], ['ananya_d', 'Ananya Desai', 'BT'], ['tejas_g', 'Tejas Gouda', 'ME'], ['pooja_k', 'Pooja Kamat', 'ECE'],
  ['arjun_s', 'Arjun Savadi', 'CV'], ['diya_h', 'Diya Hiremath', 'CSE'], ['rahul_p', 'Rahul Pujar', 'AIML'], ['shreya_b', 'Shreya Bellad', 'ISE'],
  ['nikhil_t', 'Nikhil Teli', 'EEE'], ['kavya_r', 'Kavya Rajur', 'ECE'], ['sameer_a', 'Sameer Angadi', 'ME'], ['riya_c', 'Riya Chikkodi', 'CSE'],
  ['manoj_y', 'Manoj Yaligar', 'CV'], ['tanvi_l', 'Tanvi Lokapur', 'ISE'], ['harsha_v', 'Harsha Vastrad', 'AIML'], ['amulya_n', 'Amulya Nadaf', 'BT'],
];
const COLLEGES = ['Basaveshwar Engineering College, Bagalkot', 'Basaveshwar Engineering College, Bagalkot', 'BLDEA College of Engineering, Vijayapura', 'KLE Technological University, Hubballi', 'SDM College of Engineering, Dharwad'];
const TITLES = ['rookie', 'ghost', 'bloodhound', 'phantom', 'veteran', 'legend', 'shadow', 'marathoner'];
const LOBBY_LINES = ['Ready when you are', 'Who is hunting?', 'Let\'s gooo', 'I\'m near the library', 'Bring water guys', 'First time playing 👀', 'Hunters better be fast'];
const HUNTER_LINES = ['On my way', 'Spotted one', 'North side', 'Need backup', 'Cover the exit', 'Lost them near the canteen', 'Going east', 'Two runners by the gate'];

/* ---------- world ---------- */
let W: World;
const listeners = new Set<() => void>();
const msgSubs = new Set<(m: any) => void>();
let dirty = false;

function seedWorld(home = { lat: 16.1802, lng: 75.6902 }): World {
  const w: World = { v: VERSION, seq: 100, profiles: {}, rooms: {}, members: [], pos: {}, events: [], msgs: [], friends: [], invites: [], apps: [], badges: {}, brains: {}, home, ctl: { bots: 10, speed: 1 } };
  w.profiles[ME] = {
    id: ME, username: 'dev', full_name: 'Developer', phone: '+919999999999', dob: '2005-01-01', college: COLLEGES[0], branch: 'ISE', year: 3,
    selfie_path: face(99), is_organiser: true, is_owner: true, email: 'dev@demo.tag', matches: 12, wins: 7, catches: 9, tasks_done: 41, times_caught: 3,
    distance_m: 18350, title: 'ghost', card_style: 'ember',
  };
  w.badges[ME] = ['first_blood', 'ghost', 'first_win', 'veteran', 'marathon'].map((code, i) => ({ code, at: now() - (10 - i) * 864e5 }));
  NAMES.forEach(([u, n, b], i) => {
    const id = uid(); const m = 3 + ((i * 7) % 20);
    w.profiles[id] = { id, username: u, full_name: n, phone: '+9198' + String(76543210 + i * 1117).slice(0, 8), dob: '2004-06-0' + (1 + (i % 9)), college: COLLEGES[i % COLLEGES.length], branch: b, year: 1 + (i % 4),
      selfie_path: face(i), is_organiser: i < 4, is_owner: false, email: `${u}@demo.tag`, matches: m, wins: Math.floor(m * ((i % 5) / 6)), catches: (i * 3) % 17, tasks_done: (i * 11) % 60, times_caught: i % 6, distance_m: 2000 + i * 913,
      title: TITLES[i % TITLES.length], card_style: ['ember', 'police', 'midnight', 'gold'][i % 4], bot: true };
  });
  W = w;
  const bots = botIds();
  // friends: four accepted, one incoming request
  bots.slice(0, 4).forEach((b) => w.friends.push({ a: ME, b, status: 'accepted', by: ME, at: now() - 5e8 }));
  w.friends.push({ a: ME, b: bots[4], status: 'pending', by: bots[4], at: now() - 3e5 });
  // owner console
  w.apps.push({ id: 1, user_id: bots[5], note: 'Running the ECE fest night hunt, want to host public rooms.', status: 'pending', at: now() - 7e6 });
  w.apps.push({ id: 2, user_id: bots[9], note: 'Hostel warden approved a Saturday game.', status: 'pending', at: now() - 2e6 });
  w.apps.push({ id: 3, user_id: bots[1], note: 'Club lead.', status: 'approved', at: now() - 9e8 });
  // rooms
  const a1 = areaAround(home), a2 = areaAround(off(home.lat, home.lng, 320, 260), 200);
  const pub = mkRoom(bots[0], 'Friday Night Hunt', true, null, a1);
  bots.slice(6, 13).forEach((b) => addMember(pub.id, b, 'accepted'));
  const live = mkRoom(bots[1], 'Library Lockdown', true, null, a2);
  bots.slice(13, 21).forEach((b, i) => { addMember(live.id, b, 'accepted').role = i < 2 ? 'hunter' : 'runner'; });
  live.settings = cleanSettings({ ...QUICK, match_secs: 1800 }); startMatch(live, bots[1]); live.hide_ends_at = now() - 1000; startHunt(live, bots[1]);
  const priv = mkRoom(bots[2], 'Hostel Block Hunt', false, 'tag123', areaAround(off(home.lat, home.lng, -260, 180), 180));
  bots.slice(14, 19).forEach((b) => addMember(priv.id, b, 'accepted'));
  w.invites.push({ id: ++w.seq, room_id: priv.id, from_id: bots[1], to_id: ME, at: now() - 6e4 });
  const mine = mkRoom(ME, 'ISE vs CSE', false, 'ise2028', null);
  bots.slice(0, 3).forEach((b) => addMember(mine.id, b, 'accepted'));
  bots.slice(3, 5).forEach((b) => addMember(mine.id, b, 'pending'));
  return w;
}
function botIds() { return Object.values(W.profiles).filter((p) => p.bot).map((p) => p.id); }
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const w = JSON.parse(raw) as World; if (w.v === VERSION) { W = w; return; } }
  } catch { /* fall through */ }
  W = seedWorld();
  dirty = true;
}
function save() { if (!dirty) return; dirty = false; try { localStorage.setItem(STORE, JSON.stringify(W)); } catch { /* full */ } }
const touch = () => { dirty = true; listeners.forEach((f) => f()); };

function mkRoom(admin: string, name: string, pub: boolean, pw: string | null, area: { boundary: Pt[]; nogo: Pt[][] } | null): Room {
  const id = 'demo-' + hex(10);
  const r: Room = { id, code: Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join(''), name, is_public: pub, password: pw, admin_id: admin,
    status: 'lobby', paused_from: null, settings: cleanSettings({ max_acc_m: 100 }), boundary: area?.boundary ?? null, nogo: area?.nogo ?? [], zone: area ? initialZone(area.boundary) : null,
    zone_next: null, hide_ends_at: null, hunt_at: null, ends_at: null, next_shrink_at: null, paused_at: null, ended_at: null, winner: null, end_reason: null,
    max_players: 50, runners_at_start: 0, forced_reveal_until: null, created_at: now() };
  W.rooms[id] = r; return r;
}
function addMember(room: string, user: string, status: string, invite = false): Mem {
  let m = W.members.find((x) => x.room_id === room && x.user_id === user);
  if (!m) { m = { room_id: room, user_id: user, status, role: null, alive: true, out_reason: null, caught_by: null, tasks_done: 0, task_seed: null, task_kind: null, task_started_at: null, last_task_at: null, catches: 0, distance_m: 0, oob_since: null, oob_reason: null, spoof_strikes: 0, qr_token: null, via_invite: invite, joined_at: now(), ready: false }; W.members.push(m); }
  else { m.status = status; m.role = null; m.via_invite = invite; m.joined_at = now(); m.ready = false; }
  return m;
}
const mem = (room: string, user: string) => W.members.find((x) => x.room_id === room && x.user_id === user);
const roomMembers = (room: string) => W.members.filter((x) => x.room_id === room);
const pk = (room: string, user: string) => room + '|' + user;
const set = (r: Room, k: string) => Number(r.settings[k]);
function ev(room: string, kind: string, vis: string, actor: string | null, target: string | null, data: any = {}) { W.events.push({ id: ++W.seq, room_id: room, kind, vis, actor, target, data, at: now() }); if (W.events.length > 3000) W.events.splice(0, 1000); }
function adminRoom(id: string, who = ME) { const r = W.rooms[id] ?? fail('Room not found'); if (r.admin_id !== who) fail('Only the room admin can do that'); return r; }

/* ---------- engine (mirrors the server) ---------- */
function violation(r: Room, lat: number, lng: number) {
  const buf = set(r, 'buffer_m');
  if (r.boundary && !contains(r.boundary, lat, lng) && edgeDist(r.boundary, lat, lng) > buf) return 'boundary';
  if (r.status === 'hunt' && r.zone && hav(lat, lng, r.zone.lat, r.zone.lng) - r.zone.r > buf) return 'zone';
  for (const p of r.nogo || []) if (contains(p, lat, lng) && edgeDist(p, lat, lng) > buf) return 'nogo';
  return null;
}
function nextZone(r: Room, z: Zone): Zone {
  const nr = Math.max(set(r, 'min_zone_m'), z.r * set(r, 'shrink_factor'));
  if (nr >= z.r) return z;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (z.r - nr), p = off(z.lat, z.lng, Math.sin(a) * d, Math.cos(a) * d);
    if (!r.boundary || contains(r.boundary, p.lat, p.lng)) return { lat: p.lat, lng: p.lng, r: Math.round(nr * 10) / 10 };
  }
  return { lat: z.lat, lng: z.lng, r: Math.round(nr * 10) / 10 };
}
function doShrink(r: Room, forced: boolean) {
  if (!r.zone_next) return;
  const nz = r.zone_next;
  r.zone = nz; r.zone_next = nextZone(r, nz);
  r.next_shrink_at = (forced ? now() : r.next_shrink_at ?? now()) + set(r, 'shrink_every') * 1000;
  ev(r.id, 'shrink', 'all', null, null, { r: nz.r, forced });
}
function eliminate(r: Room, user: string, reason: string, by: string | null) {
  const m = mem(r.id, user);
  if (!m || !m.alive || m.status !== 'accepted') return;
  Object.assign(m, { alive: false, out_reason: reason, caught_by: by, task_seed: null, task_started_at: null, oob_since: null });
  if (reason === 'caught' && by) { const h = mem(r.id, by); if (h) h.catches++; }
  ev(r.id, reason === 'caught' ? 'caught' : 'eliminated', 'all', by, user, { reason, role: m.role });
}
function progress(r: Room) {
  const ms = roomMembers(r.id).filter((m) => m.status === 'accepted');
  const run = ms.filter((m) => m.role === 'runner'), hun = ms.filter((m) => m.role === 'hunter');
  const done = run.filter((m) => m.alive).reduce((a, m) => a + m.tasks_done, 0), alive = run.filter((m) => m.alive).length;
  const per = set(r, 'tasks_per_runner'), total = Math.max(1, (r.runners_at_start || run.length) * per);
  return { done, total, pct: Math.round((1000 * done) / total) / 10, max_pct: Math.round((1000 * alive * per) / total) / 10, mark: set(r, 'win_pct'),
    runners_alive: alive, runners: run.length, hunters_alive: hun.filter((m) => m.alive).length };
}
function award(user: string, code: string) { const b = (W.badges[user] ||= []); if (!b.some((x) => x.code === code)) b.push({ code, at: now() }); }
function finish(r: Room, winner: string, reason: string) {
  if (r.status === 'ended') return;
  Object.assign(r, { status: 'ended', ended_at: now(), winner, end_reason: reason });
  Object.keys(W.pos).forEach((k) => { if (k.startsWith(r.id + '|')) delete W.pos[k]; });
  W.events.forEach((e) => { if (e.room_id === r.id && e.kind === 'sos') { delete e.data.lat; delete e.data.lng; } });
  ev(r.id, 'end', 'all', null, null, { winner, reason, progress: progress(r) });
  for (const m of roomMembers(r.id)) {
    if (m.status !== 'accepted' || !m.role) continue;
    const p = W.profiles[m.user_id]; if (!p) continue;
    const won = (winner === 'runners' && m.role === 'runner') || (winner === 'hunters' && m.role === 'hunter');
    p.matches++; p.wins += won ? 1 : 0; p.catches += m.catches; p.tasks_done += m.tasks_done; p.times_caught += m.out_reason === 'caught' ? 1 : 0; p.distance_m += m.distance_m;
    if (m.catches >= 1) award(p.id, 'first_blood'); if (m.catches >= 3) award(p.id, 'hat_trick');
    if (m.role === 'runner' && m.alive) award(p.id, 'ghost');
    if (m.role === 'runner' && m.tasks_done >= set(r, 'tasks_per_runner')) award(p.id, 'full_clear');
    if (won) award(p.id, 'first_win'); if (p.matches >= 10) award(p.id, 'veteran'); if (p.distance_m >= 5000) award(p.id, 'marathon'); if (m.distance_m >= 2000) award(p.id, 'road_runner');
  }
}
function advance(r: Room) {
  if (r.status !== 'hiding' && r.status !== 'hunt') return;
  const c = r.settings.curfew_at ? new Date(r.settings.curfew_at).getTime() : null;
  if (c && now() >= c) return finish(r, 'none', 'curfew');
  for (const m of roomMembers(r.id)) if (m.alive && m.status === 'accepted' && m.oob_since && m.oob_since <= now() - set(r, 'grace_secs') * 1000) eliminate(r, m.user_id, m.oob_reason || 'boundary', null);
  const p = progress(r);
  if (r.status === 'hunt') {
    for (let i = 0; i < 5 && r.next_shrink_at && r.next_shrink_at <= now(); i++) doShrink(r, false);
    if (p.runners_alive === 0) return finish(r, 'hunters', 'all_caught');
    if (p.pct >= p.mark) return finish(r, 'runners', 'tasks');
    if (p.max_pct < p.mark) return finish(r, 'hunters', 'mark_unreachable');
    if (p.hunters_alive === 0) return finish(r, 'runners', 'no_hunters');
    if (r.ends_at && now() >= r.ends_at) return finish(r, 'hunters', 'time');
  } else {
    if (p.runners_alive === 0) return finish(r, 'hunters', 'all_caught');
    if (p.hunters_alive === 0) return finish(r, 'runners', 'no_hunters');
  }
}
function startMatch(r: Room, by: string) {
  if (r.status !== 'lobby') fail('Already started');
  if (!r.boundary) fail('Draw the play-area boundary first');
  const ms = roomMembers(r.id).filter((m) => m.status === 'accepted');
  const nh = ms.filter((m) => m.role === 'hunter').length, nr = ms.filter((m) => m.role === 'runner').length, nx = ms.filter((m) => !m.role).length;
  if (nx > 0) fail(`Assign a role to every player (${nx} left)`);
  if (nh < 1 || nr < 1) fail('You need at least 1 hunter and 1 runner');
  roomMembers(r.id).forEach((m) => { if (m.status === 'pending') m.status = 'rejected'; });
  ms.forEach((m) => Object.assign(m, { alive: true, out_reason: null, caught_by: null, tasks_done: 0, task_seed: null, task_kind: null, task_started_at: null, last_task_at: null, catches: 0, distance_m: 0, oob_since: null, oob_reason: null, spoof_strikes: 0, qr_token: hex(24) }));
  Object.keys(W.pos).forEach((k) => { if (k.startsWith(r.id + '|')) delete W.pos[k]; });
  Object.assign(r, { status: 'hiding', hide_ends_at: now() + set(r, 'hide_secs') * 1000, zone: initialZone(r.boundary!), zone_next: null, runners_at_start: nr, hunt_at: null, ends_at: null, next_shrink_at: null, forced_reveal_until: null, winner: null, end_reason: null, auto_start_at: null });
  ev(r.id, 'match_start', 'all', by, null, { hunters: nh, runners: nr });
  // drop the bots into the play area
  for (const m of ms) if (W.profiles[m.user_id]?.bot) placeBot(r, m);
}
function startHunt(r: Room, by: string) {
  if (r.status !== 'hiding') fail('The hunt can only start after the hide phase');
  if (now() < (r.hide_ends_at ?? 0) - 2000) fail('The hide timer is still running');
  Object.assign(r, { status: 'hunt', hunt_at: now(), ends_at: now() + set(r, 'match_secs') * 1000, next_shrink_at: now() + set(r, 'shrink_every') * 1000, zone_next: nextZone(r, r.zone!) });
  ev(r.id, 'hunt', 'all', by, null, {});
}
function reveal(r: Room) {
  let active = false, until: number | null = null, next: number | null = null;
  const live = r.status === 'hunt' || (r.status === 'paused' && r.paused_from === 'hunt');
  if (live && r.hunt_at) {
    const t = r.status === 'paused' ? r.paused_at! : now();
    const el = Math.max(0, (t - r.hunt_at) / 1000), cyc = set(r, 'reveal_every');
    if (r.status === 'hunt' && el >= cyc && el % cyc < set(r, 'reveal_for')) { active = true; until = r.hunt_at + (Math.floor(el / cyc) * cyc + set(r, 'reveal_for')) * 1000; }
    if (r.status === 'hunt' && r.forced_reveal_until && r.forced_reveal_until > now()) { active = true; until = Math.max(until ?? 0, r.forced_reveal_until); }
    next = r.hunt_at + (Math.floor(el / cyc) + 1) * cyc * 1000;
  }
  return { active, until, next };
}

/* ---------- bots ---------- */
function randIn(r: Room, shrink = 0.85) {
  const z = r.zone ?? initialZone(r.boundary!);
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r * shrink, p = off(z.lat, z.lng, Math.cos(a) * d, Math.sin(a) * d);
    if ((!r.boundary || contains(r.boundary, p.lat, p.lng)) && !violation(r, p.lat, p.lng)) return p;
  }
  return { lat: z.lat, lng: z.lng };
}
/** Hunters gather at a base on the far side of the area, so a player standing in the middle isn't tagged on the first second. */
function base(r: Room) { const z = r.zone ?? initialZone(r.boundary!); return off(z.lat, z.lng, -z.r * 0.5, z.r * 0.45); }
function placeBot(r: Room, m: Mem) {
  const bs = base(r);
  const p = m.role === 'hunter' ? off(bs.lat, bs.lng, rnd(-15, 15), rnd(-15, 15)) : randIn(r, 0.6);
  W.pos[pk(r.id, m.user_id)] = { lat: p.lat, lng: p.lng, acc: rnd(4, 12), at: now() };
  const t = m.role === 'hunter' ? p : randIn(r); W.brains[pk(r.id, m.user_id)] = { tx: t.lat, ty: t.lng, nextTaskAt: now() + rnd(15, 40) * 1000 };
}
function step(p: Pos, tlat: number, tlng: number, metres: number) {
  const d = hav(p.lat, p.lng, tlat, tlng); if (d < 0.5) return 0;
  const k = Math.min(1, metres / d); p.lat += (tlat - p.lat) * k; p.lng += (tlng - p.lng) * k; return Math.min(d, metres);
}
function botTick(r: Room, dt: number) {
  const ms = roomMembers(r.id).filter((m) => m.status === 'accepted' && m.alive && m.role);
  const rv = reveal(r).active;
  const posOf = (id: string) => W.pos[pk(r.id, id)];
  const runners = ms.filter((m) => m.role === 'runner'), hunters = ms.filter((m) => m.role === 'hunter');
  for (const m of ms) {
    if (!W.profiles[m.user_id]?.bot) continue;
    const key = pk(r.id, m.user_id);
    let p = posOf(m.user_id); if (!p) { placeBot(r, m); p = posOf(m.user_id); }
    const b = (W.brains[key] ||= {});
    let moved = 0;
    if (b.hold && now() < b.hold) { p.at = now(); continue; }
    if (m.role === 'runner') {
      const threat = hunters.map((h) => ({ h, q: posOf(h.user_id) })).filter((x) => x.q).map((x) => ({ ...x, d: hav(p.lat, p.lng, x.q!.lat, x.q!.lng) })).sort((a, c) => a.d - c.d)[0];
      if (r.status === 'hunt' && threat && threat.d < 65) {
        const away = off(p.lat, p.lng, (p.lng - threat.q!.lng) * 1e5, (p.lat - threat.q!.lat) * 1e5);
        let tl = away.lat, tg = away.lng;
        if (violation(r, tl, tg)) { const z = r.zone!; tl = z.lat; tg = z.lng; }
        moved = step(p, tl, tg, 3.3 * dt); b.busyUntil = 0;
      } else if (r.status === 'hunt' && b.busyUntil && now() < b.busyUntil) {
        // standing still doing a task
      } else {
        if (r.status === 'hunt' && b.busyUntil && now() >= b.busyUntil) {
          b.busyUntil = 0;
          if (m.tasks_done < set(r, 'tasks_per_runner') && !m.oob_since) { m.tasks_done++; m.last_task_at = now(); ev(r.id, 'task', 'admin', m.user_id, null, { n: m.tasks_done }); }
          b.nextTaskAt = now() + (set(r, 'cooldown_secs') + rnd(8, 30)) * 1000 / W.ctl.speed;
        }
        if (r.status === 'hunt' && b.nextTaskAt && now() >= b.nextTaskAt && m.tasks_done < set(r, 'tasks_per_runner') && !m.oob_since) { b.busyUntil = now() + rnd(6, 14) * 1000 / W.ctl.speed; b.nextTaskAt = 0; }
        if (b.tx == null || hav(p.lat, p.lng, b.tx, b.ty!) < 4 || violation(r, b.tx, b.ty!)) { const t = randIn(r); b.tx = t.lat; b.ty = t.lng; }
        moved = step(p, b.tx, b.ty!, (r.status === 'hiding' ? 2.4 : 1.6) * dt);
      }
    } else if (r.status === 'hunt') {
      // hunters chase what they can see: everyone during a reveal, or anyone within 45 m
      const seen = runners.map((x) => ({ x, q: posOf(x.user_id) })).filter((y) => y.q && now() - y.q.at < 30000)
        .map((y) => ({ ...y, d: hav(p.lat, p.lng, y.q!.lat, y.q!.lng) })).filter((y) => rv || y.d < 45).sort((a, c) => a.d - c.d)[0];
      if (seen) b.seen = { lat: seen.q!.lat, lng: seen.q!.lng, id: seen.x.user_id };
      if (b.seen) {
        moved = step(p, b.seen.lat, b.seen.lng, 3.0 * dt);
        if (hav(p.lat, p.lng, b.seen.lat, b.seen.lng) < 3) b.seen = null;
      } else {
        if (b.tx == null || hav(p.lat, p.lng, b.tx, b.ty!) < 4) { const t = randIn(r); b.tx = t.lat; b.ty = t.lng; }
        moved = step(p, b.tx, b.ty!, 2.0 * dt);
      }
      // tag anyone within reach (they "scan the code")
      const reach = Math.min(set(r, 'catch_radius_m'), 12);
      for (const x of runners) {
        const q = posOf(x.user_id); if (!q || !x.alive || now() - q.at > 30000) continue;
        if (hav(p.lat, p.lng, q.lat, q.lng) <= reach) { eliminate(r, x.user_id, 'caught', m.user_id); b.seen = null; if (x.user_id === ME) say(r, 'hunters', m.user_id, 'Got @dev 🔥'); }
      }
      if (b.chatAt == null || now() > b.chatAt) { b.chatAt = now() + rnd(25, 60) * 1000; if (Math.random() < 0.6) say(r, 'hunters', m.user_id, pick(HUNTER_LINES)); }
    } else {
      // hunters wait at base during the hide phase
      if (b.tx == null) { const bs = base(r); const t = off(bs.lat, bs.lng, rnd(-15, 15), rnd(-15, 15)); b.tx = t.lat; b.ty = t.lng; }
      moved = step(p, b.tx, b.ty!, 1 * dt);
    }
    p.at = now(); p.acc = Math.round(rnd(4, 12));
    m.distance_m += moved;
    const v = violation(r, p.lat, p.lng);
    m.oob_since = v ? m.oob_since ?? now() : null; m.oob_reason = v;
  }
}
function say(r: Room, channel: string, user: string, body: string) {
  const m: Msg = { id: ++W.seq, room_id: r.id, channel, user_id: user, body, at: now() };
  W.msgs.push(m); if (W.msgs.length > 1500) W.msgs.splice(0, 500);
  msgSubs.forEach((f) => f(m));
}
function worldTick() {
  const dt = W.ctl.speed;
  for (const r of Object.values(W.rooms)) {
    // bot-hosted rooms run themselves
    const botAdmin = !!W.profiles[r.admin_id]?.bot;
    if (r.status === 'lobby') {
      if (r.admin_id === ME) {
        // players trickle in and ask to join your room
        const inRoom = roomMembers(r.id).filter((m) => m.status === 'accepted' || m.status === 'pending').length;
        const b = (W.brains['lobby|' + r.id] ||= {});
        if (inRoom < W.ctl.bots && (!b.nextTaskAt || now() > b.nextTaskAt)) {
          b.nextTaskAt = now() + rnd(3, 7) * 1000 / W.ctl.speed;
          const free = botIds().filter((id) => !mem(r.id, id) || ['left', 'rejected'].includes(mem(r.id, id)!.status));
          if (free.length) addMember(r.id, pick(free), 'pending');
        }
      } else if (botAdmin) {
        const me = mem(r.id, ME);
        if (me?.status === 'pending' && now() - me.joined_at > 2500) me.status = 'accepted';
        if (me?.status === 'accepted' && r.boundary) {
          if (!r.auto_start_at) r.auto_start_at = now() + 30000 / W.ctl.speed;
          if (now() >= r.auto_start_at) { try { assignRoles(r, null); r.settings = cleanSettings({ ...r.settings, ...QUICK }); startMatch(r, r.admin_id); } catch { r.auto_start_at = now() + 10000; } }
        }
        const b = (W.brains['lobby|' + r.id] ||= {});
        if (me && (!b.chatAt || now() > b.chatAt)) { b.chatAt = now() + rnd(15, 40) * 1000; const ids = roomMembers(r.id).filter((m) => m.status === 'accepted' && m.user_id !== ME); if (ids.length) say(r, 'lobby', pick(ids).user_id, pick(LOBBY_LINES)); }
      }
    }
    if (r.status === 'lobby') for (const m of roomMembers(r.id)) {
      if (m.status !== 'accepted' || !W.profiles[m.user_id]?.bot || m.ready) continue;
      if (!m.ready_at) m.ready_at = now() + rnd(2, 14) * 1000 / W.ctl.speed;
      if (now() >= m.ready_at) { m.ready = true; m.ready_at = 0; }
    }
    if (r.status === 'hiding' && botAdmin && r.hide_ends_at && now() >= r.hide_ends_at) startHunt(r, r.admin_id);
    if (r.status === 'hiding' || r.status === 'hunt') { botTick(r, dt); advance(r); }
  }
  // bots accept your friend requests after a moment
  W.friends.forEach((f) => { if (f.status === 'pending' && f.by === ME && now() - f.at > 4000) f.status = 'accepted'; });
  touch();
}
function assignRoles(r: Room, myRole: string | null) {
  const ms = roomMembers(r.id).filter((m) => m.status === 'accepted');
  const others = ms.filter((m) => m.user_id !== ME).sort(() => Math.random() - 0.5);
  const nh = Math.max(1, Math.round(ms.length / 4));
  const me = ms.find((m) => m.user_id === ME);
  let hunters = nh;
  if (me) { me.role = myRole ?? (Math.random() < nh / ms.length ? 'hunter' : 'runner'); if (me.role === 'hunter') hunters--; }
  others.forEach((m, i) => { m.role = i < hunters ? 'hunter' : 'runner'; });
  if (!ms.some((m) => m.role === 'runner')) others[0] && (others[0].role = 'runner');
}

/* ---------- views ---------- */
function memberView(r: Room, m: Mem, isAdmin: boolean) {
  const p = W.profiles[m.user_id];
  return { id: p.id, username: p.username, name: p.full_name, selfie: p.selfie_path, college: p.college, branch: p.branch, year: p.year, title: p.title, status: m.status,
    role: isAdmin || r.status !== 'lobby' ? m.role : null, alive: m.alive, out_reason: m.out_reason, tasks: m.tasks_done, catches: m.catches,
    distance: r.status === 'ended' ? Math.round(m.distance_m) : null, phone: isAdmin ? p.phone : null, oob: isAdmin ? m.oob_since != null : null, invite: m.via_invite, ready: !!m.ready };
}
function unlocks(p: Prof) {
  const has = (c: string) => (W.badges[p.id] || []).some((b) => b.code === c);
  const titles = ['rookie'];
  if (has('ghost')) titles.push('ghost'); if (has('full_clear')) titles.push('shadow'); if (has('marathon')) titles.push('marathoner');
  if (p.catches >= 5) titles.push('bloodhound'); if (p.wins >= 3) titles.push('phantom'); if (p.matches >= 10) titles.push('veteran'); if (p.wins >= 10) titles.push('legend'); if (p.is_organiser) titles.push('chief');
  const styles = ['ember', 'police', 'midnight']; if (p.wins >= 1) styles.push('gold');
  return { titles, styles };
}
function roomState(a: any) {
  const r = W.rooms[a.p_room] ?? fail('Room not found');
  advance(r);
  const isAdmin = r.admin_id === ME;
  let me = mem(r.id, ME);
  const isMember = !!me && me.status === 'accepted';
  if (me && isMember && me.alive && (r.status === 'hiding' || r.status === 'hunt') && a.p_lat != null && a.p_lng != null) {
    if (a.p_acc != null && a.p_acc > 0 && a.p_acc <= set(r, 'max_acc_m')) {
      const k = pk(r.id, ME), prev = W.pos[k];
      if (prev) { const d = hav(prev.lat, prev.lng, a.p_lat, a.p_lng), dt = Math.max(0.5, (now() - prev.at) / 1000); if (dt <= 20 && d > 80 && d / dt > 15) me.spoof_strikes++; if (d >= 3 && d / dt < 12) me.distance_m += d; }
      W.pos[k] = { lat: a.p_lat, lng: a.p_lng, acc: a.p_acc, at: now() };
      const v = violation(r, a.p_lat, a.p_lng); me.oob_since = v ? me.oob_since ?? now() : null; me.oob_reason = v;
    }
    if (me.spoof_strikes >= 3) eliminate(r, ME, 'spoof', null);
    advance(r); me = mem(r.id, ME);
  }
  const canSee = isAdmin || isMember;
  const vAll = isAdmin || (isMember && !me!.alive) || r.status === 'ended';
  const rv = reveal(r);
  const ms = roomMembers(r.id);
  const myRole = me?.role;
  const vis = (e: Ev) => e.vis === 'all' || (e.vis === 'admin' && isAdmin) || (e.vis === 'hunters' && (isAdmin || myRole === 'hunter'));
  const adm = W.profiles[r.admin_id];
  return {
    now: new Date().toISOString(), is_admin: isAdmin,
    room: { id: r.id, code: canSee ? r.code : null, name: r.name, is_public: r.is_public, status: r.status, paused_from: r.paused_from, settings: r.settings, boundary: r.boundary, nogo: r.nogo,
      zone: r.zone, zone_next: r.zone_next, hide_ends_at: iso(r.hide_ends_at), hunt_at: iso(r.hunt_at), ends_at: iso(r.ends_at), next_shrink_at: iso(r.next_shrink_at), paused_at: iso(r.paused_at),
      ended_at: iso(r.ended_at), winner: r.winner, end_reason: r.end_reason, max_players: r.max_players, admin: { id: adm.id, username: adm.username, name: adm.full_name, selfie: adm.selfie_path } },
    me: !me ? null : { status: me.status, role: r.status !== 'lobby' ? me.role : null, alive: me.alive, out_reason: me.out_reason, tasks: me.tasks_done, catches: me.catches, distance: Math.round(me.distance_m),
      cooldown_until: me.last_task_at ? iso(me.last_task_at + set(r, 'cooldown_secs') * 1000) : null, task_active: me.task_seed != null, oob_since: iso(me.oob_since), oob_reason: me.oob_reason, strikes: me.spoof_strikes,
      qr: ['hiding', 'hunt', 'paused'].includes(r.status) && me.role === 'runner' && me.alive && me.status === 'accepted' ? me.qr_token : null },
    reveal: { active: rv.active, until: iso(rv.until), next_at: iso(rv.next) },
    progress: r.status !== 'lobby' && canSee ? progress(r) : null,
    members: !canSee ? [] : ms.filter((m) => m.status === 'accepted' || (isAdmin && m.status === 'pending') || (r.status === 'ended' && m.role && ['accepted', 'left', 'removed'].includes(m.status))).sort((x, y) => x.joined_at - y.joined_at).map((m) => memberView(r, m, isAdmin)),
    positions: !canSee || r.status === 'lobby' || r.status === 'ended' ? [] : ms.filter((m) => m.alive && m.status === 'accepted' && W.pos[pk(r.id, m.user_id)])
      .filter((m) => m.user_id === ME || vAll || m.role === myRole || (myRole === 'hunter' && m.role === 'runner' && rv.active))
      .map((m) => { const p = W.pos[pk(r.id, m.user_id)]; return { id: m.user_id, lat: p.lat, lng: p.lng, acc: p.acc, at: iso(p.at), role: m.role }; }),
    events: !canSee ? [] : W.events.filter((e) => e.room_id === r.id && e.id > (a.p_after || 0) && vis(e)).slice(-60).map((e) => ({ id: e.id, kind: e.kind, actor: e.actor, target: e.target, data: e.data, at: iso(e.at) })),
  };
}
function myProfile() {
  const p = W.profiles[ME];
  return { ...p, task_mastery: p.task_mastery ?? {}, badges: (W.badges[ME] || []).map((b) => ({ code: b.code, at: iso(b.at) })), application: null,
    friends_pending: W.friends.filter((f) => f.status === 'pending' && f.by !== ME).length,
    invites: W.invites.filter((i) => i.to_id === ME && W.rooms[i.room_id]?.status === 'lobby').length, unlocks: unlocks(p) };
}
const other = (f: { a: string; b: string }) => (f.a === ME ? f.b : f.a);

/* ---------- the API ---------- */
const H: Record<string, (a: any) => any> = {
  my_profile: myProfile,
  update_profile: (a) => { Object.assign(W.profiles[ME], { full_name: String(a.p_full_name).trim(), phone: String(a.p_phone).replace(/[\s-]/g, ''), college: String(a.p_college).trim(), branch: String(a.p_branch).trim().toUpperCase(), year: a.p_year }); },
  set_identity: (a) => { const p = W.profiles[ME], u = unlocks(p); if (a.p_title != null) { if (!u.titles.includes(a.p_title)) fail('That title is still locked'); p.title = a.p_title; } if (a.p_style != null) { if (!u.styles.includes(a.p_style)) fail('That card style is still locked'); p.card_style = a.p_style; } return u; },
  demo_set_selfie: (a) => { W.profiles[ME].selfie_path = a.p_path; },
  public_profile: (a) => { const p = Object.values(W.profiles).find((x) => x.username === String(a.p_username).toLowerCase().trim()); return p ? { id: p.id, username: p.username, name: p.full_name, selfie: p.selfie_path, college: p.college, branch: p.branch, year: p.year, matches: p.matches, wins: p.wins, catches: p.catches, tasks_done: p.tasks_done, distance_m: Math.round(p.distance_m), badges: (W.badges[p.id] || []).map((b) => b.code) } : null; },
  apply_organiser: () => fail('You are already an organiser'),
  owner_applications: () => W.apps.slice().sort((x, y) => (x.status === 'pending' ? 0 : 1) - (y.status === 'pending' ? 0 : 1) || y.at - x.at).map((a) => { const p = W.profiles[a.user_id]; return { id: a.id, note: a.note, status: a.status, at: iso(a.at), user: { id: p.id, username: p.username, name: p.full_name, selfie: p.selfie_path, college: p.college, branch: p.branch, year: p.year, matches: p.matches } }; }),
  owner_decide: (a) => { const x = W.apps.find((y) => y.id === a.p_app); if (x) { x.status = a.p_approve ? 'approved' : 'rejected'; W.profiles[x.user_id].is_organiser = !!a.p_approve; } },
  owner_find_user: (a) => { const p = Object.values(W.profiles).find((x) => x.username === String(a.p_username).toLowerCase().trim()); return p ? { id: p.id, username: p.username, name: p.full_name, selfie: p.selfie_path, email: p.email, phone: p.phone, is_organiser: p.is_organiser } : null; },
  friend_request: (a) => {
    const p = Object.values(W.profiles).find((x) => x.username === String(a.p_username).toLowerCase().trim()) ?? fail(`No player called ${a.p_username}`);
    if (p.id === ME) fail('That is you');
    const f = W.friends.find((x) => other(x) === p.id);
    if (f) { if (f.status === 'accepted') return 'already'; if (f.by !== ME) { f.status = 'accepted'; return 'accepted'; } return 'pending'; }
    W.friends.push({ a: ME, b: p.id, status: 'pending', by: ME, at: now() }); return 'sent';
  },
  friend_respond: (a) => { const i = W.friends.findIndex((x) => other(x) === a.p_user && x.by === a.p_user); if (i < 0) return; if (a.p_accept) W.friends[i].status = 'accepted'; else W.friends.splice(i, 1); },
  my_friends: () => W.friends.map((f) => { const p = W.profiles[other(f)]; return { id: p.id, username: p.username, name: p.full_name, selfie: p.selfie_path, college: p.college, wins: p.wins, matches: p.matches, status: f.status, incoming: f.status === 'pending' && f.by !== ME }; })
    .sort((x, y) => Number(y.status === 'pending') - Number(x.status === 'pending') || x.username.localeCompare(y.username)),
  invite_friend: (a) => {
    const r = W.rooms[a.p_room]; if (!r || r.status !== 'lobby') fail('You can only invite while the room is in the lobby');
    if (!W.friends.some((f) => other(f) === a.p_user && f.status === 'accepted')) fail('You can only invite friends');
    if (r!.admin_id === ME) setTimeout(() => { if (r!.status === 'lobby' && !mem(r!.id, a.p_user)) { addMember(r!.id, a.p_user, 'pending', true); touch(); } }, 2500);
  },
  my_invites: () => W.invites.filter((i) => i.to_id === ME && W.rooms[i.room_id]?.status === 'lobby' && !['accepted', 'pending'].includes(mem(i.room_id, ME)?.status ?? '')).map((i) => {
    const r = W.rooms[i.room_id], p = W.profiles[i.from_id];
    return { id: i.id, room_id: r.id, room: r.name, is_public: r.is_public, at: iso(i.at), from: { username: p.username, selfie: p.selfie_path }, players: roomMembers(r.id).filter((m) => m.status === 'accepted').length };
  }),
  dismiss_invite: (a) => { W.invites = W.invites.filter((i) => i.id !== a.p_id); },
  leaderboard: (a) => {
    const col = ({ catches: 'catches', tasks: 'tasks_done', distance: 'distance_m' } as any)[a.p_metric] ?? 'wins';
    const ps = Object.values(W.profiles).filter((p) => p.matches > 0);
    if (a.p_kind === 'colleges') {
      const g: Record<string, any> = {};
      ps.forEach((p) => { const x = (g[p.college] ||= { college: p.college, value: 0, players: 0, matches: 0 }); x.value += (p as any)[col]; x.players++; x.matches += p.matches; });
      return Object.values(g).map((x) => ({ ...x, value: Math.round(x.value) })).sort((x, y) => y.value - x.value);
    }
    return ps.sort((x, y) => (y as any)[col] - (x as any)[col] || x.matches - y.matches).slice(0, 50)
      .map((p) => ({ id: p.id, username: p.username, name: p.full_name, selfie: p.selfie_path, college: p.college, branch: p.branch, value: Math.round((p as any)[col]), matches: p.matches, me: p.id === ME }));
  },
  list_public_rooms: () => Object.values(W.rooms).filter((r) => r.is_public && r.status !== 'ended').sort((x, y) => Number(y.status === 'lobby') - Number(x.status === 'lobby') || y.created_at - x.created_at).map((r) => {
    const adm = W.profiles[r.admin_id];
    return { id: r.id, name: r.name, status: r.status, max: r.max_players, created_at: iso(r.created_at), players: roomMembers(r.id).filter((m) => m.status === 'accepted').length,
      admin: { username: adm.username, selfie: adm.selfie_path, college: adm.college }, has_area: !!r.boundary, my_status: mem(r.id, ME)?.status ?? null, is_admin: r.admin_id === ME };
  }),
  my_rooms: () => Object.values(W.rooms).filter((r) => (r.admin_id === ME || ['accepted', 'pending'].includes(mem(r.id, ME)?.status ?? '')) && (r.status !== 'ended' || (r.ended_at ?? 0) > now() - 3 * 3600e3))
    .sort((x, y) => y.created_at - x.created_at)
    .map((r) => ({ id: r.id, name: r.name, status: r.status, is_public: r.is_public, created_at: iso(r.created_at), is_admin: r.admin_id === ME, my_status: mem(r.id, ME)?.status ?? null, players: roomMembers(r.id).filter((m) => m.status === 'accepted').length })),
  create_room: (a) => {
    if (!a.p_public && (!a.p_password || String(a.p_password).length < 4)) fail('Private rooms need a password of at least 4 characters');
    if (Object.values(W.rooms).filter((r) => r.admin_id === ME && r.status !== 'ended').length >= 3) fail('You already host 3 open rooms. End one first.');
    return mkRoom(ME, String(a.p_name).trim(), !!a.p_public, a.p_public ? null : a.p_password, null).id;
  },
  update_room: (a) => { const r = adminRoom(a.p_room); if (r.status !== 'lobby') fail('Settings lock once the match starts'); if (a.p_name?.trim()) r.name = a.p_name.trim(); if (a.p_settings) r.settings = cleanSettings({ ...r.settings, ...a.p_settings }); if (!r.is_public && a.p_password && a.p_password.length >= 4) r.password = a.p_password; },
  set_area: (a) => {
    const r = adminRoom(a.p_room); if (r.status !== 'lobby') fail('The play area locks once the match starts');
    if (!Array.isArray(a.p_boundary) || a.p_boundary.length < 3 || a.p_boundary.length > 200) fail('The boundary needs 3 to 200 points');
    const ng = a.p_nogo || []; if (ng.length > 10) fail('Up to 10 no-go zones'); ng.forEach((p: Pt[]) => { if (p.length < 3 || p.length > 200) fail('Each no-go zone needs 3 to 200 points'); });
    r.boundary = a.p_boundary; r.nogo = ng; r.zone = initialZone(a.p_boundary);
  },
  request_join: (a) => {
    const r = (a.p_room ? W.rooms[a.p_room] : Object.values(W.rooms).find((x) => x.code === String(a.p_code ?? '').trim().toUpperCase())) ?? fail('Wrong room ID or password');
    if (!W.profiles[ME].selfie_path) fail('Add your selfie before joining a room');
    if (r.admin_id === ME) return r.id;
    const m = mem(r.id, ME);
    if (m && ['accepted', 'pending'].includes(m.status)) return r.id;
    if (m?.status === 'removed') fail('The admin removed you from this room');
    if (r.status !== 'lobby') fail('This match has already started');
    const invited = W.invites.some((i) => i.room_id === r.id && i.to_id === ME);
    if (!r.is_public && !invited && (a.p_password == null || a.p_password !== r.password)) fail('Wrong room ID or password');
    if (roomMembers(r.id).filter((x) => x.status === 'accepted').length >= r.max_players) fail('This room is full');
    addMember(r.id, ME, 'pending', invited); return r.id;
  },
  leave_room: (a) => {
    const r = W.rooms[a.p_room] ?? fail('Room not found'); if (r.admin_id === ME) fail('You are the admin. End the match instead.');
    const m = mem(r.id, ME); if (!m) return;
    if (['hiding', 'hunt', 'paused'].includes(r.status) && m.status === 'accepted' && m.alive) eliminate(r, ME, 'left', null);
    if (m.status !== 'removed') m.status = 'left'; delete W.pos[pk(r.id, ME)]; advance(r);
  },
  decide_request: (a) => { const r = adminRoom(a.p_room); if (r.status !== 'lobby') fail('The match has started'); const m = mem(r.id, a.p_user); if (m?.status === 'pending') { m.status = a.p_accept ? 'accepted' : 'rejected'; m.ready = false; } },
  accept_all: (a) => { const r = adminRoom(a.p_room); if (r.status !== 'lobby') fail('The match has started'); let n = 0; roomMembers(r.id).forEach((m) => { if (m.status === 'pending') { m.status = 'accepted'; m.ready = false; n++; } }); return n; },
  set_role: (a) => { const r = adminRoom(a.p_room); if (r.status !== 'lobby') fail('Roles lock once the match starts'); const m = mem(r.id, a.p_user); if (m?.status === 'accepted') m.role = a.p_role; },
  shuffle_roles: (a) => {
    const r = adminRoom(a.p_room); if (r.status !== 'lobby') fail('Roles lock once the match starts');
    const ms = roomMembers(r.id).filter((m) => m.status === 'accepted'); if (a.p_hunters < 1 || a.p_hunters >= ms.length) fail(`Pick between 1 and ${Math.max(ms.length - 1, 1)} hunters`);
    ms.sort(() => Math.random() - 0.5).forEach((m, i) => { m.role = i < a.p_hunters ? 'hunter' : 'runner'; });
  },
  remove_member: (a) => { const r = adminRoom(a.p_room); if (['hiding', 'hunt', 'paused'].includes(r.status)) eliminate(r, a.p_user, 'removed', null); const m = mem(r.id, a.p_user); if (m) m.status = 'removed'; delete W.pos[pk(r.id, a.p_user)]; advance(r); },
  start_match: (a) => startMatch(adminRoom(a.p_room), ME),
  start_hunt: (a) => startHunt(adminRoom(a.p_room), ME),
  pause_match: (a) => { const r = adminRoom(a.p_room); if (!['hiding', 'hunt'].includes(r.status)) fail('Nothing to pause'); Object.assign(r, { paused_from: r.status, status: 'paused', paused_at: now() }); roomMembers(r.id).forEach((m) => { m.oob_since = null; }); ev(r.id, 'pause', 'all', ME, null); },
  resume_match: (a) => {
    const r = adminRoom(a.p_room); if (r.status !== 'paused') fail('The match is not paused'); const d = now() - r.paused_at!;
    const add = (t: number | null) => (t == null ? null : t + d);
    Object.assign(r, { status: r.paused_from, paused_from: null, paused_at: null, hide_ends_at: add(r.hide_ends_at), hunt_at: add(r.hunt_at), ends_at: add(r.ends_at), next_shrink_at: add(r.next_shrink_at), forced_reveal_until: add(r.forced_reveal_until) });
    roomMembers(r.id).forEach((m) => { m.oob_since = null; m.last_task_at = add(m.last_task_at); }); ev(r.id, 'resume', 'all', ME, null);
  },
  force_reveal: (a) => { const r = adminRoom(a.p_room); if (r.status !== 'hunt') fail('Reveals only work during the hunt'); r.forced_reveal_until = now() + set(r, 'reveal_for') * 1000; ev(r.id, 'reveal', 'all', ME, null, { forced: true }); },
  force_shrink: (a) => { const r = adminRoom(a.p_room); if (r.status !== 'hunt') fail('The zone only shrinks during the hunt'); doShrink(r, true); },
  end_match: (a) => { const r = adminRoom(a.p_room); if (r.status === 'lobby') { Object.assign(r, { status: 'ended', ended_at: now(), winner: 'none', end_reason: 'closed' }); return; } if (r.status !== 'ended') finish(r, 'none', 'admin'); },
  broadcast: (a) => { const r = adminRoom(a.p_room); const t = String(a.p_text ?? '').trim(); if (t.length < 1 || t.length > 200) fail('Keep announcements to 200 characters'); ev(r.id, 'broadcast', 'all', ME, null, { text: t }); },
  admin_mark_caught: (a) => { const r = adminRoom(a.p_room); if (!['hunt', 'paused'].includes(r.status)) fail('Only during the hunt'); eliminate(r, a.p_user, 'caught', null); advance(r); },
  catch_runner: (a) => {
    const r = W.rooms[a.p_room] ?? fail('Room not found'); advance(r);
    if (r.status !== 'hunt') fail('The hunt is not on right now');
    const h = mem(r.id, ME); if (!h || h.status !== 'accepted' || h.role !== 'hunter') fail('Only hunters can catch runners'); if (!h!.alive) fail('You are out of this match');
    const t = roomMembers(r.id).find((m) => m.qr_token === a.p_token && m.status === 'accepted'); if (!t || t.role !== 'runner') fail('That QR does not belong to a runner in this match'); if (!t!.alive) fail('That runner is already out');
    const tp = W.pos[pk(r.id, t!.user_id)]; if (!tp || tp.at < now() - 30000) fail('The runner\'s GPS has not updated in the last 30 s. Ask the admin to confirm this catch.');
    let d: number;
    if (a.p_lat != null && a.p_lng != null && a.p_acc != null && a.p_acc <= set(r, 'max_acc_m') * 2) d = hav(a.p_lat, a.p_lng, tp.lat, tp.lng);
    else { const hp = W.pos[pk(r.id, ME)]; if (!hp || hp.at < now() - 30000) fail('Your GPS signal is too weak to confirm a catch. Step into the open and try again.'); d = hav(hp!.lat, hp!.lng, tp.lat, tp.lng); }
    const rad = set(r, 'catch_radius_m'); if (d > rad) fail(`Too far: GPS puts you ${Math.round(d)} m apart. Get within ${Math.round(rad)} m.`);
    eliminate(r, t!.user_id, 'caught', ME); advance(r);
    return { caught: t!.user_id, username: W.profiles[t!.user_id].username, distance: Math.round(d) };
  },
  start_task: (a) => {
    const r = W.rooms[a.p_room] ?? fail('Room not found'); advance(r); if (r.status !== 'hunt') fail('Tasks unlock when the hunt begins');
    const m = mem(r.id, ME); if (!m || m.status !== 'accepted' || m.role !== 'runner') fail('Only runners do tasks'); if (!m!.alive) fail('You are out of this match');
    if (m!.oob_since) fail('Tasks are locked while you are outside the zone');
    const per = set(r, 'tasks_per_runner'); if (m!.tasks_done >= per) fail('All your tasks are done');
    const cd = (m!.last_task_at ?? 0) + set(r, 'cooldown_secs') * 1000;
    if (m!.task_seed == null && m!.last_task_at && cd > now()) fail(`Cooldown: ${Math.ceil((cd - now()) / 1000)} s left`);
    if (m!.task_seed == null) {
      let kinds: number[] = (r.settings.task_kinds ?? [...Array(20).keys()]).slice();
      if (kinds.length > 1 && m!.last_task_kind != null) kinds = kinds.filter((k) => k !== m!.last_task_kind);
      Object.assign(m!, { task_seed: Math.floor(Math.random() * 2e9), task_kind: pick(kinds), task_started_at: now() });
    }
    const mastery = W.profiles[ME].task_mastery?.[String(m!.task_kind)] ?? 0;
    const off = r.settings.task_difficulty === 'easy' ? -1 : r.settings.task_difficulty === 'hard' ? 1 : 0;
    const level = Math.max(1, Math.min(5, 1 + Math.min(2, Math.floor(mastery / 3)) + Math.min(2, Math.floor(m!.tasks_done / 4)) + Math.min(2, Math.floor((m!.task_streak ?? 0) / 2)) + off));
    return { seed: m!.task_seed, kind: m!.task_kind, index: m!.tasks_done + 1, of: per, started_at: iso(m!.task_started_at), level };
  },
  complete_task: (a) => {
    const r = W.rooms[a.p_room] ?? fail('Room not found'); advance(r); if (r.status !== 'hunt') fail('The hunt is not on right now');
    const m = mem(r.id, ME); if (!m || m.status !== 'accepted' || m.role !== 'runner' || !m.alive) fail('You cannot do tasks right now');
    if (m!.task_seed == null || m!.task_seed !== a.p_seed) fail('That task has expired. Start a new one.');
    if (m!.oob_since) fail('Tasks are locked while you are outside the zone');
    if (now() < m!.task_started_at! + 4000) fail('Too fast');
    const pr = W.profiles[ME]; const k = String(m!.task_kind ?? 0);
    pr.task_mastery = { ...(pr.task_mastery ?? {}), [k]: ((pr.task_mastery ?? {})[k] ?? 0) + 1 };
    Object.assign(m!, { tasks_done: m!.tasks_done + 1, task_streak: (m!.task_streak ?? 0) + 1, last_task_at: now(), last_task_kind: m!.task_kind, task_seed: null, task_kind: null, task_started_at: null });
    ev(r.id, 'task', 'admin', ME, null, { n: m!.tasks_done }); advance(r); return progress(r);
  },
  fail_task: (a) => { const r = W.rooms[a.p_room]; const m = r && mem(r.id, ME); if (m && m.task_seed != null) Object.assign(m, { task_streak: 0, last_task_kind: m.task_kind, task_seed: null, task_kind: null, task_started_at: null, last_task_at: now() - set(r!, 'cooldown_secs') * 1000 + 10000 }); },
  send_sos: (a) => { const m = mem(a.p_room, ME); if (!m || m.status !== 'accepted') fail('Not in this room'); const p = W.profiles[ME]; ev(a.p_room, 'sos', 'admin', ME, null, { lat: a.p_lat, lng: a.p_lng, username: p.username, phone: p.phone }); },
  send_message: (a) => {
    const r = W.rooms[a.p_room] ?? fail('Room not found'); const m = mem(r.id, ME);
    const ok = r.admin_id === ME || (m?.status === 'accepted' && (a.p_channel === 'lobby' || (a.p_channel === 'hunters' && m.role === 'hunter' && r.status !== 'lobby')));
    if (!ok) fail('You cannot post in this channel');
    const body = String(a.p_body ?? '').trim(); if (body.length < 1 || body.length > 300) fail('Messages are 1 to 300 characters');
    say(r, a.p_channel, ME, body);
    // someone usually answers
    if (Math.random() < 0.5) setTimeout(() => { const ids = roomMembers(r.id).filter((x) => x.status === 'accepted' && x.user_id !== ME && (a.p_channel === 'lobby' || x.role === 'hunter')); if (ids.length) { say(r, a.p_channel, pick(ids).user_id, pick(a.p_channel === 'hunters' ? HUNTER_LINES : LOBBY_LINES)); touch(); } }, rnd(1500, 4000));
  },
  set_ready: (a) => {
    const r = W.rooms[a.p_room] ?? fail('Room not found'); if (r.status !== 'lobby') fail('The match has already started');
    const m = mem(r.id, ME); if (!m || m.status !== 'accepted') fail('You are not in this room yet'); m!.ready = !!a.p_ready;
  },
  room_state: roomState,
};

/* ---------- public surface ---------- */
let started = false;
function start() {
  if (started) return; started = true;
  load();
  setInterval(() => { try { worldTick(); } catch (e) { console.warn('[demo]', e); } }, 1000);
  setInterval(save, 1500);
  window.addEventListener('pagehide', () => { dirty = true; save(); });
}
export async function call(fn: string, args: Record<string, any> = {}) {
  start();
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 90)); // feels like a network round trip
  const h = H[fn]; if (!h) fail(`Demo: ${fn} is not simulated`);
  const out = h!(args); touch(); return out === undefined ? null : JSON.parse(JSON.stringify(out));
}
export async function callFn(name: string, body: any) {
  start();
  await new Promise((r) => setTimeout(r, 200));
  if (name === 'owner-reset') return { ok: true, temp_password: 'DEMO-' + Math.floor(1000 + Math.random() * 9000) };
  const e = new Error(name === 'voice-token' ? 'not_configured' : 'Not available in the demo') as Error & { code?: string };
  e.code = name === 'voice-token' ? 'not_configured' : 'demo'; void body; throw e;
}
export function messages(room: string, channel: string) { start(); return W.msgs.filter((m) => m.room_id === room && m.channel === channel).slice(-60).map((m) => ({ id: m.id, user_id: m.user_id, body: m.body, at: iso(m.at) })); }
export function onMessage(f: (m: any) => void) { start(); const g = (m: Msg) => f({ ...m, at: iso(m.at) }); msgSubs.add(g); return () => { msgSubs.delete(g); }; }
export function subscribe(f: () => void) { start(); listeners.add(f); return () => { listeners.delete(f); }; }

/* ---------- developer controls ---------- */
function myPos(): Promise<{ lat: number; lng: number }> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(W.home);
    navigator.geolocation.getCurrentPosition((p) => { W.home = { lat: p.coords.latitude, lng: p.coords.longitude }; res(W.home); }, () => res(W.home), { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
  });
}
export const ctl = {
  get: () => { start(); return { ...W.ctl }; },
  set: (k: 'bots' | 'speed', v: number) => { start(); W.ctl[k] = v; touch(); },
  /** Fresh match around where you are standing, already in the hide phase. */
  async quick(role: 'runner' | 'hunter' | 'admin') {
    start();
    const c = await myPos();
    const bots = botIds().sort(() => Math.random() - 0.5);
    const n = Math.max(3, Math.min(bots.length - 1, W.ctl.bots));
    const host = role === 'admin' ? ME : bots[n];
    const r = mkRoom(host, role === 'admin' ? 'Demo · my match' : `Demo · ${role} test`, false, 'demo', areaAround(c, 220));
    r.settings = cleanSettings({ ...QUICK });
    bots.slice(0, n).forEach((b) => addMember(r.id, b, 'accepted'));
    if (role !== 'admin') addMember(r.id, ME, 'accepted');
    assignRoles(r, role === 'admin' ? null : role);
    startMatch(r, host);
    touch(); save();
    return r.id;
  },
  /** Events you can trigger inside a room. */
  act(roomId: string, what: string): string {
    start();
    const r = W.rooms[roomId]; if (!r) return 'Open a demo room first';
    const ms = roomMembers(r.id).filter((m) => m.status === 'accepted' && m.alive);
    const bots = (role: string) => ms.filter((m) => m.role === role && W.profiles[m.user_id]?.bot);
    const myP = W.pos[pk(r.id, ME)];
    const near = (list: Mem[]) => list.map((m) => ({ m, p: W.pos[pk(r.id, m.user_id)] })).filter((x) => x.p)
      .sort((a, b) => (myP ? hav(myP.lat, myP.lng, a.p.lat, a.p.lng) - hav(myP.lat, myP.lng, b.p.lat, b.p.lng) : 0))[0];
    let msg = 'Done';
    switch (what) {
      case 'skip_hide': if (r.status !== 'hiding') return 'Only during the hide phase'; r.hide_ends_at = now(); msg = r.admin_id === ME ? 'Hide timer finished. Start the hunt from the admin panel.' : 'Hunt starting'; break;
      case 'reveal': if (r.status !== 'hunt') return 'Only during the hunt'; r.forced_reveal_until = now() + set(r, 'reveal_for') * 1000; ev(r.id, 'reveal', 'all', r.admin_id, null, { forced: true }); break;
      case 'shrink': if (r.status !== 'hunt') return 'Only during the hunt'; doShrink(r, true); break;
      case 'catch_me': { const me = mem(r.id, ME); if (!me?.alive || me.role !== 'runner' || r.status !== 'hunt') return 'You need to be an alive runner during the hunt'; const h = bots('hunter')[0]; eliminate(r, ME, 'caught', h?.user_id ?? null); break; }
      case 'scan_nearest': {
        const me = mem(r.id, ME); if (me?.role !== 'hunter') return 'You need to be a hunter';
        const x = near(bots('runner')); if (!x) return 'No runner to scan';
        try { const out = H.catch_runner({ p_room: r.id, p_token: x.m.qr_token, p_lat: myP?.lat, p_lng: myP?.lng, p_acc: myP?.acc }); msg = `Caught @${out.username} at ${out.distance} m`; } catch (e: any) { msg = e.message; }
        break;
      }
      case 'bring_runner': {
        if (!myP) return 'Waiting for your GPS';
        const x = near(bots('runner')); if (!x) return 'No runner left';
        const p = off(myP.lat, myP.lng, rnd(-8, 8), rnd(-8, 8)); Object.assign(x.p, { lat: p.lat, lng: p.lng, at: now() });
        const b = (W.brains[pk(r.id, x.m.user_id)] ||= {}); b.hold = now() + 20000; msg = `@${W.profiles[x.m.user_id].username} is frozen next to you for 20 s`; break;
      }
      case 'bring_hunter': {
        if (!myP) return 'Waiting for your GPS';
        const x = near(bots('hunter')); if (!x) return 'No hunter left';
        const p = off(myP.lat, myP.lng, rnd(-60, 60), rnd(-60, 60)); Object.assign(x.p, { lat: p.lat, lng: p.lng, at: now() });
        const b = W.brains[pk(r.id, x.m.user_id)]; if (b) b.seen = { lat: myP.lat, lng: myP.lng, id: ME }; msg = `@${W.profiles[x.m.user_id].username} is closing in`; break;
      }
      case 'bot_sos': { const x = pick(ms.filter((m) => W.profiles[m.user_id]?.bot)); if (!x) return 'No bots'; const p = W.pos[pk(r.id, x.user_id)], u = W.profiles[x.user_id]; ev(r.id, 'sos', 'admin', x.user_id, null, { lat: p?.lat, lng: p?.lng, username: u.username, phone: u.phone }); msg = `SOS from @${u.username} (admins see it)`; break; }
      case 'bot_out': {
        const x = pick(bots('runner')); if (!x || !r.boundary) return 'No runner bot';
        const z = initialZone(r.boundary); const p = off(z.lat, z.lng, z.r * 1.5, 0); const q = W.pos[pk(r.id, x.user_id)];
        if (q) Object.assign(q, { lat: p.lat, lng: p.lng, at: now() }); const b = W.brains[pk(r.id, x.user_id)]; if (b) { b.tx = p.lat; b.ty = p.lng; b.busyUntil = now() + 60000; }
        x.oob_since = now(); x.oob_reason = 'boundary'; msg = `@${W.profiles[x.user_id].username} ran outside the boundary`; break;
      }
      case 'my_task': { const me = mem(r.id, ME); if (!me?.alive || me.role !== 'runner' || r.status !== 'hunt') return 'You need to be an alive runner during the hunt'; if (me.tasks_done >= set(r, 'tasks_per_runner')) return 'All your tasks are done'; me.tasks_done++; me.last_task_at = now(); ev(r.id, 'task', 'admin', ME, null, { n: me.tasks_done }); break; }
      case 'runners_win': { if (r.status !== 'hunt') return 'Only during the hunt'; bots('runner').forEach((m) => { m.tasks_done = set(r, 'tasks_per_runner'); }); const me = mem(r.id, ME); if (me?.alive && me.role === 'runner') me.tasks_done = set(r, 'tasks_per_runner'); break; }
      case 'hunters_win': { if (!['hunt', 'hiding'].includes(r.status)) return 'Only during a match'; ms.filter((m) => m.role === 'runner').forEach((m) => eliminate(r, m.user_id, 'caught', bots('hunter')[0]?.user_id ?? null)); break; }
      case 'end_soon': { if (r.status !== 'hunt') return 'Only during the hunt'; r.ends_at = now() + 30000; msg = 'Match ends in 30 s'; break; }
      default: return 'Unknown action';
    }
    advance(r); touch(); save();
    return msg;
  },
  reset() { W = seedWorld(W.home); dirty = true; save(); },
};
