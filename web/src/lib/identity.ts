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
  // calm graphite ID cards; the style shows as one accent colour (band, ring, title)
  ember: { label: 'Ember', how: 'Default', bg: '#17171a', ring: '#d9541e', ink: '#ede6da', accent: '#d9541e' },
  police: { label: 'Brass', how: 'Default', bg: '#17171a', ring: '#c9a227', ink: '#ede6da', accent: '#c9a227' },
  midnight: { label: 'Midnight', how: 'Default', bg: '#12151d', ring: '#8ea0c8', ink: '#ede6da', accent: '#8ea0c8' },
  gold: { label: 'Gold', how: 'Win a match', bg: '#1a1712', ring: '#d4b062', ink: '#f2ead9', accent: '#d4b062' },
};
