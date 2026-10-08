import type { MinistryData, Service } from '../types';

export type AnalyticsPeriod = 'all' | '30' | '90' | 'year' | 'custom';
export interface AnalyticsRange { start: string; end: string }
export interface AnalyticsCount { id: string; label: string; count: number; percentage: number }
export interface AnalyticsSong extends AnalyticsCount { artist: string; lastDate: string }
export interface AnalyticsPerson extends AnalyticsCount { functions: string[]; lastDate: string }
export interface AnalyticsTimeline {
  id: string; label: string; services: number; participations: number; songUses: number;
}
export interface MinistryAnalytics {
  services: number; participations: number; assignments: number; songUses: number;
  uniquePeople: number; uniqueSongs: number; averageTeam: number;
  servicesWithTeam: number; servicesWithSongs: number; futureServices: number;
  songs: AnalyticsSong[]; people: AnalyticsPerson[]; functions: AnalyticsCount[];
  themes: AnalyticsCount[]; tags: AnalyticsCount[]; times: AnalyticsCount[];
  timeline: AnalyticsTimeline[]; timelineLabel: string;
  inventory: { songs: number; people: number; tags: number; unusedSongs: number; unscheduledPeople: number };
}

/** Ministry dates are calendar days in São Paulo, independent of the device timezone. */
export function ministryToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function analyticsRangeError(range: AnalyticsRange): string | null {
  if ((range.start && !isCalendarDate(range.start)) || (range.end && !isCalendarDate(range.end))) return 'Informe datas válidas para o período.';
  if (range.start && range.end && range.start > range.end) return 'A data inicial precisa ser anterior ou igual à data final.';
  return null;
}

export function analyticsDateRange(period: AnalyticsPeriod, today: string, custom: AnalyticsRange = { start: '', end: '' }): AnalyticsRange {
  if (!isCalendarDate(today)) throw new Error('Informe a data atual do ministério.');
  if (period === 'custom') return { ...custom };
  if (period === 'all') return { start: '', end: '' };
  if (period === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (Number(period) - 1));
  return { start: start.toISOString().slice(0, 10), end: today };
}

const percentage = (count: number, total: number) => total ? Math.round(count / total * 100) : 0;
const alphabetical = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'pt-BR');
const ranked = <T extends AnalyticsCount>(rows: T[]): T[] => rows.sort((a, b) => b.count - a.count || alphabetical(a, b));
const countRows = (counts: Map<string, number>, denominator: number): AnalyticsCount[] => ranked(
  [...counts].map(([label, count]) => ({ id: label, label, count, percentage: percentage(count, denominator) })),
);
const increment = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) || 0) + 1);

