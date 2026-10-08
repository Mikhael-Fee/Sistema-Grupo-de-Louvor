import { describe, expect, it } from 'vitest';
import { contentInChurchKey, songInChurchKey } from './song-tones';
import { parseCifraClubText } from './cifraclub';
import { transposeContent } from './music';
import type { Song } from '../types';

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
