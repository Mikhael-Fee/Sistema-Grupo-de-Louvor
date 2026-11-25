import { describe, expect, it } from 'vitest';
import { clearSnapshot, essentialData, isConnectionFailure, readSnapshot, saveSnapshot, SNAPSHOT_KEY } from './offline-snapshot';
import type { MinistryData, Profile } from '../types';

function memoryStore(limit = Infinity) {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit) throw new DOMException('cheio', 'QuotaExceededError');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const profile: Profile = { id: 'u1', name: 'Mikha', role: 'admin', approved: true };
const song = (id: string) => ({
  id,
  title: id,
  artist: '',
  originalKey: 'C',
  churchKey: 'C',
  content: 'x'.repeat(500),
  youtubeUrl: '',
  notes: '',
  tagIds: [],
});
const data: MinistryData = {
  tags: [],
  people: [],
  songs: [song('usada'), song('antiga'), song('livre')],
  services: [
    {
      id: 'next',
      date: '2026-11-29',
      time: '18:00',
      type: 'Ceia',
      notes: '',
      assignments: [],
      repertoire: [{ id: 'r1', songId: 'usada', key: 'C', notes: '' }],
    },
    {
      id: 'old',
      date: '2026-10-01',
      time: '18:00',
      type: 'Culto',
      notes: '',
      assignments: [],
      repertoire: [{ id: 'r2', songId: 'antiga', key: 'C', notes: '' }],
    },
  ],
};

describe('cópia para usar sem internet', () => {
  it('guarda e devolve os dados da mesma conta', () => {
    const store = memoryStore();
    saveSnapshot(profile, data, '2026-11-25', new Date('2026-11-25T12:00:00Z'), store);
    expect(readSnapshot('u1', store)).toMatchObject({
      userId: 'u1',
      savedAt: '2026-11-25T12:00:00.000Z',
      data: { songs: [{ id: 'usada' }, { id: 'antiga' }, { id: 'livre' }] },
    });
    expect(readSnapshot(undefined, store)?.userId).toBe('u1');
    expect(readSnapshot('outra-conta', store)).toBeNull();
  });
  it('não guarda conta sem aprovação e apaga ao sair', () => {
    const store = memoryStore();
    saveSnapshot({ ...profile, approved: false }, data, '2026-11-25', new Date(), store);
    expect(store.values.has(SNAPSHOT_KEY)).toBe(false);
    saveSnapshot(profile, data, '2026-11-25', new Date(), store);
    clearSnapshot(store);
    expect(readSnapshot('u1', store)).toBeNull();
  });
  it('sem espaço, guarda só os próximos cultos e suas músicas', () => {
    const store = memoryStore(1600);
    saveSnapshot(profile, data, '2026-11-25', new Date(), store);
    const saved = readSnapshot('u1', store)!;
    expect(saved.data.services.map(service => service.id)).toEqual(['next']);
    expect(saved.data.songs.map(item => item.id)).toEqual(['usada']);
    expect(essentialData(data, '2026-11-25').songs).toHaveLength(1);
  });
  it('ignora conteúdo inválido', () => {
    const store = memoryStore();
    store.setItem(SNAPSHOT_KEY, '{"version":1,"userId":"u1"}');
    expect(readSnapshot('u1', store)).toBeNull();
    store.setItem(SNAPSHOT_KEY, 'não é json');
    expect(readSnapshot('u1', store)).toBeNull();
  });
  it('reconhece falta de conexão', () => {
    expect(isConnectionFailure(new Error('x'), false)).toBe(true);
    expect(isConnectionFailure(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isConnectionFailure(new Error('TypeError: NetworkError when attempting to fetch resource.'), true)).toBe(true);
    expect(isConnectionFailure(new Error('Seu perfil não tem permissão'), true)).toBe(false);
  });
});
