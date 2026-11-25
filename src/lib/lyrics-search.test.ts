import { describe, expect, it } from 'vitest';
import { findLyricsMatch } from './lyrics-search';

describe('busca por trecho da letra', () => {
  const content = 'Verso\n[G]Nesta casa há [D/F#]lugar\n[Em7]Para a vida re[Cadd9]começar';
  it('acha o trecho ignorando acordes e acentos', () => {
    expect(findLyricsMatch(content, 'vida recomecar')).toEqual({ before: 'Para a ', match: 'vida recomeçar', after: '' });
    expect(findLyricsMatch(content, 'CASA HA')).toEqual({ before: 'Nesta ', match: 'casa há', after: ' lugar' });
  });
  it('corta linhas longas com reticências', () => {
    const long = `${'a '.repeat(40)}palavra chave${' b'.repeat(40)}`;
    const found = findLyricsMatch(long, 'palavra chave', { before: 4, after: 4 })!;
    expect(found.before.startsWith('…')).toBe(true);
    expect(found.after.endsWith('…')).toBe(true);
    expect(found.match).toBe('palavra chave');
  });
  it('não busca com menos de 3 letras nem acha o que não existe', () => {
    expect(findLyricsMatch(content, 'pa')).toBeNull();
    expect(findLyricsMatch(content, 'aleluia')).toBeNull();
  });
});
