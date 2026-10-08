import { normalizeCifraClubUrl, parseCifraClubText } from './cifraclub';
import { hasWrittenChords } from './song-tones';
import { chordSegments } from './music';
import { sourceArtist, type SongSearchResult } from './song-search';
import { ensurePdfPromiseCompatibility } from './pdf-promise-compat';

export const MAX_CIFRA_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 100_000;
const MAX_PAGES = 20;
const MAX_ITEMS = 30_000;
export interface PdfWord { text: string; x: number; y: number; width: number; height: number }
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 6; };
const isChordRow = (line: string) => line.trim().split(/\s+/).every(token => chordSegments(`[${token}]`).some(segment => segment.chord));
const boilerplate = (line: string) => /^(?:menu principal|main menu|cifra club|https?:\/\/\S+(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+|p[aá]gina\s+\d+(?:\s+de\s+\d+)?)$/i.test(line.trim())
  || /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s|$)/.test(line.trim());

/** Reconstruct spacing and print columns instead of concatenating PDF strings. */
export function pdfPageLines(words: PdfWord[], pageWidth: number): string[] {
  if (words.length > MAX_ITEMS || !Number.isFinite(pageWidth) || pageWidth < 50 || pageWidth > 5_000) throw new Error('O PDF tem um formato de página muito grande. Salve a cifra novamente em tamanho A4.');
  const items = words.filter(word => word.text.trim()).map(word => ({ ...word, text: word.text.replace(/\u00a0/g, ' ') }));
  if (items.some(item => ![item.x, item.y, item.width, item.height].every(Number.isFinite)
    || item.width < 0 || item.height < 0 || Math.abs(item.x) > pageWidth * 1.2 || item.width > pageWidth * 1.2 || item.text.length > MAX_TEXT)) throw new Error('Não foi possível interpretar o alinhamento deste PDF. Gere o arquivo pela opção Imprimir do navegador.');
  const rows: PdfWord[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = rows.at(-1);
    if (previous && Math.abs(item.y - previous[0].y) <= Math.max(2, Math.min(item.height, previous[0].height) * 0.25)) previous.push(item);
    else rows.push([item]);
  }
  const charWidth = Math.max(2, Math.min(20, median(items.filter(item => item.text.trim().length >= 3 && item.width > 0).map(item => item.width / [...item.text].length))));
  const origin = Math.min(...items.map(item => item.x), pageWidth);
  const textRow = (row: PdfWord[], left: number): string => {
    let text = ''; let end = left;
    for (const item of [...row].sort((a, b) => a.x - b.x)) {
      text += ' '.repeat(Math.min(500, Math.max(0, Math.round((item.x - end) / charWidth)))) + item.text;
      end = item.x + item.width;
    }
    return text.trimEnd();
  };
  // A sustained gutter and lyric text on both sides distinguish print
  // columns from a chord row with widely separated notes.
  let split: number | null = null;
  for (const ratio of [0.5, 0.45, 0.55, 0.4, 0.6]) {
    const cut = pageWidth * ratio;
    const body = rows.filter(row => row.some(item => item.text.trim().length > 2));
    const crossing = body.filter(row => row.some(item => item.x < cut - charWidth && item.x + item.width > cut + charWidth)).length;
    const lyrics = (right: boolean) => body.filter(row => row.some(item => (right ? item.x >= cut + charWidth : item.x + item.width <= cut - charWidth)
      && /[\p{L}]/u.test(item.text) && !isChordRow(item.text) && !boilerplate(item.text))).length;
    if (lyrics(false) >= 4 && lyrics(true) >= 4 && crossing <= Math.max(2, body.length * 0.1)) { split = cut; break; }
  }
  if (split === null) return rows.map(row => textRow(row, origin));
  const header: string[] = []; const left: string[] = []; const right: string[] = [];
  const rightOrigin = Math.min(...items.filter(item => item.x >= split!).map(item => item.x));
  for (const row of rows) {
    if (row.some(item => item.x < split! && item.x + item.width > split!)) { header.push(textRow(row, origin)); continue; }
    const a = row.filter(item => item.x < split!); const b = row.filter(item => item.x >= split!);
    if (a.length) left.push(textRow(a, origin));
    if (b.length) right.push(textRow(b, rightOrigin));
  }
  return [...header, ...left, '', ...right];
}

