import { stripChords } from './music';

export interface LyricsMatch {
  before: string;
  match: string;
  after: string;
}

function normalizedWithMap(text: string): { value: string; map: number[] } {
  let value = '';
  const map: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const piece = text[index].normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
    for (const char of piece) {
      value += char;
      map.push(index);
    }
  }
  return { value, map };
}

/** First lyric line containing the query (accents and chords ignored), cut around the match. */
export function findLyricsMatch(content: string, query: string, context = { before: 28, after: 42 }): LyricsMatch | null {
  const needle = normalizedWithMap(query.trim().replace(/\s+/g, ' ')).value;
  if (needle.length < 3) return null;
  for (const raw of stripChords(content).split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const { value, map } = normalizedWithMap(line);
    const at = value.indexOf(needle);
    if (at < 0) continue;
    const start = map[at];
    const end = map[at + needle.length - 1] + 1;
    const from = Math.max(0, start - context.before);
    const to = Math.min(line.length, end + context.after);
    return {
      before: `${from > 0 ? '…' : ''}${line.slice(from, start)}`,
      match: line.slice(start, end),
      after: `${line.slice(end, to)}${to < line.length ? '…' : ''}`,
    };
  }
  return null;
}
