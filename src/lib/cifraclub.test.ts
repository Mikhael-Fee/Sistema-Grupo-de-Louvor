import { describe, expect, it } from 'vitest';
import { buildCifraClubSearchUrl, chordSheetMetadata, cleanChordSheet, normalizeCifraClubUrl, parseCifraClubText } from './cifraclub';
import { stripChords, transposeContent } from './music';

describe('importação de texto do Cifra Club', () => {
  it('alinha acordes e baixo invertido sem perder os caracteres da letra', () => {
    const parsed = parseCifraClubText('Tom: C\r\nC       G/B\r\nGraça e paz\r\nAm7     F\r\nVem nos guiar');
    expect(parsed).toEqual({ originalKey: 'C', content: '[C]Graça e [G/B]paz\n[Am7]Vem nos [F]guiar' });
    expect(stripChords(parsed.content)).toBe('Graça e paz\nVem nos guiar');
    expect(transposeContent(parsed.content, 'C', 'D')).toBe('[D]Graça e [A/C#]paz\n[Bm7]Vem nos [G]guiar');
  });

  it('normaliza tom enarmônico, símbolos e extensões que continuam transponíveis', () => {
    const parsed = parseCifraClubText('Tom: C♯m\nF♯m7(b5)   G♯7(9)/B♯\nLuz e paz para nós');
    expect(parsed.originalKey).toBe('Db');
    expect(parsed.content).toBe('[F#m7(b5)]Luz e paz p[G#7(9)/B#]ara nós');
    expect(transposeContent(parsed.content, 'Db', 'D')).toBe('[Gm7(b5)]Luz e paz p[A7(9)/C#]ara nós');
  });

  it('expande tabulações e mantém espaços quando um acorde termina após a letra', () => {
    const parsed = parseCifraClubText('C\tG\nPaz e luz\n\nD          A\nAmém');
    expect(parsed.content).toBe('[C]Paz e lu[G]z\n\n[D]Amém       [A]');
    expect(stripChords(parsed.content)).toBe('Paz e luz\n\nAmém       ');
  });

  it('preserva seções, introdução instrumental, repetições e cifras já inline', () => {
    const parsed = parseCifraClubText('[Intro] C  G/B  Am\n\n[Refrão]\nC  F\nÉs luz\n\n| C  G | (2x)\n[C]Já [G/B]está aqui');
    expect(parsed.content).toBe('[Intro] [C]  [G/B]  [Am]\n\n[Refrão]\n[C]És [F]luz\n\n| [C]  [G] | (2x)\n[C]Já [G/B]está aqui');
    expect(transposeContent(parsed.content, 'C', 'D')).toContain('[Intro] [D]  [A/C#]  [Bm]');
  });

  it('conserva letras sem acordes e não inventa o tom sem cabeçalho reconhecido', () => {
    const text = '[Primeira parte]\nA paz vem amanhã\nCoração em ti\n\n[Refrão]\nSeguimos em paz';
    expect(parseCifraClubText(text)).toEqual({ content: text });
    expect(parseCifraClubText('Tom: desconhecido\nCanção de fé')).toEqual({ content: 'Tom: desconhecido\nCanção de fé' });
  });

  it('mantém acordes instrumentais em linhas separadas de cabeçalhos e outras cifras', () => {
    expect(parseCifraClubText('C G\n[Refrão]\nAm F\nD E\n\nLuz').content)
      .toBe('[C] [G]\n[Refrão]\n[Am] [F]\n[D] [E]\n\nLuz');
    expect(() => parseCifraClubText('  ')).toThrow('Cole a letra');
    expect(() => parseCifraClubText('a'.repeat(100_001))).toThrow('100.000');
  });

  it('preserva texto colado com acordes malformados ou colchetes abertos sem travar a conversão', () => {
    const malformed = `C${'1'.repeat(26)}x`;
    expect(parseCifraClubText(`${malformed}\nPalavra`).content).toBe(`${malformed}\nPalavra`);
    const markers = '['.repeat(50_000);
    expect(parseCifraClubText(`${markers}\n[C♯]Paz`).content).toBe(`${markers}\n[C#]Paz`);
  });

  it('remove tablaturas e aparelhos de violão conservando letra, rótulos e introdução com acordes', () => {
    const input = 'Afinação: E A D G B E\nCapotraste na 3ª casa\n[Intro] G D/F# Em\n\nTablatura:\nE|--0--2--3---|\nB|--1--0--0---|\nG|--0--0--0---|\nD|--2--0--0---|\nA|--3--2--2---|\nE|-----3--3---|\n\n[Refrão]\nG       C\nUma luz nos guia\nE\nA\nCoração em paz';
    const cleaned = cleanChordSheet(input);
    expect(cleaned).not.toMatch(/Afinação|Capotraste|Tablatura|\|--/);
    expect(cleaned).toContain('[Intro] G D/F# Em');
    expect(cleaned).toContain('[Refrão]');
    expect(cleaned).toContain('E\nA\nCoração em paz');
    const parsed = parseCifraClubText(input);
    expect(parsed.content).toContain('[Intro] [G] [D/F#] [Em]');
    expect(parsed.content).toContain('[G]Uma luz [C]nos guia');
  });

  it('limpa também o ChordPro salvo sem apagar versos e repetições musicais', () => {
    const input = '[Intro] [G] [D/F#]\nE|----0----|\n[A]|----2----|\n[Refrão]\n[G]A luz [C]está aqui\n| [G] [C] | (2x)\nA afinação do coração\nSem capotraste no caminho';
    expect(cleanChordSheet(input)).toBe('[Intro] [G] [D/F#]\n[Refrão]\n[G]A luz [C]está aqui\n| [G] [C] | (2x)\nA afinação do coração\nSem capotraste no caminho');
  });

  it('remove diagramas explícitos, mas conserva acordes com letra e barras de repetição', () => {
    const input = 'Diagramas dos acordes\nE A D G B E\nC x32010\nG: 320003\nDm x x 0 2 3 1\n\n[G]Luz\n| C G |\nC\n|---|---|\n| ● |   |\n|   | ● |\n\n[Refrão]\nSegue a canção';
    expect(cleanChordSheet(input)).toBe('\n[G]Luz\n| C G |\nC\n\n[Refrão]\nSegue a canção');
  });

  it('usa o tom das posições indicado na fonte, sem somar o capotraste de novo', () => {
    const input = 'Tom: Bb (forma dos acordes no tom de G)\nCapotraste na 3ª casa\nG     D/F#\nLuz em paz';
    const parsed = parseCifraClubText(input);
    expect(parsed.originalKey).toBe('G');
    expect(parsed.soundingKey).toBe('Bb');
    expect(parsed.capo).toBe(3);
    expect(transposeContent(parsed.content, parsed.originalKey!, 'Bb')).toBe('[Bb]Luz em[F/A] paz');
    expect(stripChords(parsed.content)).toBe('Luz em paz');
  });

  it('não atribui o tom que soa a posições com capotraste sem forma explícita', () => {
    const parsed = parseCifraClubText('Tom: Bb\nCapotraste: 3\nG\nLuz');
    expect(parsed.originalKey).toBeUndefined();
    expect(parsed.soundingKey).toBe('Bb');
    expect(parsed.capo).toBe(3);
    expect(parsed.keyUnknownReason).toContain('posições');
    expect(parsed.content).toBe('[G]Luz');
    expect(chordSheetMetadata('Tom: G\nCapotraste: 0')).toEqual({ originalKey: 'G', capo: 0 });
    expect(chordSheetMetadata('G\nLuz')).toEqual({});
  });

  it('preserva linhas extensas malformadas sem retrocesso em espaços repetidos', () => {
    const padding = ' '.repeat(50_000);
    for (const text of [`${padding}texto`, `C${padding}texto`, `Capotraste${padding}texto`, `|${padding}texto`]) {
      expect(cleanChordSheet(text)).toBe(text);
      expect(parseCifraClubText(text).content).toBe(text.trim());
    }
  });
});

describe('referências do Cifra Club', () => {
  it('codifica consultas e normaliza o endereço canônico sem parâmetros de rastreamento', () => {
    const url = new URL(buildCifraClubSearchUrl(' Canção & luz ', ' Grupo / local '));
    expect(url.hostname).toBe('www.cifraclub.com.br');
    expect(url.searchParams.get('q')).toBe('Canção & luz Grupo / local');
    expect(normalizeCifraClubUrl('https://cifraclub.com.br/equipe/cancao?utm_source=teste#tom'))
      .toBe('https://www.cifraclub.com.br/equipe/cancao/');
  });

  it('rejeita links externos, credenciais, caminhos de conta e protocolos inseguros', () => {
    for (const url of ['http://www.cifraclub.com.br/equipe/cancao/', 'https://www.cifraclub.com.br.evil.test/equipe/cancao/', 'https://user@www.cifraclub.com.br/equipe/cancao/', 'https://www.cifraclub.com.br:8443/equipe/cancao/', 'https://www.cifraclub.com.br/login/', 'javascript:alert(1)']) {
      expect(normalizeCifraClubUrl(url)).toBeNull();
    }
  });
});
