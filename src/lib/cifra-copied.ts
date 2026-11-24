import { isChordLine, normalizeCifraClubUrl, parseCifraClubText } from './cifraclub';
import { hasWrittenChords } from './song-tones';
import type { SongSearchResult } from './song-search';

const MAX_COPIED_TEXT = 200_000;
const METADATA_WINDOW = 15;
const METADATA = /^(?:tom|key|tonalidade|capotraste|capo|afina[çc][aã]o|tuning)\s*[:=]?\s*\S|forma\s+dos?\s+acordes/i;
const SECTION = /^\s*\[[^\]\r\n]{1,40}\]/;

/**
 * Keep only the chord sheet from text copied out of a whole web page
 * ("Selecionar tudo" on the phone): menus, buttons, comments and related
 * songs around it are dropped. Text that is already only a chord sheet keeps
 * its chords, lyrics and section labels.
 */
export function extractChordSheet(raw: string): string {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map(line => line.trimEnd());
  const chordRows = lines.flatMap((line, index) => line.trim() && isChordLine(line) ? [index] : []);
  if (chordRows.length < 2) return lines.join('\n');
  const first = chordRows[0];
  let start = first;
  // A section label such as [Intro] or [Primeira Parte] right before the first chords belongs to the song.
  while (start > 0 && (SECTION.test(lines[start - 1]) || !lines[start - 1].trim() && start - 1 > 0 && SECTION.test(lines[start - 2]))) start--;
  // Key, capo and tuning stay so the key is read from the source, but page controls between them are dropped.
  const metadata = lines.slice(Math.max(0, start - METADATA_WINDOW), start).filter(line => METADATA.test(line.trim()) && line.trim().length <= 120);
  let end = chordRows[chordRows.length - 1];
  // Lyrics sung under the last chords end at the first blank line.
  while (end + 1 < lines.length && lines[end + 1].trim()) end++;
  return [...metadata, ...(metadata.length ? [''] : []), ...lines.slice(start, end + 1)].join('\n').trim();
}

/** Turn text the user copied in their own browser into a reviewable preview; nothing is saved. */
export function songFromCopiedText(raw: string): SongSearchResult {
  if (!raw.trim()) throw new Error('A área de transferência está vazia. Copie a cifra no Cifra Club e tente novamente.');
  if (raw.length > MAX_COPIED_TEXT) throw new Error('O texto copiado é muito longo. Copie somente a página de uma música.');
  const links = raw.match(/https?:\/\/(?:www\.)?cifraclub\.com\.br\/[^\s<>#]+/gi) || [];
  const sourceUrl = links.map(link => normalizeCifraClubUrl(link.replace(/^http:/, 'https:').replace(/[.,;)'"\]]+$/, '').replace(/\/(?:imprimir\.html|teclado)\/?$/, '/'))).find(Boolean) || '';
  const parsed = parseCifraClubText(extractChordSheet(raw));
  if (!hasWrittenChords(parsed.content)) throw new Error('Não encontrei acordes no texto copiado. Abra a versão com cifra (não a de somente letra), copie e tente novamente.');
  return { id: crypto.randomUUID(), title: '', artist: '', source: 'Cifra Club', sourceUrl, kind: 'chords',
    content: parsed.content, originalKey: parsed.originalKey, soundingKey: parsed.soundingKey, capo: parsed.capo, keyUnknownReason: parsed.keyUnknownReason };
}
