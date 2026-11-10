import { describe, expect, it } from 'vitest';
import {
  SCALE_INTERVALS,
  SCALE_LABELS,
  SCALE_TYPES,
  normaliseScaleName,
  scaleDegree,
  scalePitchClasses,
} from './scales';

describe('scale tables', () => {
  it('every scale type has intervals and a label, starting on the root, strictly ascending within the octave', () => {
    for (const type of SCALE_TYPES) {
      const iv = SCALE_INTERVALS[type];
      expect(SCALE_LABELS[type]).toBeTruthy();
      expect(iv[0]).toBe(0);
      for (let i = 1; i < iv.length; i++) expect(iv[i]!).toBeGreaterThan(iv[i - 1]!);
      expect(iv[iv.length - 1]!).toBeLessThan(12);
    }
  });
});

describe('scalePitchClasses', () => {
  it('C major and A natural minor share pitch classes', () => {
    expect([...scalePitchClasses(0, 'major')].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scalePitchClasses(9, 'naturalMinor')).toEqual(scalePitchClasses(0, 'major'));
  });
  it('wraps around the octave for high roots', () => {
    expect([...scalePitchClasses(11, 'major')].sort((a, b) => a - b)).toEqual([1, 3, 4, 6, 8, 10, 11]);
  });
  it('pentatonics and blues', () => {
    expect([...scalePitchClasses(0, 'minorPentatonic')].sort((a, b) => a - b)).toEqual([0, 3, 5, 7, 10]);
    expect(scalePitchClasses(0, 'blues').has(6)).toBe(true);
    expect(scalePitchClasses(0, 'chromatic').size).toBe(12);
  });
});

describe('scaleDegree', () => {
  it('returns 1-based degrees and null for non-scale tones', () => {
    expect(scaleDegree(0, 'major', 0)).toBe(1);
    expect(scaleDegree(0, 'major', 11)).toBe(7);
    expect(scaleDegree(0, 'major', 1)).toBeNull();
    expect(scaleDegree(7, 'mixolydian', 5)).toBe(7);
  });
});

describe('normaliseScaleName', () => {
  it.each([
    ['major', 'major'],
    ['Major', 'major'],
    ['ionian', 'major'],
    ['minor', 'naturalMinor'],
    ['aeolian', 'naturalMinor'],
    ['natural minor', 'naturalMinor'],
    ['harmonic minor', 'harmonicMinor'],
    ['Harmonic-Minor', 'harmonicMinor'],
    ['melodic minor', 'melodicMinor'],
    ['dorian', 'dorian'],
    ['mixo', 'mixolydian'],
    ['min pent', 'minorPentatonic'],
    ['major pentatonic', 'majorPentatonic'],
    ['pent', 'majorPentatonic'],
    ['blues', 'blues'],
    ['whole tone', 'wholeTone'],
    ['dim', 'diminished'],
    ['half whole', 'diminishedHalfWhole'],
    ['chromatic', 'chromatic'],
  ])('%s → %s', (text, type) => {
    expect(normaliseScaleName(text)).toBe(type);
  });
  it('returns null for unknown names', () => {
    expect(normaliseScaleName('bebop')).toBeNull();
    expect(normaliseScaleName('')).toBeNull();
  });
});