function timelineFor(services: Service[], range: AnalyticsRange): { points: AnalyticsTimeline[]; label: string; bucket: (date: string) => string } {
  if (!services.length) return { points: [], label: 'Por mês', bucket: () => '' };
  const dates = services.map(service => service.date).sort();
  const start = range.start || dates[0];
  const end = range.end || dates[dates.length - 1];
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  const startMonth = startYear * 12 + Number(start.slice(5, 7)) - 1;
  const endMonth = endYear * 12 + Number(end.slice(5, 7)) - 1;
  const point = (id: string, label: string): AnalyticsTimeline => ({ id, label, services: 0, participations: 0, songUses: 0 });
  if (endMonth - startMonth < 24) {
    const points = Array.from({ length: endMonth - startMonth + 1 }, (_, offset) => {
      const month = startMonth + offset;
      const id = `${String(Math.floor(month / 12)).padStart(4, '0')}-${String(month % 12 + 1).padStart(2, '0')}`;
      const label = new Date(`${id}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('.', '');
      return point(id, label);
    });
    return { points, label: 'Por mês', bucket: date => date.slice(0, 7) };
  }
  // Longer histories are grouped, never truncated; every selected service remains counted.
  const step = Math.ceil((endYear - startYear + 1) / 24);
  const points = Array.from({ length: Math.ceil((endYear - startYear + 1) / step) }, (_, offset) => {
    const year = startYear + offset * step;
    return point(String(year), step === 1 ? String(year) : `${year}–${Math.min(year + step - 1, endYear)}`);
  });
  return { points, label: step === 1 ? 'Por ano' : `Em intervalos de ${step} anos`, bucket: date => String(startYear + Math.floor((Number(date.slice(0, 4)) - startYear) / step) * step) };
}

/** Count planned repertoire and scale entries, not attendance or confirmed performances. */
export function buildMinistryAnalytics(data: MinistryData, range: AnalyticsRange, today: string): MinistryAnalytics {
  const invalid = analyticsRangeError(range);
  if (invalid) throw new Error(invalid);
  if (!isCalendarDate(today)) throw new Error('Informe a data atual do ministério.');
  const services = [...new Map(data.services.map(service => [service.id, service])).values()].filter(service =>
    isCalendarDate(service.date) && (!range.start || service.date >= range.start) && (!range.end || service.date <= range.end),
  );
  const songs = new Map(data.songs.map(song => [song.id, song]));
  const people = new Map(data.people.map(person => [person.id, person]));
  const tags = new Map(data.tags.map(tag => [tag.id, tag]));
  const songCounts = new Map<string, number>();
  const personCounts = new Map<string, number>();
  const personFunctions = new Map<string, Set<string>>();
  const personDates = new Map<string, string>();
  const songDates = new Map<string, string>();
  const functionCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();
  const timeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const timeline = timelineFor(services, range);
  const timelinePoints = new Map(timeline.points.map(point => [point.id, point]));
  let participations = 0;
  let assignments = 0;
  let songUses = 0;
  let servicesWithTeam = 0;
  let servicesWithSongs = 0;
  let uncategorizedUses = 0;
  for (const service of services) {
    increment(themeCounts, service.type.trim() || 'Sem tipo informado');
    increment(timeCounts, service.time || 'Horário indisponível');
    const team = new Set<string>();
    const functions = new Set<string>();
    for (const assignment of service.assignments) {
      team.add(assignment.personId);
      const signature = JSON.stringify([assignment.personId, assignment.function]);
      if (functions.has(signature)) continue;
      functions.add(signature);
      increment(functionCounts, assignment.function || 'Função indisponível');
      const assigned = personFunctions.get(assignment.personId) || new Set<string>();
      assigned.add(assignment.function || 'Função indisponível');
      personFunctions.set(assignment.personId, assigned);
    }
    for (const id of team) {
      increment(personCounts, id);
      personDates.set(id, service.date > (personDates.get(id) || '') ? service.date : personDates.get(id)!);
    }
    const repertoire = new Set(service.repertoire.map(item => item.songId));
    for (const id of repertoire) {
      increment(songCounts, id);
      songDates.set(id, service.date > (songDates.get(id) || '') ? service.date : songDates.get(id)!);
      const songTags = new Set(songs.get(id)?.tagIds || []);
      if (!songTags.size) uncategorizedUses++;
      for (const tagId of songTags) increment(tagCounts, tagId);
    }
    participations += team.size;
    assignments += functions.size;
    songUses += repertoire.size;
    if (team.size) servicesWithTeam++;
    if (repertoire.size) servicesWithSongs++;
    const point = timelinePoints.get(timeline.bucket(service.date));
    if (point) { point.services++; point.participations += team.size; point.songUses += repertoire.size; }
  }
  const tagRows = [...tagCounts].map(([id, count]) => ({ id, label: tags.get(id)?.name || 'Etiqueta indisponível', count, percentage: percentage(count, songUses) }));
  if (uncategorizedUses) tagRows.push({ id: 'without-tags', label: 'Sem etiqueta disponível', count: uncategorizedUses, percentage: percentage(uncategorizedUses, songUses) });
  return {
    services: services.length, participations, assignments, songUses,
    uniquePeople: personCounts.size, uniqueSongs: songCounts.size,
    averageTeam: services.length ? participations / services.length : 0,
    servicesWithTeam, servicesWithSongs, futureServices: services.filter(service => service.date > today).length,
    songs: ranked([...songCounts].map(([id, count]) => ({ id, label: songs.get(id)?.title || 'Música indisponível', artist: songs.get(id)?.artist || '', count, percentage: percentage(count, services.length), lastDate: songDates.get(id) || '' }))),
    people: ranked([...personCounts].map(([id, count]) => ({ id, label: people.get(id)?.name || 'Pessoa indisponível', functions: [...(personFunctions.get(id) || [])].sort((a, b) => a.localeCompare(b, 'pt-BR')), count, percentage: percentage(count, services.length), lastDate: personDates.get(id) || '' }))),
    functions: countRows(functionCounts, assignments), themes: countRows(themeCounts, services.length),
    tags: ranked(tagRows), times: countRows(timeCounts, services.length),
    timeline: timeline.points, timelineLabel: timeline.label,
    inventory: {
      songs: songs.size, people: people.size, tags: tags.size,
      unusedSongs: [...songs.keys()].filter(id => !songCounts.has(id)).length,
      unscheduledPeople: [...people.keys()].filter(id => !personCounts.has(id)).length,
    },
  };
}
