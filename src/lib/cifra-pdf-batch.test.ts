import { describe, expect, it } from 'vitest';
import { MAX_BATCH_TOTAL_BYTES, pdfSongIdentity, validatePdfBatchSelection } from './cifra-pdf-batch';

describe('seleção de vários PDFs', () => {
  it('limita arquivos ao acrescentar a uma revisão existente', () => {
    expect(validatePdfBatchSelection([{ size: 1 }], 19)).toBeNull();
    expect(validatePdfBatchSelection([{ size: 1 }, { size: 1 }], 19)).toContain('20 PDFs');
  });
  it('limita o total antes de abrir arquivos, contando leituras anteriores', () => {
    expect(validatePdfBatchSelection([{ size: 5 }], 1, MAX_BATCH_TOTAL_BYTES - 5)).toBeNull();
    expect(validatePdfBatchSelection([{ size: 6 }], 1, MAX_BATCH_TOTAL_BYTES - 5)).toContain('80 MB');
  });
  it('um PDF acima do limite individual não invalida os demais na seleção', () => {
    expect(validatePdfBatchSelection([{ size: 9 * 1024 * 1024 }, { size: 100 }])).toBeNull();
  });
  it('compara título e artista ignorando acentos, caixa e espaços extras', () => {
    expect(pdfSongIdentity('  Canção  da Luz ', 'João  Silva')).toBe(pdfSongIdentity('Cancao da luz', 'joao silva'));
    expect(pdfSongIdentity('Canção', '')).toBeNull();
    expect(pdfSongIdentity('Canção', 'Outro artista')).not.toBe(pdfSongIdentity('Canção', 'João'));
  });
});
