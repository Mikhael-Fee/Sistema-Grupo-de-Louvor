import type { MinistryData, Person, Service, Song } from '../types';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const monthName = (month: number) => MONTHS[month - 1] ?? '';
export const shortMonthName = (month: number) => SHORT_MONTHS[month - 1] ?? '';

export function validBirthday(month: number | null | undefined, day: number | null | undefined): boolean {
  if (month == null && day == null) return true;
  if (month == null || day == null || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

export function formatBirthday(person: Pick<Person, 'birthMonth' | 'birthDay'>): string {
  if (!person.birthMonth || !person.birthDay) return '';
  return `${person.birthDay} de ${monthName(person.birthMonth)}`;
}

/** Keeps the digits and adds Brazil's code to a local number with area code. Empty when invalid. */
export function normalizeWhatsapp(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^\d{12,15}$/.test(full) ? full : null;
}

export function formatWhatsapp(digits: string | undefined): string {
  if (!digits) return '';
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : `+${digits}`;
}

export const whatsappLink = (digits: string) => `https://wa.me/${digits}`;

/** Days from today (YYYY-MM-DD) until the next birthday; 0 is today. Feb 29 is celebrated on Feb 28 in other years. */
export function daysUntilBirthday(person: Pick<Person, 'birthMonth' | 'birthDay'>, today: string): number | null {
  if (!person.birthMonth || !person.birthDay) return null;
  const [year, month, day] = today.split('-').map(Number);
  const start = Date.UTC(year, month - 1, day);
  const at = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const birthDay = person.birthMonth === 2 && person.birthDay === 29 && !leap ? 28 : person.birthDay!;
    return Date.UTC(y, person.birthMonth! - 1, birthDay);
  };
  let next = at(year);
  if (next < start) next = at(year + 1);
  return Math.round((next - start) / 86_400_000);
}

/** Active people whose birthday falls within the next `days` days, soonest first. */
export function upcomingBirthdays(people: Person[], today: string, days = 7): { person: Person; inDays: number }[] {
  return people
    .filter(person => person.active !== false)
    .map(person => ({ person, inDays: daysUntilBirthday(person, today) }))
    .filter((item): item is { person: Person; inDays: number } => item.inDays !== null && item.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays || a.person.name.localeCompare(b.person.name, 'pt-BR'));
}

/** How many other services in the same month a person is already on (fair scale). */
export function servicesInMonth(services: Service[], personId: string, date: string, excludeServiceId?: string): number {
  const month = date.slice(0, 7);
  return services.filter(
    service =>
      service.id !== excludeServiceId &&
      service.date.slice(0, 7) === month &&
      service.assignments.some(assignment => assignment.personId === personId),
  ).length;
}

export interface PersonStats {
  month: number;
  year: number;
  songs: number;
  byFunction: { name: string; count: number }[];
  topSong?: { song: Song; count: number };
  /** Last six months, oldest first. */
  perMonth: { month: string; label: string; count: number }[];
  since?: string;
}

/** What one person has served so far (services up to and including today). */
export function personStats(data: Pick<MinistryData, 'services' | 'songs'>, personId: string, today: string): PersonStats {
  const served = data.services.filter(
    service => service.date <= today && service.assignments.some(assignment => assignment.personId === personId),
  );
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const functions = new Map<string, number>();
  const songs = new Map<string, number>();
  for (const service of served) {
    if (service.date.startsWith(thisYear)) {
      for (const assignment of service.assignments)
        if (assignment.personId === personId) functions.set(assignment.function, (functions.get(assignment.function) ?? 0) + 1);
    }
    for (const songId of new Set(service.repertoire.map(item => item.songId))) songs.set(songId, (songs.get(songId) ?? 0) + 1);
  }
  let topSong: PersonStats['topSong'];
  for (const [songId, count] of songs) {
    const song = data.songs.find(item => item.id === songId);
    if (
      song &&
      (!topSong || count > topSong.count || (count === topSong.count && song.title.localeCompare(topSong.song.title, 'pt-BR') < 0))
    )
      topSong = { song, count };
  }
  const [year, month] = today.split('-').map(Number);
  const perMonth = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      month: key,
      label: shortMonthName(date.getUTCMonth() + 1),
      count: served.filter(service => service.date.startsWith(key)).length,
    };
  });
  return {
    month: served.filter(service => service.date.startsWith(thisMonth)).length,
    year: served.filter(service => service.date.startsWith(thisYear)).length,
    songs: songs.size,
    byFunction: [...functions].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    topSong,
    perMonth,
    since: [...served].sort((a, b) => a.date.localeCompare(b.date))[0]?.date,
  };
}

export interface RehearsalSong {
  song: Song;
  key: string;
  serviceId: string;
  serviceDate: string;
  /** Date of the last time this person played it, if ever. */
  lastPlayed?: string;
}

/** Songs of the person's upcoming services, in the service's key, each once (the soonest service wins). */
export function songsToRehearse(data: Pick<MinistryData, 'services' | 'songs'>, personId: string, today: string): RehearsalSong[] {
  const ordered = [...data.services].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const mine = ordered.filter(service => service.assignments.some(assignment => assignment.personId === personId));
  const past = mine.filter(service => service.date < today);
  const result: RehearsalSong[] = [];
  for (const service of mine.filter(item => item.date >= today)) {
    for (const item of service.repertoire) {
      const song = data.songs.find(candidate => candidate.id === item.songId);
      if (!song || result.some(existing => existing.song.id === song.id)) continue;
      const lastPlayed = past.filter(previous => previous.repertoire.some(entry => entry.songId === song.id)).at(-1)?.date;
      result.push({ song, key: item.key, serviceId: service.id, serviceDate: service.date, lastPlayed });
    }
  }
  return result;
}

/** Keys the singers (function "Voz") of this service registered for a song. */
export function singerKeys(
  data: Pick<MinistryData, 'people' | 'songKeys'>,
  service: Pick<Service, 'assignments'>,
  songId: string,
): { person: Person; key: string }[] {
  const singers = [...new Set(service.assignments.filter(item => item.function === 'Voz').map(item => item.personId))];
  return singers
    .map(personId => ({
      person: data.people.find(person => person.id === personId),
      key: data.songKeys?.find(item => item.personId === personId && item.songId === songId)?.key,
    }))
    .filter((item): item is { person: Person; key: string } => Boolean(item.person && item.key));
}
