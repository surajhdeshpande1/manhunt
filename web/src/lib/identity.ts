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
  // flat brutalist ID cards: one solid colour, ink outline, a halftone corner
  ember: { label: 'Ember', how: 'Default', bg: '#ff6a1a', ring: '#14110f', ink: '#14110f', accent: '#fff2e0' },
  police: { label: 'Police line', how: 'Default', bg: '#ffd400', ring: '#14110f', ink: '#14110f', accent: '#14110f' },
  midnight: { label: 'Midnight', how: 'Default', bg: '#1b2a6b', ring: '#fff2e0', ink: '#fff2e0', accent: '#ffd400' },
  gold: { label: 'Gold', how: 'Win a match', bg: '#f2b33d', ring: '#14110f', ink: '#14110f', accent: '#a61b12' },
};