/** Do not infer a key from the first chord or save the received content. */
export function songFromPdfText(raw: string, metadataTitle = '', filename = ''): SongSearchResult {
  if (!raw.trim()) throw new Error('Este PDF contém uma imagem ou não tem texto selecionável. Salve a cifra pela opção Imprimir → Salvar como PDF do navegador.');
  if (raw.length > MAX_TEXT) throw new Error('O PDF excedeu o limite de 100.000 caracteres. Importe somente uma música por arquivo.');
  const links = raw.match(/https?:\/\/(?:www\.)?cifraclub\.com\.br\/[^\s<>]+/gi) || [];
  const sourceUrl = links.map(link => normalizeCifraClubUrl(link.replace(/^http:/, 'https:').replace(/[.,;)'"\]]+$/, '').replace(/\/(?:imprimir\.html|teclado)\/?$/, '/'))).find(Boolean) || '';
  let lines = raw.split('\n').map(line => line.trimEnd()).filter(line => !boilerplate(line));
  const firstChord = lines.findIndex(line => isChordRow(line) || hasWrittenChords(line));
  const candidates = lines.slice(0, firstChord < 0 ? 0 : firstChord).map(line => line.trim()).filter(line => line && !isChordRow(line)
    && !/^(?:tom|key|capotraste|capo|afina[çc][aã]o|tuning)\s*:/i.test(line)
    && !/^\[.*\]$/.test(line) && !/[|]{2}|^[eEaAgGbBdD]\s*\|/.test(line)).slice(0, 2);
  const labeled = metadataTitle.replace(/\s*[-–—|]\s*Cifra Club\s*$/i, '').trim();
  const heading = candidates[0] || '';
  const separator = heading && labeled.startsWith(`${heading} - `) ? heading.length : labeled.lastIndexOf(' - ');
  const pair = separator > 0 ? { title: labeled.slice(0, separator).trim(), artist: labeled.slice(separator + 3).trim() } : null;
  const title = (pair?.title || (heading && heading.length <= 200 ? heading : '') || filename.replace(/\.pdf$/i, '').trim()).slice(0, 200);
  const artist = sourceArtist(pair?.artist || candidates[1] || '');
  const metadataLines = new Set([title, artist].filter(Boolean));
  lines = lines.filter((line, index) => !(index < 3 && metadataLines.has(line.trim())));
  const parsed = parseCifraClubText(lines.join('\n'));
  if (!hasWrittenChords(parsed.content)) throw new Error('Não encontrei acordes neste PDF. Salve a versão com cifra pelo menu Imprimir, e não a página de somente letra.');
  return { id: crypto.randomUUID(), title, artist, source: sourceUrl ? 'Cifra Club' : 'Arquivo PDF', sourceUrl,
    kind: 'chords', content: parsed.content, originalKey: parsed.originalKey, soundingKey: parsed.soundingKey, capo: parsed.capo, keyUnknownReason: parsed.keyUnknownReason };
}

/** Read locally, one page at a time; no rendering, upload or OCR. */
export async function readCifraPdf(file: File, signal?: AbortSignal): Promise<SongSearchResult> {
  if (file.size > MAX_CIFRA_PDF_BYTES) throw new Error('O PDF deve ter até 8 MB. Salve somente a cifra de uma música.');
  if (!file.size || !(file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name)))) throw new Error('Escolha um arquivo PDF salvo pelo navegador.');
  const aborted = () => { if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError'); };
  aborted();
  if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new Error('Este arquivo não é um PDF válido. Salve a cifra novamente pelo navegador.');
  aborted();
  ensurePdfPromiseCompatibility();
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('./cifra-pdf-worker.ts?worker&url')]);
  aborted();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  aborted();
  const task = pdfjs.getDocument({ data, stopAtErrors: true,
    useWasm: false, disableFontFace: true, useSystemFonts: true, maxImageSize: 1_000_000 });
  const cancel = () => { void task.destroy(); };
  signal?.addEventListener('abort', cancel, { once: true });
  let deadlineReached = false;
  const deadline = setTimeout(() => { deadlineReached = true; void task.destroy(); }, 25_000);
  try {
    const document = await task.promise;
    aborted();
    if (document.numPages > MAX_PAGES) throw new Error('O PDF deve ter até 20 páginas. Importe somente uma música por arquivo.');
    const metadata = await document.getMetadata();
    const title = typeof (metadata.info as Record<string, unknown>)?.Title === 'string' ? (metadata.info as { Title: string }).Title : '';
    const pages: string[] = []; let totalItems = 0; let totalText = 0;
    for (let number = 1; number <= document.numPages; number++) {
      aborted();
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const words: PdfWord[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        words.push({ text: item.str, x, y, width: item.width, height: item.height }); totalText += item.str.length;
      }
      totalItems += words.length;
      if (totalItems > MAX_ITEMS || totalText > MAX_TEXT) throw new Error('Este PDF excedeu o limite de leitura. Salve somente a cifra de uma música.');
      pages.push(pdfPageLines(words, viewport.width).join('\n'));
      page.cleanup();
    }
    aborted();
    return songFromPdfText(pages.join('\n\n'), title, file.name);
  } catch (cause) {
    aborted();
    if (deadlineReached) throw new Error('A leitura demorou demais. Salve somente a cifra de uma música e tente novamente.');
    if (cause instanceof Error && /password/i.test(cause.name + cause.message)) throw new Error('Este PDF tem senha. Use o arquivo gerado por Imprimir → Salvar como PDF.');
    if (cause instanceof Error && /fake worker|worker.*(?:failed|error)|WorkerMessageHandler/i.test(cause.message)) throw new Error('Este navegador não conseguiu iniciar a leitura do PDF. Tente abrir o Candeia no Chrome ou Safari atualizado.');
    throw cause instanceof Error ? cause : new Error('Não foi possível ler este PDF. Salve a cifra novamente pelo navegador.');
  } finally {
    clearTimeout(deadline); signal?.removeEventListener('abort', cancel); await task.destroy();
  }
}
