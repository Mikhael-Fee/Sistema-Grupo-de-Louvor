import { chordMarkers, KEYS, stripChords } from './music';

export interface ParsedCifraClubText {
  content: string;
  originalKey?: string;
  soundingKey?: string;
  capo?: number;
  keyUnknownReason?: string;
}

const WRITTEN_KEY = /\bforma\s+dos?\s+acordes\s+(?:no\s+)?tom\s*(?:de\s+|:\s*)?([A-G](?:[#♯b♭])?)(?:m|min|maj)?(?=\s|$|[)])/i;
const CAPO = /\b(?:capotraste|capo)\s*(?::|=|na?|em)?\s*(\d{1,2})(?:\s*[ªºao])?(?:\s*casa)?\b/i;

function normalizedKey(value?: string): string | undefined {
  if (!value) return undefined;
  const root = value[0].toUpperCase() + value.slice(1).replace('♯', '#').replace('♭', 'b');
  const equivalent: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb', 'B#': 'C', Cb: 'B', Fb: 'E', 'E#': 'F' };
  const key = equivalent[root] || root;
  return KEYS.includes(key) ? key : undefined;
}

/** The key belongs to the written chords, which can differ from the sounding key with a capo. */
export function chordSheetMetadata(value: string): Omit<ParsedCifraClubText, 'content'> {
  let written: string | undefined;
  let sounding: string | undefined;
  let capo: number | undefined;
  for (const rawLine of value.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    written ??= normalizedKey(WRITTEN_KEY.exec(line)?.[1]);
    sounding ??= normalizedKey(/^\s*(?:tom|key|tonalidade)\s*:\s*([A-G](?:[#♯b♭])?)(?:m|min|maj)?(?=\s|$|\()/i.exec(line)?.[1]);
    const match = CAPO.exec(line);
    if (match && Number(match[1]) <= 12) capo ??= Number(match[1]);
  }
  if (written) return { originalKey: written, ...(sounding ? { soundingKey: sounding } : {}), ...(capo !== undefined ? { capo } : {}) };
  if (capo) return { ...(sounding ? { soundingKey: sounding } : {}), capo, keyUnknownReason: 'A fonte informa capotraste, mas não o tom das posições dos acordes. Confirme o tom dos acordes escritos antes de importar.' };
  return { ...(sounding ? { originalKey: sounding } : {}), ...(capo !== undefined ? { capo } : {}) };
}

interface TabEvidence { labelled: boolean; fretted: boolean }

function tabRow(line: string): TabEvidence | null {
  // Printing can substitute Unicode bars/dashes or wrap a string onto an unlabelled row.
  const normalized = line.trim().replace(/[‐‑‒–—−─━]/g, '-').replace(/[│┃¦]/g, '|');
  const labelled = /^(?:[A-Ga-g][#b♯♭]?|\d{1,2}|\[(?:[A-Ga-g][#b♯♭]?|\d{1,2})\])\s*\|/.exec(normalized);
  const body = labelled ? normalized.slice(labelled[0].length) : normalized.replace(/^\|/, '');
  if (body.length < 3 || !/^[\d\s|=\-~hHpPbBrRsStT/\\().xX*^+vV<>:↑↓]+$/.test(body)) return null;
  let separators = 0;
  let fretted = false;
  let technique = false;
  for (const character of body) {
    if (character === '-' || character === '=') separators++;
    else if (character >= '0' && character <= '9' || character === 'x' || character === 'X') fretted = true;
    else if ('hHpPbBrRsStT/\\~<>↑↓'.includes(character)) technique = true;
  }
  // "E", "A", meter numbers and isolated repetition bars are never enough evidence.
  const plausible = labelled
    ? separators >= 2 || separators >= 1 && fretted || fretted && technique && body.length >= 4
    : body.length >= 6 && separators >= 3;
  return plausible ? { labelled: Boolean(labelled), fretted } : null;
}

function tabCaption(label: string): { section?: string } | null {
  const plain = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\[\](){}:–—-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const match = /^(?:tab|tablatura|tablature)\s*(?:(?:da|do|de)\s+)?(?:(intro|introducao|solo|riff|ponte|final|instrumental)(?:\s+\d+)?)?$/.exec(plain)
    || /^(intro|introducao|solo|riff|ponte|final|instrumental)(?:\s+\d+)?\s+(?:tab|tablatura|tablature)$/.exec(plain);
  if (!match) return null;
  const names: Record<string, string> = { intro: 'Intro', introducao: 'Intro', solo: 'Solo', riff: 'Riff', ponte: 'Ponte', final: 'Final', instrumental: 'Instrumental' };
  return { ...(match[1] ? { section: names[match[1]] } : {}) };
}

function compactDiagram(line: string): boolean {
  // Six fret positions after a chord name form a guitar fingering, not an instrumental chord row.
  const tokens = line.trim().split(/\s+/);
  const header = tokens[0].replace(/[:=]$/, '').replace(/^\[([^\]]+)\]$/, '$1');
  if (normalizedChord(header) && (tokens.length === 2 && /^[xX\d]{6}$/.test(tokens[1])
    || tokens.length === 7 && tokens.slice(1).every(token => /^[xX\d]$/.test(token)))) return true;
  const joined = /^(\[[^\]\r\n]{1,84}\]|[^\s:=]{1,84})[:=]([xX\d]{6})$/.exec(line.trim());
  return Boolean(joined && normalizedChord(joined[1].replace(/^\[([^\]]+)\]$/, '$1')));
}

function gridRow(line: string): boolean {
  return /^[|│┃┌┐└┘├┤┬┴┼╭╮╰╯╞╡╪─━+\-\s○●oOxX\d]{5,}$/.test(line.trim())
    && /[│┃┌┐└┘├┤┬┴┼╭╮╰╯╞╡╪|]/.test(line);
}

/** Remove explicit guitar apparatus from raw text or saved ChordPro without changing the song. */
export function cleanChordSheet(value: string): string {
  if (value.length > 100_000) throw new Error('A letra e cifra excedem 100.000 caracteres.');
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  // A mixed heading such as "[Tab Intro] G D" still contains real instrumental chords.
  for (let index = 0; index < lines.length; index++) {
    const heading = /^\s*(\[[^\]\r\n]{1,80}\])\s*(\S.*)$/.exec(lines[index]);
    if (!heading) continue;
    const caption = tabCaption(heading[1]);
    if (caption) {
      const section = caption.section ? `[${caption.section}]` : '';
      lines[index] = tabRow(heading[2]) ? section : `${section ? `${section} ` : ''}${heading[2]}`;
    }
  }
  const tabRows = lines.map(tabRow);
  const tabCaptions = lines.map(line => tabCaption(line));
  const removed = new Set<number>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const label = line.replace(/\s+/g, ' ').trim();
    if (tabRows[index]?.labelled || tabCaptions[index] || compactDiagram(line)
      || /^(?:afina[çc][aã]o|tuning)\s*:\s*\S.*$/i.test(label)
      || /^(?:capotraste|capo)\s*(?::|=|na?|em)?\s*(?:\d{1,2}(?:\s*[ªºao])?(?:\s*casa)?|sem|none)\s*[.!]?$/i.test(label)
      || /^\(?forma\s+dos?\s+acordes\s+(?:no\s+)?tom\s*(?:de\s+|:\s*)?[A-G](?:[#♯b♭])?(?:m|min|maj)?\)?$/i.test(label)) removed.add(index);
    if (!gridRow(line)) continue;
    let end = index + 1;
    while (end < lines.length && gridRow(lines[end])) end++;
    // An isolated bar can be a musical repetition marker. A grid has several rows.
    if (end - index >= 3) for (let row = index; row < end; row++) removed.add(row);
    index = end - 1;
  }
  // Wrapped rows have no string label. Remove them only in a recognized tab block,
  // or in a group of several fret rows; an ordinary lyric separator remains intact.
  for (let index = 0; index < lines.length; index++) {
    if (!tabRows[index]) continue;
    const start = index;
    let end = index + 1;
    while (end < lines.length && (tabRows[end] || !lines[end].trim() && tabRows[end + 1])) end++;
    let previous = start - 1;
    while (previous >= 0 && start - previous <= 3 && !lines[previous].trim()) previous--;
    let labelled = false;
    let frettedRows = 0;
    let rows = 0;
    for (let row = start; row < end; row++) {
      if (!tabRows[row]) continue;
      rows++;
      labelled ||= tabRows[row]!.labelled;
      if (tabRows[row]!.fretted) frettedRows++;
    }
    if (labelled || previous >= 0 && Boolean(tabCaptions[previous]) || rows >= 3 && frettedRows >= 2) {
      for (let row = start; row < end; row++) if (tabRows[row]) removed.add(row);
    }
    index = end - 1;
  }
  // Remove guitar-only captions immediately adjoining an actual diagram/tab.
  for (let pass = 0; pass < 3; pass++) for (const index of [...removed]) {
    for (const direction of [-1, 1]) {
      let adjacent = index + direction;
      // Print layouts often separate "Parte 1 de 2" from the strings by a blank row.
      if (adjacent >= 0 && adjacent < lines.length && !lines[adjacent].trim()) adjacent += direction;
      if (adjacent < 0 || adjacent >= lines.length) continue;
      const caption = lines[adjacent].replace(/\s+/g, ' ').trim();
      if (/^(?:\[?\s*(?:tablatura|tab(?:lature)?|diagrama(?:s)?(?:\s+dos?\s+acordes)?|dedilhado)\s*\]?\s*:?|(?:[eEaAgGbBdD]\s+){5}[eEaAgGbBdD])$/i.test(caption)
        || (tabRows[index] || compactDiagram(lines[index]) || gridRow(lines[index]))
          && /^(?:\[|\()?parte \d{1,2} de \d{1,2}(?:\]|\))?:?$/i.test(caption)) removed.add(adjacent);
    }
  }
  return lines.filter((_, index) => !removed.has(index)).join('\n');
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
  return normalizedKey(/^\s*(?:tom|key|tonalidade)\s*:\s*([A-G](?:[#♯b♭])?)(?:m|min|maj)?(?=\s|$|\()/i.exec(line)?.[1]);
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

function containsMarker(line: string): boolean {
  for (const marker of chordMarkers(line)) if (marker.value) return true;
  return false;
}

function normalizeInlineMarkers(line: string): string {
  let result = '';
  let cursor = 0;
  for (const marker of chordMarkers(line)) {
    const normalized = normalizedChord(marker.value);
    if (!normalized) continue;
    result += `${line.slice(cursor, marker.start)}[${normalized}]`;
    cursor = marker.end;
  }
  return result + line.slice(cursor);
}

/** Convert user-pasted chord rows to the inline markers understood by transposition. */
export function parseCifraClubText(value: string): ParsedCifraClubText {
  if (value.length > 100_000) throw new Error('A cifra é muito longa. Cole somente a letra e os acordes, até 100.000 caracteres.');
  if (!value.trim()) throw new Error('Cole a letra e cifra que você deseja importar.');
  const normalized = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  const metadata = chordSheetMetadata(normalized);
  const lines = cleanChordSheet(normalized).split('\n').map(expandTabs);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const key = detectedKey(line);
    if (key) continue;
    const row = readChordRow(line);
    const next = lines[index + 1];
    const canAlign = row && !row.standalone && next?.trim() && !detectedKey(next)
      && !readChordRow(next) && !/^\s*\[[^\]]+\]\s*$/.test(next) && !containsMarker(next);
    if (row && canAlign) {
      output.push(alignChords(next, row));
      index++;
    } else if (row) output.push(standaloneChordLine(line, row));
    else output.push(normalizeInlineMarkers(line));
  }
  return { content: output.join('\n').trim(), ...metadata };
}
