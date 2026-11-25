import { describe, expect, it } from 'vitest';
import { autoscrollPixelsPerSecond, setlistPosition, setlistSongPath } from './setlist-navigation';
import type { Service } from '../types';

const service: Service = {
  id: 's1',
  date: '2026-11-29',
  time: '18:00',
  type: 'Ceia',
  notes: '',
  assignments: [],
  repertoire: [
    { id: 'a', songId: 'song-a', key: 'G', notes: '' },
    { id: 'b', songId: 'song-b', key: 'C', notes: '' },
    { id: 'c', songId: 'song-c', key: 'F', notes: '' },
  ],
};

describe('navegação no repertório', () => {
  it('encontra a música anterior e a próxima', () => {
    expect(setlistPosition(service, 'b')).toMatchObject({ index: 1, total: 3, previous: { id: 'a' }, next: { id: 'c' } });
    expect(setlistPosition(service, 'a')?.previous).toBeUndefined();
    expect(setlistPosition(service, 'c')?.next).toBeUndefined();
  });
  it('ignora música fora do culto', () => {
    expect(setlistPosition(service, 'x')).toBeNull();
    expect(setlistPosition(undefined, 'a')).toBeNull();
  });
  it('monta o link da música dentro do culto', () => {
    expect(setlistSongPath('s1', service.repertoire[1])).toBe('/musicas/song-b?service=s1&item=b');
  });
  it('limita a velocidade da rolagem', () => {
    expect(autoscrollPixelsPerSecond(1)).toBe(16);
    expect(autoscrollPixelsPerSecond(0)).toBe(16);
    expect(autoscrollPixelsPerSecond(99)).toBe(72);
  });
});
