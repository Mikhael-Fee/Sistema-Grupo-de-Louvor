import { chordSegments, KEYS } from './music';

export type SongKeyMode = 'major' | 'minor';

/** A harmonic suggestion, never a replacement for the key printed by the source. */
export interface SongKeyEstimate {
  key: string;
  mode: SongKeyMode;
  confidence: 'high' | 'medium' | 'low';
  /** These chords fall outside this candidate's field; borrowing is one possible explanation. */
  borrowedChords: string[];
  alternatives: Array<{ key: string; mode: SongKeyMode }>;
}

type Quality = 'major' | 'minor' | 'diminished' | 'suspended' | 'uncertain';
interface ChordEvidence {
  root: number;
  quality: Quality;
  seventh?: number;
  reliability: number;
  signature: string;
  written: string;
}
interface Candidate {
  root: number;
  mode: SongKeyMode;
  score: number;
  coverage: number;
  tonic: boolean;
  borrowedChords: string[];
}

const NOTES: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const MAJOR_TRIADS: Partial<Record<number, Quality>> = {
  0: 'major', 2: 'minor', 4: 'minor', 5: 'major', 7: 'major', 9: 'minor', 11: 'diminished',
};
const MINOR_TRIADS: Partial<Record<number, Quality>> = {
  0: 'minor', 2: 'diminished', 3: 'major', 5: 'minor', 7: 'minor', 8: 'major', 10: 'major',
};
const MAJOR_NOTES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR_NOTES = new Set([0, 2, 3, 5, 7, 8, 10]);

