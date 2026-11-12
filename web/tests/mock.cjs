// Drives the built app with fake server responses so every screen can be checked.
const { chromium, devices } = require('playwright');
const zlib = require('zlib');
const OUT = require('path').join(__dirname, 'shots') + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const REF = 'lljeqtlkujaaxuqipouk';
const now = () => new Date();
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const ME = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const ppl = [
  ['aarav_k', 'Aarav Kulkarni', 'CSE', 3, 'hunter'], ['meera.s', 'Meera Shetty', 'ECE', 2, 'runner'], ['rohan_b', 'Rohan Badami', 'ME', 4, 'runner'],
  ['isha_p', 'Isha Patil', 'ISE', 3, 'hunter'], ['kiran_h', 'Kiran Hegde', 'CV', 1, 'runner'], ['nidhi_r', 'Nidhi Rao', 'AIML', 2, 'runner'],
];
const members = (opts = {}) => [
  { id: ME, username: 'suraj', name: 'Suraj Deshpande', selfie: 'me.jpg', college: 'Basaveshwar Engineering College, Bagalkot', branch: 'ISE', year: 3, status: 'accepted', role: opts.myRole ?? null, alive: true, out_reason: null, tasks: opts.myTasks ?? 0, catches: 0, phone: opts.admin ? '+919876543210' : null },
  ...ppl.map(([u, n, b, y, r], i) => ({ id: `0000000${i}-0000-4000-8000-00000000000${i}`, username: u, name: n, selfie: `p${i}.jpg`, college: 'Basaveshwar Engineering College, Bagalkot', branch: b, year: y,
    status: opts.pendingLast && i >= 4 ? 'pending' : 'accepted', title: ['bloodhound', 'ghost', null, 'phantom', null, 'legend'][i], role: opts.roles === false ? null : r, alive: opts.dead?.includes(i) ? false : true, out_reason: opts.dead?.includes(i) ? 'caught' : null,
    tasks: r === 'runner' ? [0, 4, 3, 0, 2, 5][i] : 0, catches: r === 'hunter' ? [1, 0, 0, 1, 0, 0][i] : 0, phone: opts.admin ? '+9198765432' + (10 + i) : null, distance: opts.ended ? 800 + i * 230 : null, oob: opts.admin && i === 2 })),
];
const B = [[75.6880, 16.1780], [75.6922, 16.1778], [75.6930, 16.1812], [75.6898, 16.1826], [75.6874, 16.1808]];
const NOGO = [[[75.6893, 16.1790], [75.6902, 16.1790], [75.6902, 16.1797], [75.6893, 16.1797]]];
const settings = { event: process.env.EVENT || 'none', hide_secs: 420, tasks_per_runner: 10, cooldown_secs: 30, win_pct: 70, reveal_every: 120, reveal_for: 45, shrink_every: 300, shrink_factor: 0.8, min_zone_m: 60, match_secs: 2400, catch_radius_m: 30, buffer_m: 10, grace_secs: 10, max_acc_m: 35, curfew_at: null };
function state(kind) {
  const base = { now: now().toISOString(), is_admin: false, reveal: { active: false, until: null, next_at: iso(72000) }, progress: null, positions: [], events: [],
    room: { id: 'r1', code: 'K7QX3M', name: 'Friday Night Hunt', is_public: false, status: 'lobby', paused_from: null, settings, boundary: B, nogo: NOGO, zone: { lat: 16.1802, lng: 75.6902, r: 260 },
      zone_next: null, hide_ends_at: null, hunt_at: null, ends_at: null, next_shrink_at: null, paused_at: null, ended_at: null, winner: null, end_reason: null, max_players: 50,
      admin: { id: ADMIN, username: 'gourav', name: 'Gourav', selfie: 'admin.jpg' } },
    me: { status: 'accepted', role: null, alive: true, out_reason: null, tasks: 0, catches: 0, distance: 0, cooldown_until: null, task_active: false, oob_since: null, oob_reason: null, strikes: 0, qr: null } };
  const prog = { done: 14, total: 40, pct: 35, max_pct: 80, mark: 70, runners_alive: 3, runners: 4, hunters_alive: 2 };
  const pos = [
    { id: '00000000-0000-4000-8000-000000000000', lat: 16.1806, lng: 75.6890, acc: 8, at: iso(-1000), role: 'hunter' },
    { id: '00000003-0000-4000-8000-000000000003', lat: 16.1793, lng: 75.6915, acc: 8, at: iso(-1000), role: 'hunter' },
    { id: '00000001-0000-4000-8000-000000000001', lat: 16.1815, lng: 75.6905, acc: 8, at: iso(-1000), role: 'runner' },
    { id: '00000002-0000-4000-8000-000000000002', lat: 16.1788, lng: 75.6888, acc: 8, at: iso(-1000), role: 'runner' },
    { id: '00000005-0000-4000-8000-000000000005', lat: 16.1810, lng: 75.6920, acc: 8, at: iso(-25000), role: 'runner' },
  ];
  switch (kind) {
    case 'admin-lobby': return { ...base, is_admin: true, me: null, members: members({ admin: true, pendingLast: true }).slice(1).map((m, i) => (i < 2 ? { ...m, role: i ? 'runner' : 'hunter' } : { ...m, role: m.status === 'pending' ? null : m.role })) };
    case 'player-lobby': return { ...base, members: members({ roles: false }) };
    case 'waiting': return { ...base, me: { ...base.me, status: 'pending' }, members: [] };
    case 'runner-hiding': return { ...base, room: { ...base.room, status: 'hiding', hide_ends_at: iso(312000) }, me: { ...base.me, role: 'runner', qr: 'a'.repeat(24) }, members: members({ myRole: 'runner' }), progress: { ...prog, done: 0, pct: 0, max_pct: 100 }, positions: [{ id: ME, lat: 16.1801, lng: 75.6899, acc: 6, at: iso(-500), role: 'runner' }] };
    case 'runner-hunt': return { ...base, room: { ...base.room, status: 'hunt', hunt_at: iso(-400000), ends_at: iso(1880000), next_shrink_at: iso(98000), zone_next: { lat: 16.1806, lng: 75.6907, r: 208 } }, me: { ...base.me, role: 'runner', tasks: 3, qr: 'a'.repeat(24), cooldown_until: iso(-1000) }, members: members({ myRole: 'runner', myTasks: 3, dead: [4] }), progress: prog, positions: pos.filter((p) => p.role === 'runner').concat([{ id: ME, lat: 16.1800, lng: 75.6899, acc: 6, at: iso(-500), role: 'runner' }]) };
    case 'hunter-hiding': { const s = state('runner-hiding'); s.me.role = 'hunter'; s.me.qr = null; s.members = members({ myRole: 'hunter' }); return s; }
    case 'runner-oob': { const s = state('runner-hunt'); s.me.oob_since = iso(-3000); s.me.oob_reason = 'zone'; return s; }
    case 'hunter-reveal': return { ...base, room: { ...base.room, status: 'hunt', hunt_at: iso(-125000), ends_at: iso(2275000), next_shrink_at: iso(175000), zone_next: { lat: 16.1806, lng: 75.6907, r: 208 } }, me: { ...base.me, role: 'hunter' }, reveal: { active: true, until: iso(38000), next_at: iso(115000) }, members: members({ myRole: 'hunter', dead: [4] }), progress: prog, positions: pos };
    case 'admin-hunt': return { ...base, is_admin: true, me: null, room: { ...base.room, status: 'hunt', hunt_at: iso(-400000), ends_at: iso(1880000), next_shrink_at: iso(98000), zone_next: { lat: 16.1806, lng: 75.6907, r: 208 } }, members: members({ admin: true, dead: [4] }).slice(1), progress: prog, positions: pos,
      events: [{ id: 1, kind: 'match_start', actor: ADMIN, target: null, data: { hunters: 2, runners: 4 }, at: iso(-820000) }, { id: 2, kind: 'hunt', actor: ADMIN, target: null, data: {}, at: iso(-400000) }, { id: 3, kind: 'task', actor: '00000001-0000-4000-8000-000000000001', target: null, data: { n: 4 }, at: iso(-200000) }, { id: 4, kind: 'caught', actor: '00000000-0000-4000-8000-000000000000', target: '00000004-0000-4000-8000-000000000004', data: { reason: 'caught' }, at: iso(-90000) }, { id: 5, kind: 'sos', actor: '00000002-0000-4000-8000-000000000002', target: null, data: { username: 'rohan_b', phone: '+919876543212', lat: 16.1788, lng: 75.6888 }, at: iso(-20000) }] };
    case 'result': return { ...base, room: { ...base.room, status: 'ended', winner: 'runners', end_reason: 'tasks', ended_at: iso(-5000) }, me: { ...base.me, role: 'runner', tasks: 7 }, members: members({ myRole: 'runner', myTasks: 7, dead: [4], ended: true }).map((m) => (m.id === ME ? { ...m, distance: 1840 } : m)), progress: { ...prog, done: 28, pct: 70, max_pct: 75 } };
  }
}
const profile = { id: ME, username: 'suraj', full_name: 'Suraj H. Deshpande', phone: '+919876543210', dob: '2005-04-12', college: 'Basaveshwar Engineering College, Bagalkot', branch: 'ISE', year: 3, selfie_path: 'me.jpg', is_organiser: true, is_owner: true, email: 'suraj@example.com', matches: 12, wins: 7, catches: 9, tasks_done: 41, times_caught: 3, distance_m: 18350, badges: [{ code: 'first_blood' }, { code: 'ghost' }, { code: 'first_win' }, { code: 'veteran' }, { code: 'marathon' }], application: null, friends_pending: 1, invites: 1, title: 'ghost', card_style: process.env.STYLE || 'ember', unlocks: { titles: ['rookie', 'ghost', 'phantom', 'chief'], styles: ['ember', 'police', 'midnight', 'gold'] } };
const rooms = [
  { id: 'r1', name: 'Friday Night Hunt', status: 'lobby', max: 50, players: 23, created_at: iso(-1800000), has_area: true, admin: { username: 'gourav', selfie: 'admin.jpg', college: 'Basaveshwar Engineering College, Bagalkot' }, my_status: null, is_admin: false },
  { id: 'r2', name: 'Library Lockdown', status: 'hunt', max: 30, players: 18, created_at: iso(-5400000), has_area: true, admin: { username: 'abhishek', selfie: 'p3.jpg', college: 'Basaveshwar Engineering College, Bagalkot' }, my_status: null, is_admin: false },
  { id: 'r3', name: 'Creative Spectrum Night', status: 'lobby', max: 50, players: 50, created_at: iso(-600000), has_area: false, admin: { username: 'vinod', selfie: 'p1.jpg', college: 'BLDEA College of Engineering, Vijayapura' }, my_status: null, is_admin: false },
];
const fixtures = { my_profile: profile, list_public_rooms: rooms, my_rooms: [{ id: 'r9', name: 'ISE vs CSE', status: 'lobby', is_public: false, is_admin: true, my_status: null, players: 9, created_at: iso(-300000) }],
  my_invites: [{ id: 1, room_id: 'r4', room: 'Hostel Block Hunt', is_public: false, from: { username: 'meera.s', selfie: 'p1.jpg' }, players: 12, at: iso(-60000) }],
  my_friends: [{ id: 'f1', username: 'meera.s', name: 'Meera', selfie: 'p1.jpg', college: 'BEC', wins: 3, matches: 6, status: 'accepted', incoming: false }, { id: 'f2', username: 'kiran_h', name: 'Kiran', selfie: 'p4.jpg', college: 'BEC', wins: 0, matches: 1, status: 'pending', incoming: true }],
  leaderboard: [{ id: 'a', username: 'aarav_k', selfie: 'p0.jpg', college: 'Basaveshwar Engineering College, Bagalkot', branch: 'CSE', value: 14, matches: 20 }, { id: ME, username: 'suraj', selfie: 'me.jpg', college: 'Basaveshwar Engineering College, Bagalkot', branch: 'ISE', value: 7, matches: 12, me: true }, { id: 'c', username: 'isha_p', selfie: 'p3.jpg', college: 'BLDEA College of Engineering', branch: 'ISE', value: 5, matches: 9 }],
  owner_applications: [{ id: 1, note: 'I run the weekend games at the hostel, around 30 players.', status: 'pending', at: iso(-3600000), user: { id: 'u', username: 'rohan_b', name: 'Rohan', selfie: 'p2.jpg', college: 'BEC', branch: 'ME', year: 4, matches: 5 } }],
  start_task: { seed: 12345, kind: +(process.env.KIND || 0), index: 4, of: 10 } };

