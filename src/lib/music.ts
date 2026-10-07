/** The twelve keys offered by the ministry's song and service editors. */
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_VALUES: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Consume suffixes once. Repeating a numeric regex inside another repetition
// makes malformed pasted chords (for example C111…x) block the browser.
const QUALITIES = ['maj', 'Maj', 'min', 'Min', 'dim', 'Dim', 'aug', 'Aug', 'sus', 'Sus', 'add', 'Add', 'omit', 'no', 'm', 'M', 'Δ', '°', 'ø'];
const PAREN_QUALITIES = ['maj', 'Maj', 'min', 'm', 'M'];

function validSuffix(value: string): boolean {
  let cursor = 0;
  const digits = () => {
    const start = cursor;
    while (cursor < value.length && value[cursor] >= '0' && value[cursor] <= '9') cursor++;
    return cursor > start;
  };
  const quality = (names: string[]) => {
    const name = names.find(item => value.startsWith(item, cursor));
    if (!name) return false;
    cursor += name.length;
    return true;
  };
  const signedNumber = () => {
    if (['#', 'b', '+', '-'].includes(value[cursor])) cursor++;
    return digits();
  };
  while (cursor < value.length) {
    const token = value[cursor];
    if (token === '(') {
      cursor++;
      quality(PAREN_QUALITIES);
      if (!signedNumber()) return false;
      while (value[cursor] === ',' || value[cursor] === '/') {
        cursor++;
        if (!signedNumber()) return false;
      }
      if (value[cursor++] !== ')') return false;
    } else if (token === '/') {
      cursor++;
      if (!digits()) return false;
    } else if (quality(QUALITIES)) digits();
    else if (token === '+' || token === '-') { cursor++; digits(); }
    else if (!signedNumber()) return false;
  }
  return true;
}

interface Chord { root: string; suffix: string; bass?: string }

/** Scan each character once, even when pasted text contains unclosed markers. */
export function* chordMarkers(content: string) {
  let start = -1;
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (character === '[' && start < 0) start = index;
    else if (character === '\r' || character === '\n') start = -1;
    else if (character === ']' && start >= 0) {
      yield { start, end: index + 1, value: content.slice(start + 1, index) };
      start = -1;
    }
  }
}

function parseChord(value: string): Chord | null {
  const match = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(value);
  if (!match || !validSuffix(match[2])) return null;
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
  let result = '';
  let cursor = 0;
  for (const marker of chordMarkers(content)) {
    const chord = parseChord(marker.value);
    if (!chord) continue;
    const bass = chord.bass ? `/${transposeNote(chord.bass)}` : '';
    result += `${content.slice(cursor, marker.start)}[${transposeNote(chord.root)}${chord.suffix}${bass}]`;
    cursor = marker.end;
  }
  return result + content.slice(cursor);
}

/** Remove musical chord markers without removing section labels such as [Refrão]. */
export function stripChords(content: string): string {
  let result = '';
  let cursor = 0;
  for (const marker of chordMarkers(content)) {
    if (!parseChord(marker.value)) continue;
    result += content.slice(cursor, marker.start);
    cursor = marker.end;
  }
  return result + content.slice(cursor);
}

/** Each chord belongs above the text following it; the leading text has no chord. */
export function chordSegments(line: string): { chord: string; text: string }[] {
  const segments = [{ chord: '', text: '' }];
  let cursor = 0;
  for (const marker of chordMarkers(line)) {
    if (!parseChord(marker.value)) continue;
    segments[segments.length - 1].text += line.slice(cursor, marker.start);
    segments.push({ chord: marker.value, text: '' });
    cursor = marker.end;
  }
  segments[segments.length - 1].text += line.slice(cursor);
  return segments;
}

/** Portuguese-friendly search, without changing the displayed source text. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
