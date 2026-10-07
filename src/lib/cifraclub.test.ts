import { describe, expect, it } from 'vitest';
import { buildCifraClubSearchUrl, normalizeCifraClubUrl, parseCifraClubText } from './cifraclub';
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
