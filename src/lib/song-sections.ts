import { chordMarkers } from './music';

// Words that name a part of a song when written alone on a line ("Refrão", "Ponte:", "VERSO 2").
const SECTION_WORDS = /^(intro(dução)?|verso|estrofe|parte|primeira parte|segunda parte|terceira parte|pré[- ]?refrão|refrão|coro|ponte|interlúdio|instrumental|solo|final|tag|outro|chorus|verse|bridge|pre[- ]?chorus)(\s+\d+|\s+[ivx]+)?\s*:?$/i;
const BRACKET_LABEL = /^[\p{L}][\p{L}\d\s'ºª.()/-]{0,40}$/u;
const CHORD = /^[A-G](#|b)?[^\s]*$/;

/** A section heading at the start of a line, and what follows it on the same line. */
export function sectionLabel(line: string): { label: string; rest: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const first = chordMarkers(trimmed).next().value;
  if (first && first.start === 0) {
    const label = first.value.trim();
    if (!BRACKET_LABEL.test(label) || CHORD.test(label)) return null;
    return { label: label.replace(/:$/, ''), rest: trimmed.slice(first.end).trim() };
  }
  if (SECTION_WORDS.test(trimmed)) return { label: trimmed.replace(/:$/, '').trim(), rest: '' };
  return null;
}
