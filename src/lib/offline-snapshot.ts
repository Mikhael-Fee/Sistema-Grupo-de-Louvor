import type { MinistryData, Profile } from '../types';

/**
 * A read-only copy of the last data loaded online, so the team can open
 * services and chord sheets in a church with no signal. It lives only on this
 * device and is removed when the person signs out.
 */
export const SNAPSHOT_KEY = 'candeia.offline.v1';
export interface OfflineSnapshot { version: 1; userId: string; savedAt: string; profile: Profile; data: MinistryData }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStore(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Songs that the next services use; the smaller copy when the whole library does not fit. */
export function essentialData(data: MinistryData, today: string): MinistryData {
  const services = data.services.filter(service => service.date >= today);
  const used = new Set(services.flatMap(service => service.repertoire.map(item => item.songId)));
  return { ...data, services, songs: data.songs.filter(song => used.has(song.id)) };
}

export function saveSnapshot(profile: Profile, data: MinistryData, today: string, now = new Date(), store = browserStore()): void {
  if (!store || !profile.approved) return;
  const write = (value: MinistryData) => store.setItem(SNAPSHOT_KEY, JSON.stringify({ version: 1, userId: profile.id, savedAt: now.toISOString(), profile, data: value } satisfies OfflineSnapshot));
  try { write(data); return; } catch { /* Storage full: keep only what the next services need. */ }
  try { write(essentialData(data, today)); } catch { try { store.removeItem(SNAPSHOT_KEY); } catch { /* Ignore. */ } }
}

export function readSnapshot(userId?: string, store = browserStore()): OfflineSnapshot | null {
  if (!store) return null;
  try {
    const value = JSON.parse(store.getItem(SNAPSHOT_KEY) || 'null') as OfflineSnapshot | null;
    if (value?.version !== 1 || typeof value.userId !== 'string' || typeof value.savedAt !== 'string' || !value.profile?.approved || value.profile.id !== value.userId) return null;
    const data = value.data;
    if (!data || !['songs', 'tags', 'people', 'services'].every(field => Array.isArray(data[field as keyof MinistryData]))) return null;
    if (userId && value.userId !== userId) return null;
    return value;
  } catch { return null; }
}

export function clearSnapshot(store = browserStore()): void {
  try { store?.removeItem(SNAPSHOT_KEY); } catch { /* Ignore. */ }
}

/** True when an error means "no connection" rather than "not allowed" or "invalid". */
export function isConnectionFailure(cause: unknown, online = typeof navigator === 'undefined' ? true : navigator.onLine): boolean {
  if (!online) return true;
  const message = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause ?? '');
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|AuthRetryableFetchError|ERR_INTERNET|ERR_NETWORK/i.test(message);
}
