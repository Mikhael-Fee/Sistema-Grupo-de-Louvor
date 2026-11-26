import { describe, expect, it } from 'vitest';
import { findSuggestionDuplicates, guessSongFromVideo, normalizeTitle, relativeTime, sortSuggestions, suggestionView } from './suggestions';
import type { Song, SongSuggestion } from '../types';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const suggestion = (over: Partial<SongSuggestion>): SongSuggestion => ({
  id: 's1',
  title: 'Lugar Secreto',
  artist: 'Gabriela Rocha',
  videoId: 'abcdefghijk',
  videoTitle: '',
  channel: '',
  status: 'suggested',
  statusNote: '',
  mine: false,
  authorName: 'Ana',
  createdAt: daysAgo(1),
  statusChangedAt: daysAgo(1),
  lastActivityAt: daysAgo(1),
  tagIds: [],
  votes: 0,
  votedByMe: false,
  comments: [],
  ...over,
});
const song = (title: string): Song => ({
  id: title,
  title,
  artist: 'X',
  originalKey: 'C',
  churchKey: 'C',
  content: 'x',
  youtubeUrl: '',
  notes: '',
  tagIds: [],
});

describe('guessSongFromVideo', () => {
  it('splits "Artista - Título" and drops the live/official noise', () => {
    expect(guessSongFromVideo('Gabriela Rocha - Lugar Secreto (Ao Vivo)', 'Gabriela Rocha')).toEqual({
      title: 'Lugar Secreto',
      artist: 'Gabriela Rocha',
    });
    expect(guessSongFromVideo('Aline Barros – Ressuscita-me [Clipe Oficial] | Louvor', 'Aline Barros Oficial')).toEqual({
      title: 'Ressuscita-me',
      artist: 'Aline Barros',
    });
  });
  it('understands "Título - Artista" when the channel is on the right', () => {
    expect(guessSongFromVideo('Ninguém Explica Deus - Preto no Branco', 'Preto no Branco')).toEqual({
      title: 'Ninguém Explica Deus',
      artist: 'Preto no Branco',
    });
  });
  it('falls back to the channel as artist', () => {
    expect(guessSongFromVideo('Bondade de Deus (Live) #worship', 'Isaias Saad - Topic')).toEqual({
      title: 'Bondade de Deus',
      artist: 'Isaias Saad',
    });
  });
});

describe('duplicates', () => {
  it('matches titles ignoring accents, case and parentheses', () => {
    expect(normalizeTitle('Ninguém Explica Deus (Ao Vivo)')).toBe('ninguem explica deus');
    const found = findSuggestionDuplicates(
      'ninguem explica deus',
      'zzzzzzzzzzz',
      [song('Ninguém Explica Deus'), song('Outra')],
      [
        suggestion({ id: 'a', videoId: 'zzzzzzzzzzz' }),
        suggestion({ id: 'b', title: 'Ninguém explica Deus', videoId: 'yyyyyyyyyyy', status: 'declined' }),
        suggestion({ id: 'c', title: 'Ninguém explica Deus', status: 'approved' }),
      ],
    );
    expect(found.songs.map(item => item.title)).toEqual(['Ninguém Explica Deus']);
    expect(found.suggestions.map(item => item.id)).toEqual(['a', 'b']);
    expect(found.sameOpenVideo?.id).toBe('a');
  });
  it('an empty title never matches everything', () => {
    expect(findSuggestionDuplicates('  ', 'q', [song('A')], []).songs).toEqual([]);
  });
});

describe('suggestionView', () => {
  it('keeps open suggestions while people interact, then archives', () => {
    expect(suggestionView(suggestion({ lastActivityAt: daysAgo(59) }), NOW)).toBe('open');
    expect(suggestionView(suggestion({ status: 'reviewing', lastActivityAt: daysAgo(61) }), NOW)).toBe('archive');
  });
  it('shows decisions for 14 days, then archives', () => {
    expect(suggestionView(suggestion({ status: 'approved', statusChangedAt: daysAgo(3) }), NOW)).toBe('decided');
    expect(suggestionView(suggestion({ status: 'declined', statusChangedAt: daysAgo(15) }), NOW)).toBe('archive');
  });
});

it('sorts by recent or by likes, newest first on ties', () => {
  const items = [
    suggestion({ id: 'old-popular', votes: 5, createdAt: daysAgo(10) }),
    suggestion({ id: 'new', votes: 1, createdAt: daysAgo(0) }),
    suggestion({ id: 'mid', votes: 1, createdAt: daysAgo(3) }),
  ];
  expect(sortSuggestions(items, 'recent').map(item => item.id)).toEqual(['new', 'mid', 'old-popular']);
  expect(sortSuggestions(items, 'votes').map(item => item.id)).toEqual(['old-popular', 'new', 'mid']);
});

it('relativeTime', () => {
  expect(relativeTime(daysAgo(0), NOW)).toBe('agora');
  expect(relativeTime(daysAgo(1), NOW)).toBe('ontem');
  expect(relativeTime(daysAgo(4), NOW)).toBe('há 4 dias');
});
