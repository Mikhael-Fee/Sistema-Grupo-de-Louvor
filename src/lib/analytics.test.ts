import { describe, expect, it } from 'vitest';
import type { MinistryData, Service } from '../types';
import { analyticsDateRange, analyticsRangeError, buildMinistryAnalytics, ministryToday } from './analytics';

const today = '2026-10-08';
const all = { start: '', end: '' };
const service = (id: string, date: string, values: Partial<Service> = {}): Service => ({ id, date, time: '19:00', type: 'Santa Ceia', notes: '', assignments: [], repertoire: [], ...values });
const song = (id: string, tagIds: string[]) => ({ id, title: `Música ${id}`, artist: 'Equipe', originalKey: 'C', churchKey: 'C', content: '[C]Verso', youtubeUrl: '', notes: '', tagIds });

function ministry(): MinistryData {
  return {
    tags: [{ id: 't1', name: 'Adoração', color: '#ff8800' }, { id: 't2', name: 'Comunhão', color: '#111111' }],
    people: [
      { id: 'p1', name: 'Ana', email: 'private-ana@example.invalid', functions: ['Voz', 'Teclado'] },
      { id: 'p2', name: 'João', email: 'private-joao@example.invalid', functions: ['Voz'] },
      { id: 'p3', name: 'Maria', email: 'private-maria@example.invalid', functions: ['Bateria'] },
    ],
    songs: [song('s1', ['t1', 't2', 't1']), song('s2', ['t1']), song('s3', [])],
    services: [
      service('a', '2026-09-09', {
        assignments: [
          { id: 'a1', personId: 'p1', function: 'Voz' },
          { id: 'a2', personId: 'p1', function: 'Teclado' },
          { id: 'a3', personId: 'p1', function: 'Voz' },
          { id: 'a4', personId: 'p2', function: 'Voz' },
        ],
        repertoire: [{ id: 'r1', songId: 's1', key: 'C', notes: '' }, { id: 'r2', songId: 's1', key: 'C', notes: '' }, { id: 'r3', songId: 's2', key: 'D', notes: '' }],
      }),
      service('b', '2026-10-08', {
        type: 'Culto de Louvor', assignments: [{ id: 'b1', personId: 'p1', function: 'Voz' }],
        repertoire: [{ id: 'r4', songId: 's1', key: 'D', notes: '' }],
      }),
      service('before', '2026-09-08'), service('future', '2026-10-09'),
    ],
  };
}

describe('analytics dates', () => {
  it('uses the calendar day in São Paulo near midnight UTC', () => {
    expect(ministryToday(new Date('2026-10-09T00:30:00Z'))).toBe('2026-10-08');
    expect(ministryToday(new Date('2026-10-09T03:00:00Z'))).toBe('2026-10-09');
  });

  it('includes today in 30 and 90 days and bounds this year through today', () => {
    expect(analyticsDateRange('30', today)).toEqual({ start: '2026-09-09', end: today });
    expect(analyticsDateRange('90', today)).toEqual({ start: '2026-07-11', end: today });
    expect(analyticsDateRange('year', today)).toEqual({ start: '2026-01-01', end: today });
    expect(analyticsDateRange('all', today)).toEqual(all);
    expect(analyticsDateRange('custom', today, { start: '2026-10-01', end: '' })).toEqual({ start: '2026-10-01', end: '' });
  });

  it('crosses leap days without device timezone offsets', () => {
    expect(analyticsDateRange('30', '2028-03-01')).toEqual({ start: '2028-02-01', end: '2028-03-01' });
    expect(analyticsDateRange('30', '2027-03-01')).toEqual({ start: '2027-01-31', end: '2027-03-01' });
  });

  it('rejects invalid calendar dates and inverted ranges but permits open ends', () => {
    expect(analyticsRangeError({ start: '2026-02-30', end: '' })).toBeTruthy();
    expect(analyticsRangeError({ start: '', end: '2026-13-01' })).toBeTruthy();
    expect(analyticsRangeError({ start: '2026-10-09', end: today })).toBeTruthy();
    expect(analyticsRangeError({ start: today, end: today })).toBeNull();
    expect(analyticsRangeError(all)).toBeNull();
    expect(() => buildMinistryAnalytics(ministry(), { start: '2026-10-09', end: today }, today)).toThrow(/inicial/);
  });
});

