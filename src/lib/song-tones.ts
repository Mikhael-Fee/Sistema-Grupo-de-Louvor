import { cleanChordSheet } from './cifraclub';
import { chordSegments, KEYS, transposeContent } from './music';
import type { Song } from '../types';

export function hasWrittenChords(content: string): boolean {
  return chordSegments(content).some(segment => Boolean(segment.chord));
}

/** Convert the written chords directly to the target key, without adding a capo twice. */
export function contentInChurchKey(content: string, writtenKey: string | undefined, churchKey: string): string {
  if (content.length > 100_000) throw new Error('A letra e cifra excedem 100.000 caracteres.');
  if (!KEYS.includes(churchKey)) throw new Error('Escolha um tom válido para a igreja.');
  const cleaned = cleanChordSheet(content);
  if (hasWrittenChords(cleaned) && (!writtenKey || !KEYS.includes(writtenKey))) {
    throw new Error('Confirme o tom dos acordes recebidos para importar a cifra corretamente.');
  }
  return writtenKey ? transposeContent(cleaned, writtenKey, churchKey) : cleaned;
}

/** originalKey remains an internal base key for legacy records and public transposition. */
export function songInChurchKey(song: Song, churchKey = song.churchKey): Song {
  return { ...song, churchKey, originalKey: churchKey,
    content: contentInChurchKey(song.content, song.originalKey, churchKey) };
}
