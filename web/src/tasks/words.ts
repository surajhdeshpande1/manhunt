/** Word bank for Cipher and Scramble, grouped by the hint shown to players. */
export const WORDS: Record<string, string[]> = {
  'The chase': ['HUNT', 'RUN', 'HIDE', 'DASH', 'TRAP', 'LURE', 'TAIL', 'LURK', 'DODGE', 'SNEAK', 'CHASE', 'TRACE', 'TRAIL', 'PROWL', 'SCOUT', 'SIREN', 'ALARM', 'DECOY', 'RADAR', 'CLUES', 'GHOST', 'SPRINT', 'HUNTER', 'RUNNER', 'ESCAPE', 'AMBUSH', 'SIGNAL', 'BEACON', 'SHADOW', 'PATROL', 'SEARCH', 'STALKER', 'TRACKER', 'PURSUIT', 'HIDEOUT', 'CAPTURE', 'OUTPOST', 'SCANNER', 'STEALTH', 'LOOKOUT', 'FUGITIVE', 'FOOTSTEP', 'HANDCUFF', 'CHECKPOINT', 'CAMOUFLAGE'],
  'On campus': ['LAB', 'GATE', 'DESK', 'HALL', 'BENCH', 'CLASS', 'TOWER', 'COURT', 'LOBBY', 'STAGE', 'CAMPUS', 'HOSTEL', 'CANTEEN', 'GARDEN', 'LIBRARY', 'LECTURE', 'PARKING', 'BALCONY', 'ROOFTOP', 'STADIUM', 'CORRIDOR', 'STAIRWAY', 'COURTYARD', 'CLASSROOM', 'WORKSHOP', 'SEMINAR', 'NOTEBOOK', 'PRINCIPAL', 'ASSEMBLY', 'CHEMISTRY'],
  'After dark': ['MOON', 'STAR', 'DUSK', 'MIST', 'OWL', 'ECHO', 'TORCH', 'NIGHT', 'QUIET', 'STARS', 'FOGGY', 'SHADE', 'CANDLE', 'LANTERN', 'WHISPER', 'SILENCE', 'PHANTOM', 'MIDNIGHT', 'DARKNESS', 'MOONLIGHT', 'FIREFLY', 'NIGHTFALL'],
  'Codes & tech': ['CODE', 'BYTE', 'CHIP', 'WIFI', 'LASER', 'PIXEL', 'VAULT', 'CIPHER', 'BINARY', 'SERVER', 'ROUTER', 'SENSOR', 'BATTERY', 'CIRCUIT', 'ANTENNA', 'NETWORK', 'PASSWORD', 'KEYBOARD', 'COMPUTER', 'SATELLITE', 'TERMINAL', 'DATABASE'],
  'Around town': ['CHAI', 'BUS', 'ROAD', 'SHOP', 'MANGO', 'TEMPLE', 'MARKET', 'BAZAAR', 'BRIDGE', 'SAMOSA', 'CRICKET', 'MONSOON', 'RAILWAY', 'STATION', 'RICKSHAW', 'SCOOTER', 'BAKERY', 'FESTIVAL', 'JUNCTION', 'HIGHWAY', 'PHARMACY', 'BUSSTAND'],
  'Things': ['KEY', 'MAP', 'BELL', 'LOCK', 'ROPE', 'WATCH', 'PHONE', 'CLOCK', 'BOTTLE', 'POCKET', 'JACKET', 'BACKPACK', 'COMPASS', 'BLANKET', 'UMBRELLA', 'TELESCOPE', 'BINOCULARS', 'WHISTLE'],
};
export const ALL_WORDS: { w: string; cat: string }[] = Object.entries(WORDS).flatMap(([cat, ws]) => ws.map((w) => ({ w, cat })));
export function wordsBetween(min: number, max: number) { return ALL_WORDS.filter((x) => x.w.length >= min && x.w.length <= max); }
