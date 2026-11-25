import type { Service, SetlistItem } from '../types';

export interface SetlistPosition { index: number; total: number; previous?: SetlistItem; next?: SetlistItem }

/** Where a repertoire item sits in its service, for "anterior / próxima" while playing. */
export function setlistPosition(service: Service | undefined, itemId: string | undefined | null): SetlistPosition | null {
  if (!service || !itemId) return null;
  const index = service.repertoire.findIndex(item => item.id === itemId);
  if (index < 0) return null;
  return { index, total: service.repertoire.length, previous: service.repertoire[index - 1], next: service.repertoire[index + 1] };
}

export function setlistSongPath(serviceId: string, item: SetlistItem): string {
  return `/musicas/${item.songId}?${new URLSearchParams({ service: serviceId, item: item.id })}`;
}

export const AUTOSCROLL_SPEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Pixels per second for each speed step: slow enough for ballads, fast enough for short sheets. */
export function autoscrollPixelsPerSecond(speed: number): number {
  const step = Math.min(8, Math.max(1, Math.round(speed)));
  return 8 + step * 8;
}
