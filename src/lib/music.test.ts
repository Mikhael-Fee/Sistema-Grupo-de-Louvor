import { describe, expect, it } from 'vitest';
import { chordSegments, KEYS, normalizeSearch, stripChords, transposeContent } from './music';

describe('musical chord notation', () => {
  it('transposes root, extensions and slash bass while preserving Portuguese text and line endings', () => {
    const content = '[C]Graça, paz!\r\n[G/B]Coração [Am7]em [F#m7(b5)]Ti\n[C7(9)]Sim.';
    expect(transposeContent(content, 'C', 'D')).toBe('[D]Graça, paz!\r\n[A/C#]Coração [Bm7]em [G#m7(b5)]Ti\n[D7(9)]Sim.');
  });

  it('uses flat spelling for flat target keys, including inverted bass notes', () => {
    expect(transposeContent('[A]Um [C#m7/G#]novo [Dadd9]dia [E]virá', 'A', 'Bb'))
      .toBe('[Bb]Um [Dm7/A]novo [Ebadd9]dia [F]virá');
    expect(transposeContent('[Bbmaj7/D]Paz [Ebsus4]em [F7]Ti', 'Bb', 'C'))
      .toBe('[Cmaj7/E]Paz [Fsus4]em [G7]Ti');
  });

  it('keeps extended chord qualities unchanged, including numeric slash extensions', () => {
    expect(transposeContent('[C6/9/E]a [Cm(maj7)]b [C7(b9,#11)]c [CmMaj7]d', 'C', 'D'))
      .toBe('[D6/9/F#]a [Dm(maj7)]b [D7(b9,#11)]c [DmMaj7]d');
  });

  it('wraps around twelve semitones and accepts enharmonic source keys', () => {
    expect(transposeContent('[C]a [B]b [F]c', 'C', 'B')).toBe('[B]a [A#]b [E]c');
    expect(transposeContent('[Gb]a [Db/F]b', 'Gb', 'G')).toBe('[G]a [D/F#]b');
    expect(new Set(KEYS).size).toBe(12);
  });

  it('does not reinterpret section labels, invalid chord text, or unbracketed lyrics', () => {
    const content = '[Refrão]\n[Amanhã] Coração [C errado] em [H7]Ti [C]sempre\n[Bridge] A B C';
    expect(transposeContent(content, 'C', 'D')).toBe('[Refrão]\n[Amanhã] Coração [C errado] em [H7]Ti [D]sempre\n[Bridge] A B C');
    expect(stripChords(content)).toBe('[Refrão]\n[Amanhã] Coração [C errado] em [H7]Ti sempre\n[Bridge] A B C');
  });

  it('returns source verbatim for unchanged, enharmonically equivalent, or unsupported keys', () => {
    const content = '[Db]Já [F#]está aqui.';
    expect(transposeContent(content, 'Db', 'Db')).toBe(content);
    expect(transposeContent(content, 'Db', 'C#')).toBe(content);
    expect(transposeContent(content, 'invalid', 'D')).toBe(content);
    expect(transposeContent(content, 'D', 'invalid')).toBe(content);
  });

  it('aligns each chord above its following text, including initial text and consecutive chords', () => {
    expect(chordSegments('Intro [C]Tua [G/B]paz [Am7][F]vem')).toEqual([
      { chord: '', text: 'Intro ' }, { chord: 'C', text: 'Tua ' },
      { chord: 'G/B', text: 'paz ' }, { chord: 'Am7', text: '' }, { chord: 'F', text: 'vem' },
    ]);
    expect(chordSegments('[Refrão] [C]Paz [não é acorde] agora')).toEqual([
      { chord: '', text: '[Refrão] ' }, { chord: 'C', text: 'Paz [não é acorde] agora' },
    ]);
    expect(chordSegments('')).toEqual([{ chord: '', text: '' }]);
  });

  it('normalizes accents and case for search while retaining the original title', () => {
    const title = '  Nossa CANÇÃO de Gratidão  ';
    expect(normalizeSearch(title)).toBe('nossa cancao de gratidao');
    expect(normalizeSearch(title).includes(normalizeSearch('Canção'))).toBe(true);
    expect(title).toBe('  Nossa CANÇÃO de Gratidão  ');
  });
});
