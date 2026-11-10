import { describe, expect, it } from 'vitest';
import { KeyParseError, formatKey, isInKey, keyPitchClasses, parseKeyToken } from './keys';

describe('parseKeyToken', () => {
  it.each([
    ['G', 7, 'major', 'G'],
    ['Gm', 7, 'naturalMinor', 'G'],
    ['F#m', 6, 'naturalMinor', 'F#'],
    ['Bb', 10, 'major', 'Bb'],
    ['Bb major', 10, 'major', 'Bb'],
    ['E dorian', 4, 'dorian', 'E'],
    ['A minor pentatonic', 9, 'minorPentatonic', 'A'],
    ['C harmonic minor', 0, 'harmonicMinor', 'C'],
    ['Cm harmonic minor', 0, 'harmonicMinor', 'C'],
    ['  D  mixolydian  ', 2, 'mixolydian', 'D'],
    ['eb', 3, 'major', 'eb'],
    ['G m', 7, 'naturalMinor', 'G'],
  ])('%s', (text, root, scale, rootName) => {
    expect(parseKeyToken(text)).toEqual({ root, scale, rootName });
  });

  it.each(['', 'H', 'G bebop', 'Gm dorian', 'maj7', '{G}'])('rejects %j', (text) => {
    expect(() => parseKeyToken(text)).toThrow(KeyParseError);
  });

  it('error carries the offending text', () => {
    try {
      parseKeyToken('G bebop');
    } catch (e) {
      expect(e).toBeInstanceOf(KeyParseError);
      expect((e as KeyParseError).text).toBe('G bebop');
      expect((e as KeyParseError).message).toContain('bebop');
    }
  });
});

describe('formatKey', () => {
  it('round-trips canonical forms and preserves spelling', () => {
    expect(formatKey(parseKeyToken('G'))).toBe('G');
    expect(formatKey(parseKeyToken('Gm'))).toBe('Gm');
    expect(formatKey(parseKeyToken('Bb'))).toBe('Bb');
    expect(formatKey(parseKeyToken('E dorian'))).toBe('E dorian');
    expect(formatKey(parseKeyToken('A minor pentatonic'))).toBe('A minor pentatonic');
    expect(formatKey(parseKeyToken('C harmonic minor'))).toBe('C harmonic minor');
    expect(formatKey(parseKeyToken('C half whole'))).toBe('C half-whole');
  });
  it('falls back to sharp or flat spelling without a root name', () => {
    expect(formatKey({ root: 1, scale: 'major' })).toBe('C#');
    expect(formatKey({ root: 1, scale: 'naturalMinor' }, 'flat')).toBe('Dbm');
  });
});

describe('membership', () => {
  it('keyPitchClasses and isInKey agree', () => {
    const key = parseKeyToken('D');
    expect([...keyPitchClasses(key)].sort((a, b) => a - b)).toEqual([1, 2, 4, 6, 7, 9, 11]);
    expect(isInKey(key, 1)).toBe(true);
    expect(isInKey(key, 0)).toBe(false);
  });
});
