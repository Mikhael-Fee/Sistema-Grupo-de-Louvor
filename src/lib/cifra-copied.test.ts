import { describe, expect, it } from 'vitest';
import { extractChordSheet, songFromCopiedText } from './cifra-copied';

// Shape of "Selecionar tudo" + "Copiar" on a phone: page chrome around the sheet.
const PAGE = [
  'Menu principal', 'Cifra Club', 'Buscar', 'Canção da Equipe', 'Equipe Local',
  'Cifra: Principal (violão e guitarra)', 'Favoritar Cifra', 'Tom: G', 'Capotraste na 2ª casa', 'Afinação: E A D G B E', 'Auto rolagem', 'Simplificar cifra',
  '', '[Intro] G  D  Em  C', '', '[Primeira Parte]', '', 'G           D', 'Tua luz nos guia', 'Em          C', 'Seguimos em paz',
  '', '[Refrão]', '', 'C       G', 'Santo, santo', '', 'Composição de Equipe Local', 'Colaboração e revisão', 'Comentários', 'E aí, alguém tem o solo?', 'Mais tocadas', 'A Outra Música',
  'https://www.cifraclub.com.br/equipe-local/cancao-da-equipe/',
].join('\n');

describe('cifra copiada no celular', () => {
  it('mantém somente tom, capotraste e a cifra da página inteira copiada', () => {
    const sheet = extractChordSheet(PAGE);
    expect(sheet.startsWith('Tom: G\nCapotraste na 2ª casa\nAfinação: E A D G B E\n\n[Intro]')).toBe(true);
    expect(sheet).toContain('Tua luz nos guia');
    expect(sheet.endsWith('Santo, santo')).toBe(true);
    for (const junk of ['Menu principal', 'Favoritar', 'Auto rolagem', 'Composição', 'Comentários', 'solo?', 'Mais tocadas']) expect(sheet).not.toContain(junk);
  });

  it('gera uma prévia com acordes alinhados, tom e link da fonte', () => {
    const song = songFromCopiedText(PAGE);
    expect(song).toMatchObject({ source: 'Cifra Club', kind: 'chords', sourceUrl: 'https://www.cifraclub.com.br/equipe-local/cancao-da-equipe/', soundingKey: 'G', capo: 2 });
    expect(song.keyUnknownReason).toContain('capotraste');
    expect(songFromCopiedText(PAGE.replace('Capotraste na 2ª casa\n', '')).originalKey).toBe('G');
    expect(song.content).toContain('[G]Tua luz nos [D]guia');
    expect(song.content).toContain('[Intro] [G]  [D]  [Em]  [C]');
    expect(song.content).not.toMatch(/Menu|Afinação|Capotraste/);
  });

  it('preserva um texto que já contém somente a cifra', () => {
    const only = 'G     D\nTua luz\nEm    C\nNos guia\n\nG\nFim do verso';
    expect(extractChordSheet(only)).toBe(only);
  });

  it('não corta texto sem acordes suficientes e recusa conteúdo sem cifra', () => {
    expect(extractChordSheet('Só a letra\nOutra linha')).toBe('Só a letra\nOutra linha');
    expect(() => songFromCopiedText('Só a letra\nOutra linha')).toThrow('Não encontrei acordes');
    expect(() => songFromCopiedText('   ')).toThrow('vazia');
    expect(() => songFromCopiedText('x'.repeat(200_001))).toThrow('muito longo');
  });
});
