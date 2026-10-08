import { cleanChordSheet } from './cifraclub';
import { chordSegments, KEYS, transposeContent } from './music';
import { sourceKey, type SongSearchResult } from './song-search';
import { estimateSongKey } from './key-estimate';
import type { Song } from '../types';

export function hasWrittenChords(content: string): boolean {
  return chordSegments(content).some(segment => Boolean(segment.chord));
}

export interface SourceTonality {
  source: SongSearchResult;
  writtenKey: string | null;
  churchKey: string | null;
  estimated: boolean;
  requiresKeyConfirmation: boolean;
}

/** Import defaults follow the written chords: sounding Bb with capo 3 is G.
 * Explicit shape metadata already accounts for the capo and must not shift twice.
 * Harmonic estimates are marked probable; ambiguous estimates need confirmation.
 */
export function resolveSourceTonality(input: SongSearchResult): SourceTonality {
  const written = !input.keyEstimate ? sourceKey(input.originalKey) : null;
  const sounding = sourceKey(input.soundingKey);
  const capo = Number.isInteger(input.capo) && input.capo! >= 0 && input.capo! <= 12 ? input.capo! : 0;
  const conflict = /conflit|diferentes|contradit/i.test(input.keyUnknownReason || '');
  if (written && !conflict) return { source: { ...input, originalKey: written, keyEstimate: undefined }, writtenKey: written,
    churchKey: written, estimated: false, requiresKeyConfirmation: false };
  if (sounding && !conflict) {
    const key = KEYS[(KEYS.indexOf(sounding) - capo + 12) % 12];
    return { source: { ...input, originalKey: key, keyUnknownReason: undefined, keyEstimate: undefined }, writtenKey: key,
      churchKey: key, estimated: false, requiresKeyConfirmation: false };
  }
  const cleaned = cleanChordSheet(input.content || '');
  const chords = input.kind === 'chords' && hasWrittenChords(cleaned);
  const estimate = chords ? estimateSongKey(cleaned) : null;
  const usable = Boolean(estimate && estimate.confidence !== 'low' && !conflict);
  return { source: { ...input, originalKey: usable ? estimate!.key : undefined, keyEstimate: estimate || undefined,
    keyUnknownReason: usable ? undefined : input.keyUnknownReason }, writtenKey: estimate?.key || null,
    churchKey: estimate?.key || null, estimated: Boolean(estimate), requiresKeyConfirmation: Boolean(chords && !usable) };
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
