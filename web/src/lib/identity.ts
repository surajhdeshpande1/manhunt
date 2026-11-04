/** Callsign titles and player-card styles. Unlock rules live in the database (tag_unlocks); this file only names and draws them. */
export const TITLES: Record<string, { label: string; how: string }> = {
  rookie: { label: 'Rookie', how: 'Everyone starts here' },
  ghost: { label: 'Ghost', how: 'Survive a match as a runner' },
  shadow: { label: 'Shadow', how: 'Clear every task in a match' },
  marathoner: { label: 'Marathoner', how: 'Move 5 km in total' },
  bloodhound: { label: 'Bloodhound', how: 'Make 5 catches' },
  phantom: { label: 'Phantom', how: 'Win 3 matches' },
  veteran: { label: 'Veteran', how: 'Play 10 matches' },
  legend: { label: 'Legend', how: 'Win 10 matches' },
  chief: { label: 'Chief', how: 'Become an approved organiser' },
};
export const titleLabel = (code?: string | null) => (code && code !== 'rookie' ? TITLES[code]?.label : undefined);

export type CardStyle = 'ember' | 'police' | 'midnight' | 'gold';
export const STYLES: Record<CardStyle, { label: string; how: string; bg: string; ring: string; ink: string; accent: string }> = {
  ember: {
    label: 'Ember', how: 'Default',
    bg: 'radial-gradient(130% 90% at 100% 0%, rgba(255,106,26,.42), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(232,54,31,.34), transparent 60%), #0d0806',
    ring: 'conic-gradient(#ffd400, #ff6a1a, #e8361f, #ffd400)', ink: '#fff6f0', accent: '#ffb27a',
  },
  police: {
    label: 'Police line', how: 'Default',
    bg: 'repeating-linear-gradient(-45deg, rgba(255,212,0,.07) 0 14px, transparent 14px 28px), radial-gradient(120% 90% at 100% 0%, rgba(255,212,0,.35), transparent 55%), #0b0a05',
    ring: 'conic-gradient(#ffd400, #000, #ffd400, #000, #ffd400)', ink: '#fffbe8', accent: '#ffe14d',
  },
  midnight: {
    label: 'Midnight', how: 'Default',
    bg: 'radial-gradient(120% 90% at 100% 0%, rgba(61,79,214,.55), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(255,106,26,.25), transparent 60%), #05071a',
    ring: 'conic-gradient(#8c9bff, #3d4fd6, #ff6a1a, #8c9bff)', ink: '#eef0ff', accent: '#8c9bff',
  },
  gold: {
    label: 'Gold', how: 'Win a match',
    bg: 'radial-gradient(130% 90% at 100% 0%, rgba(242,179,61,.5), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(166,27,18,.35), transparent 60%), #0d0904',
    ring: 'conic-gradient(#fff2e0, #f2b33d, #a66b00, #f2b33d, #fff2e0)', ink: '#fff7e6', accent: '#f2b33d',
  },
};