describe('planned ministry analytics', () => {
  it('counts one person and song per service while preserving multiple function assignments', () => {
    const data = ministry();
    const snapshot = JSON.stringify(data);
    const report = buildMinistryAnalytics(data, analyticsDateRange('30', today), today);
    expect(report).toMatchObject({
      services: 2, participations: 3, assignments: 4, songUses: 3,
      uniquePeople: 2, uniqueSongs: 2, averageTeam: 1.5, servicesWithTeam: 2, servicesWithSongs: 2, futureServices: 0,
      inventory: { songs: 3, people: 3, tags: 2, unusedSongs: 1, unscheduledPeople: 1 },
    });
    expect(report.people[0]).toMatchObject({ id: 'p1', label: 'Ana', count: 2, percentage: 100, functions: ['Teclado', 'Voz'], lastDate: today });
    expect(report.people[1]).toMatchObject({ id: 'p2', count: 1, percentage: 50 });
    expect(report.songs.map(row => [row.id, row.count, row.percentage])).toEqual([['s1', 2, 100], ['s2', 1, 50]]);
    expect(report.functions.map(row => [row.label, row.count, row.percentage])).toEqual([['Voz', 3, 75], ['Teclado', 1, 25]]);
    expect(report.themes).toHaveLength(2);
    expect(report.times).toEqual([{ id: '19:00', label: '19:00', count: 2, percentage: 100 }]);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(JSON.stringify(report)).not.toContain('@example.invalid');
    expect(report.people[0]).not.toHaveProperty('email');
  });

  it('counts each song use in all distinct tags and explains overlapping category totals', () => {
    const report = buildMinistryAnalytics(ministry(), analyticsDateRange('30', today), today);
    expect(report.tags).toEqual([
      { id: 't1', label: 'Adoração', count: 3, percentage: 100 },
      { id: 't2', label: 'Comunhão', count: 2, percentage: 67 },
    ]);
    expect(report.tags.reduce((sum, tag) => sum + tag.count, 0)).toBeGreaterThan(report.songUses);
  });

  it('keeps current inventory independent of period and includes future services only if selected', () => {
    const data = ministry();
    const recent = buildMinistryAnalytics(data, analyticsDateRange('30', today), today);
    const complete = buildMinistryAnalytics(data, all, today);
    const future = buildMinistryAnalytics(data, { start: '2026-10-09', end: '' }, today);
    expect(complete.services).toBe(4);
    expect(complete.futureServices).toBe(1);
    expect(future.services).toBe(1);
    expect(future.participations).toBe(0);
    expect(future.inventory).toMatchObject({ songs: 3, people: 3, tags: 2, unusedSongs: 3, unscheduledPeople: 3 });
    expect(recent.inventory.songs).toBe(future.inventory.songs);
    expect(buildMinistryAnalytics(data, { start: today, end: today }, today).services).toBe(1);
  });

  it('keeps counts and clear placeholders for missing records without exposing private metadata', () => {
    const data = ministry();
    data.songs[0].tagIds = ['missing-tag'];
    data.services = [service('a', today, {
      assignments: [{ id: 'a1', personId: 'missing-person', function: 'Voz' }],
      repertoire: [{ id: 'r1', songId: 'missing-song', key: 'C', notes: '' }, { id: 'r2', songId: 's1', key: 'C', notes: '' }],
    })];
    const report = buildMinistryAnalytics(data, all, today);
    expect(report).toMatchObject({ services: 1, participations: 1, songUses: 2, uniquePeople: 1, uniqueSongs: 2 });
    expect(report.people[0].label).toBe('Pessoa indisponível');
    expect(report.songs.some(row => row.label === 'Música indisponível')).toBe(true);
    expect(report.tags.map(row => row.label).sort()).toEqual(['Etiqueta indisponível', 'Sem etiqueta disponível']);
    expect(report.inventory).toMatchObject({ songs: 3, people: 3, unusedSongs: 2, unscheduledPeople: 3 });
  });

  it('renders zero months between actual services and includes the full selected range', () => {
    const data = ministry();
    data.services = [service('jan', '2026-01-08'), service('march', '2026-03-09')];
    const report = buildMinistryAnalytics(data, { start: '2026-01-01', end: '2026-04-30' }, today);
    expect(report.timeline.map(point => [point.id, point.services])).toEqual([
      ['2026-01', 1], ['2026-02', 0], ['2026-03', 1], ['2026-04', 0],
    ]);
    expect(report.timelineLabel).toBe('Por mês');
  });

  it('groups long histories without dropping any service or creating unbounded chart buckets', () => {
    const data = ministry();
    data.services = [service('old', '1950-01-01'), service('current', today)];
    const report = buildMinistryAnalytics(data, all, today);
    expect(report.timeline.length).toBeLessThanOrEqual(24);
    expect(report.timelineLabel).toBe('Em intervalos de 4 anos');
    expect(report.timeline.reduce((sum, point) => sum + point.services, 0)).toBe(2);
    expect(report.timeline[0].services).toBe(1);
    expect(report.timeline.at(-1)?.services).toBe(1);
  });

  it('returns honest empty statistics, finite percentages and no generated history for an empty ministry', () => {
    const report = buildMinistryAnalytics({ songs: [], people: [], tags: [], services: [] }, all, today);
    expect(report).toMatchObject({ services: 0, participations: 0, songUses: 0, averageTeam: 0, uniquePeople: 0, uniqueSongs: 0 });
    expect(report.timeline).toEqual([]);
    expect(report.songs).toEqual([]);
    expect(report.people).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('null');
  });

  it('ignores invalid calendar records and duplicate copies of one service', () => {
    const data = ministry();
    data.services = [data.services[0], structuredClone(data.services[0]), service('invalid', '2026-02-30')];
    const report = buildMinistryAnalytics(data, all, today);
    expect(report.services).toBe(1);
    expect(report.participations).toBe(2);
    expect(report.songUses).toBe(2);
  });
});
