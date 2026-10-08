import { describe, expect, it } from 'vitest';
import { contentInChurchKey, resolveSourceTonality, songInChurchKey } from './song-tones';
import { parseCifraClubText } from './cifraclub';
import { transposeContent } from './music';
import type { Song } from '../types';
import type { SongSearchResult } from './song-search';

const source = (value: Partial<SongSearchResult>): SongSearchResult => ({ id: 'source', title: 'Canção', artist: 'Equipe', source: 'Cifra Club', sourceUrl: '', kind: 'chords', content: '[G] [A] [D]', ...value });

describe('tom padrão da importação, compartilhado pelo PDF e Cifra Club', () => {
  it('usa o tom escrito já informado sem subtrair o capo duas vezes', () => {
    expect(resolveSourceTonality(source({ originalKey: 'G', soundingKey: 'Bb', capo: 3 }))).toMatchObject({ writtenKey: 'G', churchKey: 'G', estimated: false, requiresKeyConfirmation: false });
  });
  it('subtrai casas do tom sonoro quando somente este tom foi informado', () => {
    const resolved = resolveSourceTonality(source({ soundingKey: 'Bb', capo: 3, keyUnknownReason: 'A fonte informa capotraste, mas não o tom das posições.' }));
    expect(resolved).toMatchObject({ writtenKey: 'G', churchKey: 'G', source: { originalKey: 'G', keyUnknownReason: undefined } });
    expect(contentInChurchKey(resolved.source.content!, resolved.source.originalKey, resolved.churchKey!)).toBe('[G] [A] [D]');
  });
  it('reduz corretamente ao atravessar C e normaliza sustenidos equivalentes', () => {
    expect(resolveSourceTonality(source({ soundingKey: 'Db', capo: 2 })).churchKey).toBe('B');
    expect(resolveSourceTonality(source({ soundingKey: 'A#', capo: 3 })).churchKey).toBe('G');
  });
  it('sugere D com possível C emprestado, sem alterar acordes por conta do capo', () => {
    const resolved = resolveSourceTonality(source({ content: '[G] [A] [D] [Bm] [C]', capo: 3 }));
    expect(resolved).toMatchObject({ writtenKey: 'D', churchKey: 'D', estimated: true, requiresKeyConfirmation: false,
      source: { originalKey: 'D', keyEstimate: { borrowedChords: ['C'], confidence: 'medium' } } });
  });
  it('não substitui um tom informado por um palpite dos acordes', () => {
    expect(resolveSourceTonality(source({ originalKey: 'E' }))).toMatchObject({ churchKey: 'E', estimated: false, source: { keyEstimate: undefined } });
  });
  it('mantém confirmação quando há tonalidades relativas ambíguas', () => {
    expect(resolveSourceTonality(source({ content: '[C] [G] [Am] [F]' }))).toMatchObject({ estimated: true, requiresKeyConfirmation: true, source: { originalKey: undefined } });
  });
  it('conflito explícito exige confirmação e letra pura não inventa tom', () => {
    expect(resolveSourceTonality(source({ originalKey: 'G', soundingKey: 'Bb', capo: 3, keyUnknownReason: 'A fonte informa posições de capotraste diferentes.' })).requiresKeyConfirmation).toBe(true);
    expect(resolveSourceTonality(source({ kind: 'lyrics', content: 'Um verso apenas' }))).toMatchObject({ churchKey: null, estimated: false, requiresKeyConfirmation: false });
  });
});

describe('tom real dos acordes cadastrados', () => {
  it('converte G para Bb ao importar e Bb para C ao visualizar', () => {
    const content = contentInChurchKey('[G]Nossa [D/F#]luz\n[Em7]Em [C]paz', 'G', 'Bb');
    expect(content).toBe('[Bb]Nossa [F/A]luz\n[Gm7]Em [Eb]paz');
    expect(transposeContent(content, 'Bb', 'C')).toBe('[C]Nossa [G/B]luz\n[Am7]Em [F]paz');
  });
  it('usa posições G e não duplica o capotraste na terceira casa', () => {
    const parsed = parseCifraClubText('Tom: Bb (forma dos acordes no tom de G)\nCapotraste: 3\nG D/F#\nNossa luz');
    expect(parsed).toMatchObject({ originalKey: 'G', soundingKey: 'Bb', capo: 3 });
    const content = contentInChurchKey(parsed.content, parsed.originalKey, 'Bb');
    expect(content).toContain('[Bb]');
    expect(content).toContain('[F/A]');
    expect(content).not.toMatch(/Capotraste|\[Db\]/);
  });
  it('não inventa tom quando a fonte é ambígua ou tem apenas um primeiro acorde', () => {
    const parsed = parseCifraClubText('Tom: Bb\nCapotraste: 3\nG\nNossa luz');
    expect(parsed.originalKey).toBeUndefined();
    expect(() => contentInChurchKey(parsed.content, parsed.originalKey, 'Bb')).toThrow(/Confirme/);
    expect(contentInChurchKey(parsed.content, 'G', 'Bb')).toBe('[Bb]Nossa luz');
  });
  it('limpa tablatura e mantém seções e texto ao normalizar um registro legado', () => {
    const song: Song = { id: 'legacy', title: 'Luz', artist: 'Equipe', originalKey: 'G', churchKey: 'Bb',
      content: '[Intro]\ne|--0--2--3--|\nB|--1--3--0--|\n[G]Nossa [D/F#]luz', notes: '', tagIds: [], youtubeUrl: '' };
    const result = songInChurchKey(song);
    expect(result.content).toBe('[Intro]\n[Bb]Nossa [F/A]luz');
    expect(result.originalKey).toBe('Bb');
    expect(song.content).toContain('e|');
    expect(songInChurchKey(result)).toEqual(result);
    const changed = songInChurchKey(result, 'C');
    expect(changed.content).toBe('[Intro]\n[C]Nossa [G/B]luz');
    expect(changed.originalKey).toBe('C');
  });
  it('deixa letra sem acordes importar sem afirmar uma tonalidade de origem', () => {
    expect(contentInChurchKey('Nossa luz nos guia', undefined, 'Bb')).toBe('Nossa luz nos guia');
  });
});
