/** The twelve keys offered by the ministry's song and service editors. */
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_VALUES: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Recognize conventional chord suffixes, leaving arbitrary bracketed text alone.
const SUFFIX = /^(?:(?:maj|Maj|min|Min|dim|Dim|aug|Aug|sus|Sus|add|Add|omit|no|m|M|Δ|°|ø)(?:\d+)?|[#b+-]?\d+|[+-]|\/\d+|\((?:maj|Maj|min|m|M)?[#b+-]?\d+(?:[,/][#b+-]?\d+)*\))*$/;

interface Chord { root: string; suffix: string; bass?: string }

function parseChord(value: string): Chord | null {
  const match = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(value);
  if (!match || !SUFFIX.test(match[2])) return null;
  return { root: match[1], suffix: match[2], bass: match[3] };
}

/** Transpose only valid [chords], retaining every other character verbatim. */
export function transposeContent(content: string, fromKey: string, toKey: string): string {
  const from = NOTE_VALUES[fromKey];
  const to = NOTE_VALUES[toKey];
  if (from === undefined || to === undefined || from === to) return content;
  const offset = (to - from + 12) % 12;
  const notes = toKey.includes('b') || toKey === 'F' ? FLAT_NOTES : SHARP_NOTES;
  const transposeNote = (note: string) => notes[(NOTE_VALUES[note] + offset) % 12];
  return content.replace(/\[([^\]\r\n]*)\]/g, (original, value: string) => {
    const chord = parseChord(value);
    if (!chord) return original;
    const bass = chord.bass ? `/${transposeNote(chord.bass)}` : '';
    return `[${transposeNote(chord.root)}${chord.suffix}${bass}]`;
  });
}

/** Remove musical chord markers without removing section labels such as [Refrão]. */
export function stripChords(content: string): string {
  return content.replace(/\[([^\]\r\n]*)\]/g, (original, value: string) => parseChord(value) ? '' : original);
}

/** Each chord belongs above the text following it; the leading text has no chord. */
export function chordSegments(line: string): { chord: string; text: string }[] {
  const segments = [{ chord: '', text: '' }];
  const markers = /\[([^\]\r\n]*)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = markers.exec(line))) {
    if (!parseChord(match[1])) continue;
    segments[segments.length - 1].text += line.slice(cursor, match.index);
    segments.push({ chord: match[1], text: '' });
    cursor = markers.lastIndex;
  }
  segments[segments.length - 1].text += line.slice(cursor);
  return segments;
}

/** Portuguese-friendly search, without changing the displayed source text. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
