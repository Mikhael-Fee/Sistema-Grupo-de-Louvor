import { describe, expect, it } from 'vitest';
import type { MinistryData, Service } from '../types';
import { buildSongHistory } from './song-history';

const service = (id: string, date: string, repertoire: Service['repertoire'], values: Partial<Service> = {}): Service => ({
  id,
  date,
  time: '19:00',
  type: 'Culto de Domingo',
  notes: '',
  assignments: [],
  repertoire,
  ...values,
});
const data: MinistryData = {
  tags: [],
  people: [],
  songs: [
    { id: 's1', title: 'Casa', artist: '', originalKey: 'C', churchKey: 'E', content: '', youtubeUrl: '', notes: '', tagIds: [] },
    { id: 's2', title: 'Outra', artist: '', originalKey: 'C', churchKey: 'C', content: '', youtubeUrl: '', notes: '', tagIds: [] },
  ],
  services: [
    service('a', '2026-09-01', [{ id: 'r1', songId: 's1', key: 'D', notes: '' }]),
    service('b', '2026-10-05', [
      { id: 'r2', songId: 's1', key: 'D', notes: '' },
      { id: 'r3', songId: 's1', key: 'E', notes: '' },
    ]),
    service('c', '2026-10-08', [{ id: 'r4', songId: 's1', key: '', notes: '' }], { type: 'Ceia' }),
    service('d', '2026-10-20', [{ id: 'r5', songId: 's1', key: 'F', notes: '' }]),
    service('e', '2026-10-02', [{ id: 'r6', songId: 's2', key: 'C', notes: '' }]),
  ],
};

describe('song history', () => {
  it('lists played services newest first, upcoming ones apart, and counts each service once', () => {
    const history = buildSongHistory(data, 's1', '2026-10-08');
    expect(history.played.map(entry => [entry.serviceId, entry.key, entry.keyFromService])).toEqual([
      ['c', 'E', false],
      ['b', 'D', true],
      ['a', 'D', true],
    ]);
    expect(history.upcoming.map(entry => entry.serviceId)).toEqual(['d']);
    expect(history.lastDate).toBe('2026-10-08');
    expect(history.firstDate).toBe('2026-09-01');
    expect(history.keys).toEqual([
      { key: 'D', count: 2 },
      { key: 'E', count: 1 },
    ]);
  });

  it('is empty for a song never placed in a repertoire', () => {
    const history = buildSongHistory({ ...data, services: [] }, 's1', '2026-10-08');
    expect(history).toEqual({ played: [], upcoming: [], lastDate: '', firstDate: '', keys: [] });
  });
});
