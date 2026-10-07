import { KEYS, stripChords } from './music';

export interface ParsedCifraClubText {
  content: string;
  originalKey?: string;
}

/** Links are references only: importing never requests or proxies the source page. */
export function normalizeCifraClubUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !['cifraclub.com.br', 'www.cifraclub.com.br'].includes(url.hostname)
      || url.username || url.password || url.port || !/^\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*\/?$/i.test(url.pathname)) return null;
    return `https://www.cifraclub.com.br${url.pathname.replace(/\/$/, '')}/`;
  } catch { return null; }
}

export function buildCifraClubSearchUrl(title: string, artist: string): string {
  const query = [title.trim(), artist.trim()].filter(Boolean).join(' ');
  return `https://www.cifraclub.com.br/?${new URLSearchParams({ q: query })}`;
}

function normalizedChord(value: string): string | null {
  const normalized = value.replace(/♯/g, '#').replace(/♭/g, 'b');
  return stripChords(`[${normalized}]`) === '' ? normalized : null;
}

function detectedKey(line: string): string | undefined {
  const value = /^\s*(?:tom|key|tonalidade)\s*:\s*([A-G](?:[#♯b♭])?)(?:m|min|maj)?(?=\s|$|\()/i.exec(line)?.[1];
  if (!value) return undefined;
  const root = value[0].toUpperCase() + value.slice(1).replace('♯', '#').replace('♭', 'b');
  const equivalent: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb', 'B#': 'C', Cb: 'B', Fb: 'E', 'E#': 'F' };
  const key = equivalent[root] || root;
  return KEYS.includes(key) ? key : undefined;
}

/** Match visual tab stops used by the plain text copied from a chord sheet. */
function expandTabs(line: string): string {
  let result = '';
  let column = 0;
  for (const character of line) {
    const value = character === '\t' ? ' '.repeat(8 - column % 8) : character;
    result += value;
    column += value.length;
  }
  return result;
}

interface ChordRow {
  chords: { position: number; end: number; chord: string }[];
  standalone: boolean;
}

function readChordRow(line: string): ChordRow | null {
  let remainder = line;
  let offset = 0;
  let standalone = false;
  const label = /^\s*(\[[^\]\r\n]+\])\s*/.exec(line);
  if (label && stripChords(label[1]) !== '') {
    offset = label[0].length;
    remainder = line.slice(offset);
    standalone = true;
  }
  const chords: ChordRow['chords'] = [];
  for (const token of remainder.matchAll(/\S+/g)) {
    const chord = normalizedChord(token[0]);
    if (chord) {
      const position = offset + token.index!;
      chords.push({ position, end: position + token[0].length, chord });
    } else if (/^(?:[|:()]+|\(?\d+x\)?|\(?x\d+\)?)$/i.test(token[0])) {
      standalone = true;
    } else return null;
  }
  return chords.length ? { chords, standalone } : null;
}

function standaloneChordLine(line: string, row: ChordRow): string {
  let result = '';
  let cursor = 0;
  for (const chord of row.chords) {
    result += `${line.slice(cursor, chord.position)}[${chord.chord}]`;
    cursor = chord.end;
  }
  return result + line.slice(cursor);
}

function alignChords(lyrics: string, row: ChordRow): string {
  const characters = Array.from(lyrics);
  let result = '';
  let cursor = 0;
  for (const chord of row.chords) {
    result += characters.slice(cursor, chord.position).join('');
    if (chord.position > characters.length) result += ' '.repeat(chord.position - Math.max(cursor, characters.length));
    result += `[${chord.chord}]`;
    cursor = chord.position;
  }
  return result + characters.slice(cursor).join('');
}

/** Convert user-pasted chord rows to the inline markers understood by transposition. */
export function parseCifraClubText(value: string): ParsedCifraClubText {
  if (value.length > 100_000) throw new Error('A cifra é muito longa. Cole somente a letra e os acordes, até 100.000 caracteres.');
  if (!value.trim()) throw new Error('Cole a letra e cifra que você deseja importar.');
  const lines = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n').map(expandTabs);
  const output: string[] = [];
  let originalKey: string | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const key = detectedKey(line);
    if (key) { originalKey ??= key; continue; }
    const row = readChordRow(line);
    const next = lines[index + 1];
    const canAlign = row && !row.standalone && next?.trim() && !detectedKey(next)
      && !readChordRow(next) && !/^\s*\[[^\]]+\]\s*$/.test(next) && !/\[[^\]\r\n]+\]/.test(next);
    if (row && canAlign) {
      output.push(alignChords(next, row));
      index++;
    } else if (row) output.push(standaloneChordLine(line, row));
    else output.push(line.replace(/\[([^\]\r\n]+)\]/g, (marker, chord: string) => {
      const normalized = normalizedChord(chord);
      return normalized ? `[${normalized}]` : marker;
    }));
  }
  return { content: output.join('\n').trim(), ...(originalKey ? { originalKey } : {}) };
}
