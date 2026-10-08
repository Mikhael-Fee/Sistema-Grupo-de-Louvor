import { normalizeSearch } from './music';

export const MAX_BATCH_PDFS = 20;
export const MAX_BATCH_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_BATCH_TOTAL_BYTES = 80 * 1024 * 1024;

/** Refuse the selection before loading any PDF into memory. Individual failures
 * remain per-file so an oversized or broken file does not hide valid songs. */
export function validatePdfBatchSelection(files: Pick<File, 'size'>[], existingCount = 0, existingBytes = 0): string | null {
  if (existingCount + files.length > MAX_BATCH_PDFS) return 'Selecione até 20 PDFs por importação.';
  if (files.some(file => !Number.isSafeInteger(file.size) || file.size < 0)
    || files.reduce((sum, file) => sum + file.size, existingBytes) > MAX_BATCH_TOTAL_BYTES) {
    return 'A seleção deve ter até 80 MB no total. Divida os PDFs em grupos menores.';
  }
  return null;
}

/** Both fields must be present: an unknown artist must not match an unrelated
 * song merely because it has the same title. */
export function pdfSongIdentity(title: string, artist: string): string | null {
  const name = normalizeSearch(title).replace(/\s+/g, ' ').trim();
  const author = normalizeSearch(artist).replace(/\s+/g, ' ').trim();
  return name && author ? `${name}\n${author}` : null;
}
