import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoData, DEMO_PROFILE } from './seed';
import { validateService } from './validation';

afterEach(() => vi.useRealTimers());

describe('local ministry demonstration', () => {
  it('links its approved administrator to Mikhael and provides complete original examples', () => {
    const data = createDemoData();
    expect(DEMO_PROFILE).toMatchObject({ name: 'Mikhael', role: 'admin', approved: true });
    expect(data.people.find((person) => person.id === DEMO_PROFILE.personId)?.name).toBe('Mikhael');
    expect(data.songs).toHaveLength(6);
    expect(data.services).toHaveLength(3);
    expect(data.songs.every((song) => song.artist === 'Composição de demonstração' && /\[[A-G]/.test(song.content))).toBe(true);
    for (const song of data.songs) {
      for (const tagId of song.tagIds) expect(data.tags.some((tag) => tag.id === tagId)).toBe(true);
    }
    data.services.forEach((service) => expect(validateService(service, data)).toBeNull());
  });

  it('uses unique RFC-compatible UUIDs for all persisted records', () => {
    const data = createDemoData();
    const records = [DEMO_PROFILE, ...data.people, ...data.tags, ...data.songs, ...data.services,
      ...data.services.flatMap((service) => [...service.assignments, ...service.repertoire])];
    const ids = records.map((record) => record.id);
    const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
    expect(ids.every((value) => uuid.test(value))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates future Sundays from the São Paulo date, including the UTC midnight boundary', () => {
    vi.useFakeTimers();
    // UTC is already Sunday; in São Paulo it is still Saturday night.
    vi.setSystemTime(new Date('2026-10-04T01:30:00Z'));
    expect(createDemoData().services.map((service) => service.date)).toEqual(['2026-10-04', '2026-10-11', '2026-10-18']);
    vi.setSystemTime(new Date('2026-10-04T16:00:00Z'));
    expect(createDemoData().services.map((service) => service.date)).toEqual(['2026-10-11', '2026-10-18', '2026-10-25']);
  });

  it('returns independent nested records so resetting demo data restores edits', () => {
    const data = createDemoData();
    data.songs[0].tagIds.length = 0;
    data.services[0].repertoire.reverse();
    data.people[0].functions.push('Bateria');
    const fresh = createDemoData();
    expect(fresh.songs[0].tagIds.length).toBeGreaterThan(0);
    expect(fresh.services[0].repertoire[0].songId).toBe(fresh.songs[0].id);
    expect(fresh.people[0].functions).toEqual(['Voz', 'Violão']);
  });
});
