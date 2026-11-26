import type { MinistryData } from '../types';

export interface SongHistoryEntry {
  serviceId: string;
  itemId: string;
  date: string;
  time: string;
  type: string;
  isEvent: boolean;
  /** Key saved in that service's repertoire; falls back to the song's church key when empty. */
  key: string;
  keyFromService: boolean;
}
export interface SongHistoryKey {
  key: string;
  count: number;
}
export interface SongHistory {
  /** Services on or before today, newest first. */
  played: SongHistoryEntry[];
  /** Services after today, soonest first. */
  upcoming: SongHistoryEntry[];
  lastDate: string;
  firstDate: string;
  /** Keys used in the played services, most used first. */
  keys: SongHistoryKey[];
}

/** Every service whose repertoire includes the song; a song repeated in one service counts once. */
export function buildSongHistory(data: MinistryData, songId: string, today: string): SongHistory {
  const song = data.songs.find(item => item.id === songId);
  const fallbackKey = song?.churchKey || '';
  const entries: SongHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const service of data.services) {
    if (seen.has(service.id)) continue;
    const item = service.repertoire.find(entry => entry.songId === songId);
    if (!item) continue;
    seen.add(service.id);
    const savedKey = item.key?.trim() || '';
    entries.push({
      serviceId: service.id,
      itemId: item.id,
      date: service.date,
      time: service.time,
      type: service.type,
      isEvent: Boolean(service.isEvent),
      key: savedKey || fallbackKey,
      keyFromService: Boolean(savedKey),
    });
  }
  const byDate = (a: SongHistoryEntry, b: SongHistoryEntry) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
  const played = entries.filter(entry => entry.date <= today).sort((a, b) => byDate(b, a));
  const upcoming = entries.filter(entry => entry.date > today).sort(byDate);
  const keyCounts = new Map<string, number>();
  for (const entry of played) if (entry.key) keyCounts.set(entry.key, (keyCounts.get(entry.key) || 0) + 1);
  return {
    played,
    upcoming,
    lastDate: played[0]?.date || '',
    firstDate: played.at(-1)?.date || '',
    keys: [...keyCounts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  };
}
