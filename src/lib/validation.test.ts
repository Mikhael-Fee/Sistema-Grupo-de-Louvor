import { beforeEach, describe, expect, it } from 'vitest';
import type { MinistryData, Service } from '../types';
import { createDemoData } from './seed';
import { isSafeYoutubeUrl, validatePerson, validateService, validateSong, validateTag } from './validation';

let data: MinistryData;
let service: Service;
beforeEach(() => {
  data = createDemoData();
  service = data.services[0];
});

describe('song and directory validation', () => {
  it('accepts the original demonstration and blank optional email/video fields', () => {
    data.songs.forEach((song) => expect(validateSong(song)).toBeNull());
    data.people.forEach((person) => expect(validatePerson(person)).toBeNull());
    data.tags.forEach((tag) => expect(validateTag(tag)).toBeNull());
  });

  it('rejects missing song information and unsupported keys', () => {
    const song = data.songs[0];
    for (const field of ['title', 'artist', 'content'] as const) {
      expect(validateSong({ ...song, [field]: ' \n ' })).toBeTruthy();
    }
    expect(validateSong({ ...song, churchKey: 'H' })).toBeTruthy();
    expect(validateSong({ ...song, originalKey: '' })).toBeTruthy();
    expect(validateSong({ ...song, tagIds: ['one', 'one'] })).toBeTruthy();
  });

  it('requires real person capabilities and rejects malformed optional emails', () => {
    const person = data.people[0];
    expect(validatePerson({ ...person, name: ' ' })).toBeTruthy();
    expect(validatePerson({ ...person, functions: [] })).toBeTruthy();
    expect(validatePerson({ ...person, functions: ['Produção'] })).toBeTruthy();
    expect(validatePerson({ ...person, functions: ['Voz', 'Voz'] })).toBeTruthy();
    expect(validatePerson({ ...person, email: 'a@' })).toBeTruthy();
    expect(validatePerson({ ...person, email: 'nome@exemplo.com' })).toBeNull();
  });

  it('requires a tag name and a full hex color', () => {
    const tag = data.tags[0];
    expect(validateTag({ ...tag, name: ' ' })).toBeTruthy();
    expect(validateTag({ ...tag, color: 'red' })).toBeTruthy();
    expect(validateTag({ ...tag, color: '#12gg00' })).toBeTruthy();
    expect(validateTag({ ...tag, color: '#AbC123' })).toBeNull();
  });
});

describe('YouTube address validation', () => {
  it.each([
    'https://www.youtube.com/watch?v=AbCdEfG_123&t=20',
    'https://youtu.be/AbCdEfG_123?si=sample',
    'https://m.youtube.com/watch?v=AbCdEfG_123',
    'https://youtube.com/shorts/AbCdEfG_123',
    'https://www.youtube.com/embed/AbCdEfG_123',
    'https://www.youtube.com/live/AbCdEfG_123',
  ])('accepts supported video URL %s', (url) => expect(isSafeYoutubeUrl(url)).toBe(true));

  it.each([
    'javascript:alert(1)', 'http://youtube.com/watch?v=AbCdEfG_123',
    'https://youtube.com.evil.example/watch?v=AbCdEfG_123',
    'https://youtube.com@evil.example/watch?v=AbCdEfG_123',
    'https://someone:password@youtube.com/watch?v=AbCdEfG_123',
    'https://youtu.be/', 'https://youtube.com/watch?v=short',
    'https://youtube.com/playlist?list=PLtest', 'https://youtube.com:8443/watch?v=AbCdEfG_123',
    'https://vimeo.com/123456789', '',
  ])('rejects unsafe or unsupported URL %s', (url) => {
    expect(isSafeYoutubeUrl(url)).toBe(false);
    if (url) expect(validateSong({ ...data.songs[0], youtubeUrl: url })).toBeTruthy();
  });
});

describe('service planning validation', () => {
  it('accepts each seeded service and an empty draft repertoire/scale', () => {
    data.services.forEach((item) => expect(validateService(item, data)).toBeNull());
    expect(validateService({ ...service, repertoire: [], assignments: [] }, data)).toBeNull();
  });

  it('checks actual calendar dates, leap years, time and supported service type', () => {
    for (const date of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-01', '06/10/2026', '']) {
      expect(validateService({ ...service, date }, data)).toBeTruthy();
    }
    expect(validateService({ ...service, date: '2028-02-29' }, data)).toBeNull();
    for (const time of ['24:00', '18:60', '6:00', '18:30:00', '']) {
      expect(validateService({ ...service, time }, data)).toBeTruthy();
    }
    expect(validateService({ ...service, type: 'Invalid' }, data)).toBeTruthy();
  });

  it('checks references and a scheduled function against that person’s current capabilities', () => {
    const assignment = service.assignments[0];
    expect(validateService({ ...service, assignments: [{ ...assignment, personId: 'missing' }] }, data)).toBeTruthy();
    expect(validateService({ ...service, assignments: [{ ...assignment, function: 'Bateria' }] }, data)).toBeTruthy();
    expect(validateService({ ...service, repertoire: [{ ...service.repertoire[0], songId: 'missing' }] }, data)).toBeTruthy();
    expect(validateService({ ...service, repertoire: [{ ...service.repertoire[0], key: 'invalid' }] }, data)).toBeTruthy();
  });

  it('prevents duplicate song and person/function entries without blocking different capabilities', () => {
    const assignment = service.assignments[0];
    expect(validateService({ ...service, assignments: [assignment, { ...assignment, id: 'another' }] }, data)).toBeTruthy();
    expect(validateService({ ...service, repertoire: [service.repertoire[0], { ...service.repertoire[0], id: 'another' }] }, data)).toBeTruthy();
    expect(validateService({ ...service, assignments: [assignment, { ...assignment, id: 'another', function: 'Voz' }] }, data)).toBeNull();
  });
});
