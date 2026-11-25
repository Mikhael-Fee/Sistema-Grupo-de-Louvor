import type { Service, SetlistItem } from '../types';

export interface SetlistPosition {
  index: number;
  total: number;
  previous?: SetlistItem;
  next?: SetlistItem;
}

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

/**
 * A finger slide across the song: to the left opens the next song, to the right the previous one.
 * It must be long, quick and mostly sideways, so reading and vertical scrolling never trigger it.
 */
export function swipeDirection(dx: number, dy: number, ms: number, minDistance = 70): 'previous' | 'next' | null {
  if (Math.abs(dx) < minDistance || ms > 800) return null;
  if (Math.abs(dx) < Math.abs(dy) * 2) return null;
  return dx < 0 ? 'next' : 'previous';
}

/** Arrow keys move through the service, unless the person is typing or choosing in a field. */
export function arrowDirection(key: string, target: EventTarget | null): 'previous' | 'next' | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  if (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
  )
    return null;
  return key === 'ArrowLeft' ? 'previous' : 'next';
}