// simple coloured "selfie" images
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const d = Math.hypot(x - w / 2, y - h * 0.42) < w * 0.24 ? 1.25 : (y > h * 0.7 && Math.abs(x - w / 2) < w * 0.36) ? 1.1 : 0.6; raw[o] = Math.min(255, rgb[0] * d); raw[o + 1] = Math.min(255, rgb[1] * d); raw[o + 2] = Math.min(255, rgb[2] * d); } }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const COLS = [[140, 110, 90], [170, 120, 100], [120, 100, 85], [160, 130, 110], [110, 90, 80], [150, 115, 95], [130, 105, 90]];
const style = { version: 8, glyphs: 'https://x/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111' } }] };

async function setup(ctx, scenario) {
  await ctx.addInitScript(([ref, anon, intro]) => {
    if (!intro) sessionStorage.setItem('tag-intro', '1');
    sessionStorage.setItem('tag-role-r1', '1');
    if (anon) return;
    const s = { access_token: 'x.eyJzdWIiOiIxIn0.x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: '11111111-1111-4111-8111-111111111111', email: 'suraj@example.com', aud: 'authenticated', role: 'authenticated' } };
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s));
  }, [REF, scenario.room === 'anon' || scenario.room === 'intro', scenario.room === 'intro']);
  await ctx.route(/openfreemap\.org\/styles/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(style) }));
  await ctx.route(/openfreemap\.org\/(?!styles)/, (r) => r.abort());
  await ctx.route(/supabase\.co/, (r) => {
    const u = r.request().url();
    if (u.includes('/storage/v1/object/public/selfies/')) { const k = u.split('/').pop(); const i = k === 'me.jpg' ? 6 : k === 'admin.jpg' ? 5 : +k.replace(/\D/g, '') || 0; return r.fulfill({ contentType: 'image/png', body: png(96, 96, COLS[i % COLS.length]) }); }
    const m = /\/rpc\/(\w+)/.exec(u);
    if (m) { const fn = m[1]; const body = fn === 'room_state' ? state(scenario.room) : fixtures[fn] ?? null; return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }); }
    if (u.includes('/rest/v1/messages')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 1, user_id: '00000001-0000-4000-8000-000000000001', body: 'Anyone near the canteen?', at: iso(-90000) }, { id: 2, user_id: ME, body: 'Heading to the library side', at: iso(-30000) }]) });
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
}
module.exports = { setup, state, OUT, devices, chromium };
if (require.main === module) {
  (async () => {
    const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const shots = process.argv.slice(2);
    for (const spec of shots) {
      const [name, path, room, wide, wait, extra] = spec.split('|');
      const ctx = await b.newContext(wide === 'wide' ? { viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1, serviceWorkers: 'block' } : { ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
      await ctx.grantPermissions(['geolocation', 'camera']); await ctx.setGeolocation({ latitude: 16.1800, longitude: 75.6899, accuracy: 6 });
      await setup(ctx, { room });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log(name, 'PAGEERROR', e.message));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_FAILED|net::/.test(m.text())) console.log(name, 'console', m.text().slice(0, 200)); });
      await p.goto('http://localhost:4173' + path);
      await p.waitForTimeout(+(wait || 1500));
      if (extra) for (const step of extra.split(';')) { const i = step.indexOf('='); const act = step.slice(0, i), arg = step.slice(i + 1); if (act === 'click') await p.locator('button', { hasText: arg }).first().click({ force: true, timeout: 5000 }); if (act === 'wait') await p.waitForTimeout(+arg); if (act === 'eval') await p.evaluate(arg); }
      await p.screenshot({ path: OUT + name + '.png', fullPage: path.startsWith('/home') || name.includes('full') });
      await ctx.close();
    }
    await b.close();
  })();
}
