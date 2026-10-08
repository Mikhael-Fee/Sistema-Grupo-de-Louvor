import { describe, expect, it } from 'vitest';
import { estimateSongKey } from './key-estimate';

describe('conservative harmonic key estimates', () => {
  it('recognizes IV-V-I in D without mistaking its opening G for the tonic', () => {
    expect(estimateSongKey('[G] [A] [D]')).toMatchObject({ key: 'D', mode: 'major', confidence: 'high', borrowedChords: [] });
  });

  it('keeps D as the likely field when C appears outside G-A-D-Bm', () => {
    expect(estimateSongKey('[G] [A] [D] [Bm] [C]')).toMatchObject({ key: 'D', mode: 'major', confidence: 'medium', borrowedChords: ['C'] });
    expect(estimateSongKey('[G] [A] [D] [Bm] [C]')?.confidence).not.toBe('high');
  });

  it('recognizes a harmonic-minor dominant as evidence for minor, not borrowing', () => {
    expect(estimateSongKey('[Am] [Dm] [E7] [Am]')).toMatchObject({ key: 'A', mode: 'minor', confidence: 'high', borrowedChords: [] });
  });

  it('does not claim certainty between C major and its relative A minor', () => {
    const estimate = estimateSongKey('[C] [G] [Am] [F]');
    expect(estimate).toMatchObject({ key: 'C', mode: 'major', confidence: 'low' });
    expect(estimate?.alternatives).toContainEqual({ key: 'A', mode: 'minor' });
  });

  it('treats a slash bass as an inversion and preserves chord extensions', () => {
    expect(estimateSongKey('[G/B] [A7/C#] [Dmaj7/F#] [Bm7] [G/B] [A7] [Dmaj7]'))
      .toMatchObject({ key: 'D', mode: 'major', confidence: 'high', borrowedChords: [] });
  });

  it('recognizes Cifra Club 7M notation as a major seventh', () => {
    expect(estimateSongKey('[G7M] [A7] [D7M] [Bm7] [G7M] [A7] [D7M]'))
      .toMatchObject({ key: 'D', mode: 'major', confidence: 'high', borrowedChords: [] });
  });

  it('normalizes enharmonic roots to the keys supported by the application', () => {
    expect(estimateSongKey('[Gb] [Ab] [Db]')).toMatchObject({ key: 'Db', mode: 'major', confidence: 'high' });
    expect(estimateSongKey('[F#] [G#] [C#]')).toMatchObject({ key: 'Db', mode: 'major', confidence: 'high' });
  });

  it('needs useful harmonic evidence instead of guessing from one repeated chord', () => {
    const estimate = estimateSongKey('[G]'.repeat(100));
    expect(estimate?.confidence).toBe('low');
    expect(estimate?.alternatives.length).toBeGreaterThan(0);
  });

  it('keeps suspended and power-chord progressions uncertain', () => {
    expect(estimateSongKey('[Gsus4] [Asus4] [Dsus2]')?.confidence).toBe('low');
    expect(estimateSongKey('[G5] [A5] [D5]')?.confidence).toBe('low');
  });

  it('returns no estimate for lyrics, section labels or invalid chord markers', () => {
    expect(estimateSongKey('Uma canção em G e A\n[Intro]\n[Refrão]\n[H7] [C errado]')).toBeNull();
    expect(estimateSongKey('')).toBeNull();
  });

  it('does not let copying one opening chord hundreds of times dominate a cadence', () => {
    expect(estimateSongKey(`${'[G]'.repeat(200)} [A] [D]`)).toMatchObject({ key: 'D', mode: 'major' });
  });

  it('marks a tonic dominant seventh as outside the major field without asserting its cause', () => {
    expect(estimateSongKey('[F] [G7] [C] [F] [G7] [C7]'))
      .toMatchObject({ key: 'C', mode: 'major', borrowedChords: ['C7'] });
  });

  it('handles inline ChordPro lyrics and ignores malformed long markers within the input limit', () => {
    expect(estimateSongKey(`[C${'1'.repeat(45_000)}x] texto [G]paz [A]e [D]luz`))
      .toMatchObject({ key: 'D', mode: 'major' });
    expect(estimateSongKey('['.repeat(90_000))).toBeNull();
    expect(estimateSongKey('[C]'.repeat(33_334))).toBeNull();
  });
});