/** Called only for markers already validated by the bounded chord parser. */
function chordEvidence(written: string): ChordEvidence | null {
  // Overlong suffixes can be syntactically valid, but do not provide useful harmonic evidence.
  if (written.length > 48) return null;
  const rootName = /^([A-G](?:#|b)?)/.exec(written)?.[1];
  if (!rootName || NOTES[rootName] === undefined) return null;
  const suffix = written.slice(rootName.length).replace(/\/[A-G](?:#|b)?$/, '');
  let quality: Quality = 'major';
  if (/^(?:dim|Dim|°|ø)/.test(suffix) || /^m7(?:\(b5\)|b5)/.test(suffix)) quality = 'diminished';
  else if (/^(?:m(?!aj)|min|Min)/.test(suffix)) quality = 'minor';
  else if (/(?:sus|Sus)/.test(suffix)) quality = 'suspended';
  else if (/^(?:aug|Aug|\+|5)/.test(suffix) || /(?:omit|no)/.test(suffix)) quality = 'uncertain';

  let seventh: number | undefined;
  if (/(?:maj|Maj|M|Δ)7|7M/.test(suffix)) seventh = 11;
  else if (/7|^(?:m|M|maj|Maj|min|Min)?(?:9|11|13)/.test(suffix)) seventh = /^dim7|^Dim7|^°7/.test(suffix) ? 9 : 10;
  const reliability = quality === 'suspended' || quality === 'uncertain' ? 0.45
    : /[#b][0-9]/.test(suffix) && quality !== 'diminished' ? 0.7 : 1;
  const root = NOTES[rootName];
  return { root, quality, seventh, reliability, signature: `${root}:${quality}:${seventh ?? ''}`,
    written };
}

function tonicMatches(chord: ChordEvidence, root: number, mode: SongKeyMode): boolean {
  return chord.root === root && chord.quality === (mode === 'major' ? 'major' : 'minor');
}

function candidateFit(chord: ChordEvidence, root: number, mode: SongKeyMode) {
  const degree = (chord.root - root + 12) % 12;
  const triads = mode === 'major' ? MAJOR_TRIADS : MINOR_TRIADS;
  // A minor song commonly uses V major/V7 and vii° from harmonic minor.
  const harmonicMinor = mode === 'minor'
    && ((degree === 7 && chord.quality === 'major') || (degree === 11 && chord.quality === 'diminished'));
  const expected = triads[degree];
  const uncertain = chord.quality === 'suspended' || chord.quality === 'uncertain';
  const qualityFits = expected === chord.quality || harmonicMinor;
  const rootFits = expected !== undefined || harmonicMinor;
  let fit = qualityFits ? 1 : uncertain && rootFits ? 0.65 : rootFits ? -0.65 : -1.35;
  let outside = !qualityFits && !uncertain;
  if (uncertain && !rootFits) outside = true;
  if (chord.seventh !== undefined && rootFits) {
    const seventhDegree = (degree + chord.seventh) % 12;
    const scale = mode === 'major' ? MAJOR_NOTES : MINOR_NOTES;
    const fitsSeventh = scale.has(seventhDegree) || (harmonicMinor && seventhDegree === 11);
    if (!fitsSeventh) { fit -= 0.2; outside = true; }
  }
  return { fit, outside, qualityFits };
}

/**
 * Compare all twelve major/minor fields using chord quality, bounded frequency
 * and harmonic resolutions. Slash bass is an inversion, not a second chord.
 * Ambiguous relative keys remain explicit alternatives and require review.
 */
export function estimateSongKey(content: string): SongKeyEstimate | null {
  if (!content || content.length > 100_000) return null;
  const sequence = chordSegments(content).flatMap(segment => {
    const evidence = segment.chord ? chordEvidence(segment.chord) : null;
    return evidence ? [evidence] : [];
  });
  if (!sequence.length) return null;
  const groups = new Map<string, { chord: ChordEvidence; count: number }>();
  for (const chord of sequence) {
    const previous = groups.get(chord.signature);
    if (previous) previous.count++;
    else groups.set(chord.signature, { chord, count: 1 });
  }
  const distinctRoots = new Set(sequence.map(chord => chord.root)).size;
  const totalWeight = [...groups.values()].reduce((total, group) => total + Math.sqrt(Math.min(group.count, 16)) * group.chord.reliability, 0);
  const candidates: Candidate[] = [];
  for (let root = 0; root < 12; root++) for (const mode of ['major', 'minor'] as const) {
    let score = 0;
    let fittingWeight = 0;
    const borrowedChords: string[] = [];
    for (const { chord, count } of groups.values()) {
      const weight = Math.sqrt(Math.min(count, 16)) * chord.reliability;
      const fit = candidateFit(chord, root, mode);
      score += fit.fit * weight;
      if (fit.qualityFits) fittingWeight += weight;
      if (fit.outside && borrowedChords.length < 12) borrowedChords.push(chord.written);
    }
    score /= totalWeight;
    const tonic = sequence.some(chord => tonicMatches(chord, root, mode));
    if (tonic) score += 0.08;
    // Capped bonuses prevent a copied/repeated verse from producing false certainty.
    let authentic = 0;
    let plagal = 0;
    for (let index = 1; index < sequence.length; index++) {
      if (!tonicMatches(sequence[index], root, mode)) continue;
      const previous = sequence[index - 1];
      const degree = (previous.root - root + 12) % 12;
      if (degree === 7 && previous.quality === 'major') authentic++;
      if (degree === 5 && previous.quality === (mode === 'major' ? 'major' : 'minor')) plagal++;
    }
    score += Math.min(authentic, 2) * 0.28 + Math.min(plagal, 2) * 0.08;
    if (tonicMatches(sequence[sequence.length - 1], root, mode)) score += 0.1;
    // Opening on IV, ii or vi is common, so the first chord receives no tonic bonus.
    candidates.push({ root, mode, score, coverage: fittingWeight / totalWeight, tonic, borrowedChords });
  }
  candidates.sort((left, right) => right.score - left.score || (left.mode === right.mode ? left.root - right.root : left.mode === 'major' ? -1 : 1));
  const best = candidates[0];
  const margin = best.score - candidates[1].score;
  const uncertainEvidence = [...groups.values()].filter(group => group.chord.reliability < 1).length > groups.size / 2;
  let confidence: SongKeyEstimate['confidence'] = 'low';
  if (distinctRoots >= 3 && best.tonic && best.coverage >= 0.7 && !uncertainEvidence) {
    if (margin >= 0.24 && best.coverage >= 0.85) confidence = 'high';
    else if (margin >= 0.12) confidence = 'medium';
  }
  const alternatives = candidates.slice(1).filter(candidate => best.score - candidate.score < 0.2).slice(0, 3)
    .map(candidate => ({ key: KEYS[candidate.root], mode: candidate.mode }));
  return { key: KEYS[best.root], mode: best.mode, confidence,
    borrowedChords: best.borrowedChords, alternatives };
}
