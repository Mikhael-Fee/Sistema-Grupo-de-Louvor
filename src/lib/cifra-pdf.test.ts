import { describe, expect, it } from 'vitest';
import { pdfPageLines, songFromPdfText, type PdfWord } from './cifra-pdf';
import { stripChords } from './music';

const word = (text: string, x: number, y: number): PdfWord => ({ text, x, y, width: text.length * 6, height: 12 });
describe('PDF de cifra', () => {
  it('reconstrói espaços, ordena as linhas e preserva acordes compostos', () => {
    const lines = pdfPageLines([word('Nossa luz nos guia', 40, 60), word('D/F#', 100, 45), word('G', 40, 45)], 595);
    expect(lines).toEqual(['G         D/F#', 'Nossa luz nos guia']);
    const source = songFromPdfText(`Canção de teste\nEquipe\nTom: G\n${lines.join('\n')}`);
    expect(source.content).toContain('[G]Nossa luz ');
    expect(source.content).toContain('[D/F#]');
  });
  it('preserva escrita e tom sonoro de capotraste sem inferir pelo primeiro acorde', () => {
    const song = songFromPdfText('Me Atraiu\nGabriela Rocha\nTom: Bb (forma dos acordes no tom de G)\nCapotraste: 3\nG D/F#\nTua presença\ne|--0--2--3--|\nB|--1--3--0--|\nhttps://www.cifraclub.com.br/gabriela-rocha/me-atraiu/imprimir.html', 'Me Atraiu - Gabriela Rocha - Cifra Club');
    expect(song).toMatchObject({ title: 'Me Atraiu', artist: 'Gabriela Rocha', source: 'Cifra Club',
      originalKey: 'G', soundingKey: 'Bb', capo: 3, sourceUrl: 'https://www.cifraclub.com.br/gabriela-rocha/me-atraiu/' });
    expect(song.content).not.toMatch(/Capotraste|e\|--|Gabriela Rocha|https:/);
  });
  it('sem cabeçalho não usa versos como título e artista', () => {
    const song = songFromPdfText('G D\nNossa luz nos guia\nC G\nSeguimos em paz', '', 'Canção.pdf');
    expect(song).toMatchObject({ title: 'Canção', artist: '', originalKey: undefined });
    expect(stripChords(song.content || '')).toBe('Nossa luz nos guia\nSeguimos em paz');
  });
  it('remove rodapé e cabeçalho de impressão sem substituir artista por navegação', () => {
    const song = songFromPdfText('08/10/2026, 15:45  Canção - Equipe - Cifra Club\nMenu principal\nCanção\nEquipe\nTom: C\nC G\nUma chama\nhttps://www.cifraclub.com.br/equipe/cancao/  1/2', 'Canção - Equipe - Cifra Club');
    expect(song.artist).toBe('Equipe');
    expect(song.content).not.toMatch(/15:45|Menu principal|https:/);
  });
  it('lê uma coluna inteira antes da seguinte em uma impressão de duas colunas', () => {
    const items = Array.from({ length: 4 }, (_, index) => [word(`Verso esquerdo ${index}`, 30, 50 + index * 30), word(`Verso direito ${index}`, 320, 50 + index * 30)]).flat();
    expect(pdfPageLines(items, 595)).toEqual(['Verso esquerdo 0', 'Verso esquerdo 1', 'Verso esquerdo 2', 'Verso esquerdo 3', '', 'Verso direito 0', 'Verso direito 1', 'Verso direito 2', 'Verso direito 3']);
  });
  it('notas separadas horizontalmente não criam duas colunas', () => {
    expect(pdfPageLines([word('G', 30, 50), word('D/F#', 350, 50), word('Um verso longo que atravessa o meio da página', 30, 65)], 595)).toHaveLength(2);
  });
  it.each(['', 'Uma letra sem acordes', 'A'.repeat(100_001)])('rejeita imagem/sem texto, sem acordes ou texto acima do limite %#', text => {
    expect(() => songFromPdfText(text)).toThrow();
  });
  it('rejeita coordenadas malformadas antes de criar espaços', () => {
    expect(() => pdfPageLines([word('G', Number.POSITIVE_INFINITY, 50)], 595)).toThrow(/alinhamento/);
    expect(() => pdfPageLines([word('G', 30, 50)], 1_000_000)).toThrow(/grande/);
  });
});
