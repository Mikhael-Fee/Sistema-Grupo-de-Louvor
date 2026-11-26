import { describe, expect, it } from 'vitest';
import {
  daysUntilBirthday,
  formatBirthday,
  formatWhatsapp,
  normalizeWhatsapp,
  personStats,
  servicesInMonth,
  singerKeys,
  songsToRehearse,
  upcomingBirthdays,
  validBirthday,
} from './member-profile';
import type { Person, Service, Song } from '../types';

const person = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, email: '', functions: ['Voz'], ...extra });
const song = (id: string, title = id): Song => ({
  id,
  title,
  artist: 'A',
  originalKey: 'C',
  churchKey: 'D',
  content: 'x',
  youtubeUrl: '',
  notes: '',
  tagIds: [],
});
const service = (id: string, date: string, people: [string, string][], songs: [string, string][] = []): Service => ({
  id,
  date,
  time: '19:00',
  type: 'Culto de Domingo',
  notes: '',
  assignments: people.map(([personId, fn], index) => ({ id: `${id}-a${index}`, personId, function: fn })),
  repertoire: songs.map(([songId, key], index) => ({ id: `${id}-r${index}`, songId, key, notes: '' })),
});

describe('aniversários', () => {
  it('valida dia e mês sem ano', () => {
    expect(validBirthday(null, null)).toBe(true);
    expect(validBirthday(2, 29)).toBe(true);
    expect(validBirthday(2, 30)).toBe(false);
    expect(validBirthday(4, 31)).toBe(false);
    expect(validBirthday(4, null)).toBe(false);
  });
  it('conta os dias até o próximo aniversário, virando o ano', () => {
    expect(daysUntilBirthday({ birthMonth: 11, birthDay: 26 }, '2026-11-26')).toBe(0);
    expect(daysUntilBirthday({ birthMonth: 11, birthDay: 28 }, '2026-11-26')).toBe(2);
    expect(daysUntilBirthday({ birthMonth: 1, birthDay: 2 }, '2026-12-30')).toBe(3);
    expect(daysUntilBirthday({ birthMonth: 2, birthDay: 29 }, '2027-02-27')).toBe(1);
    expect(daysUntilBirthday({}, '2026-11-26')).toBeNull();
  });
  it('lista só a equipe ativa na próxima semana, do mais próximo ao mais distante', () => {
    const people = [
      person('Ana', { birthMonth: 12, birthDay: 1 }),
      person('Bia', { birthMonth: 11, birthDay: 26 }),
      person('Caio', { birthMonth: 12, birthDay: 20 }),
      person('Davi', { birthMonth: 11, birthDay: 27, active: false }),
    ];
    expect(upcomingBirthdays(people, '2026-11-26').map(item => [item.person.id, item.inDays])).toEqual([
      ['Bia', 0],
      ['Ana', 5],
    ]);
    expect(formatBirthday(people[0])).toBe('1 de dezembro');
  });
});

describe('WhatsApp', () => {
  it('guarda só os dígitos com o código do país', () => {
    expect(normalizeWhatsapp('(11) 98765-4321')).toBe('5511987654321');
    expect(normalizeWhatsapp('+55 11 98765 4321')).toBe('5511987654321');
    expect(normalizeWhatsapp('')).toBe('');
    expect(normalizeWhatsapp('1234')).toBeNull();
    expect(formatWhatsapp('5511987654321')).toBe('(11) 98765-4321');
    expect(formatWhatsapp('351912345678')).toBe('+351912345678');
  });
});

describe('escala justa e histórico', () => {
  const services = [
    service('s1', '2026-10-04', [['ana', 'Voz']], [['g', 'G']]),
    service(
      's2',
      '2026-11-01',
      [
        ['ana', 'Voz'],
        ['ana', 'Teclado'],
      ],
      [
        ['g', 'A'],
        ['h', 'D'],
      ],
    ),
    service('s3', '2026-11-15', [['ana', 'Teclado']], [['h', 'D']]),
    service(
      's4',
      '2026-11-29',
      [
        ['ana', 'Voz'],
        ['bia', 'Voz'],
      ],
      [
        ['g', 'G'],
        ['n', 'E'],
      ],
    ),
  ];
  const songs = [song('g', 'Grande'), song('h', 'Hosana'), song('n', 'Nova')];
  it('conta cultos do mesmo mês, sem contar o culto que está sendo montado', () => {
    expect(servicesInMonth(services, 'ana', '2026-11-29', 's4')).toBe(2);
    expect(servicesInMonth(services, 'bia', '2026-11-29', 's4')).toBe(0);
  });
  it('resume o que a pessoa já serviu', () => {
    const stats = personStats({ services, songs }, 'ana', '2026-11-26');
    expect(stats.month).toBe(2);
    expect(stats.year).toBe(3);
    expect(stats.songs).toBe(2);
    expect(stats.topSong?.song.id).toBe('g');
    expect(stats.byFunction).toEqual([
      { name: 'Teclado', count: 2 },
      { name: 'Voz', count: 2 },
    ]);
    expect(stats.perMonth.map(item => item.count)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(stats.since).toBe('2026-10-04');
  });
  it('lista músicas para ensaiar no tom do culto, com a última vez tocada', () => {
    expect(songsToRehearse({ services, songs }, 'ana', '2026-11-26').map(item => [item.song.id, item.key, item.lastPlayed])).toEqual([
      ['g', 'G', '2026-11-01'],
      ['n', 'E', undefined],
    ]);
  });
  it('sugere o tom de quem está na voz', () => {
    const data = {
      people: [person('ana', { name: 'Ana' }), person('bia', { name: 'Bia' })],
      songKeys: [
        { personId: 'ana', songId: 'g', key: 'E' },
        { personId: 'bia', songId: 'h', key: 'C' },
      ],
    };
    expect(singerKeys(data, services[3], 'g').map(item => [item.person.id, item.key])).toEqual([['ana', 'E']]);
    expect(singerKeys(data, services[2], 'h')).toEqual([]);
  });
});
