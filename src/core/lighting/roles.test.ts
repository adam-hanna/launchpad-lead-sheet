import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, buildMapping } from '../grid';
import { createEmptySheet, resolve } from '../sheet';
import { parseChord, parseKeyToken, type PitchClass } from '../theory';
import { rolesSnapshot } from './debug';
import { pitchClassRoles, resolveRoles, type Role } from './roles';

function bar(key: string | null, chords: string[]) {
  return resolve({
    ...createEmptySheet('t'),
    bars: [
      { key: key === null ? null : parseKeyToken(key), chords: chords.map(parseChord) as unknown as [] },
    ],
  })[0]!;
}
const names = (m: ReadonlyMap<PitchClass, Role>) =>
  Object.fromEntries([...m.entries()].sort((a, b) => a[0] - b[0]).map(([pc, r]) => [pc, r]));

describe('pitchClassRoles (plan §4.6 acceptance)', () => {
  it('Key mode, C major: C = keyRoot, D = scale, F# invisible', () => {
    const r = pitchClassRoles(bar('C', ['Ab']), 0, 'key');
    expect(r.get(0)).toBe('keyRoot');
    expect(r.get(2)).toBe('scale');
    expect(r.has(6)).toBe(false);
    expect(r.has(8)).toBe(false); // chord roles do not apply in key mode
  });
  it('Key+Chord, C major with Ab major: Ab = chordRoot, C = third (outranks keyRoot), Eb = fifth, G = scale, F# = off', () => {
    const r = pitchClassRoles(bar('C', ['Ab']), 0, 'keyChord');
    expect(names(r)).toEqual({
      0: 'third',
      2: 'scale',
      3: 'fifth',
      4: 'scale',
      5: 'scale',
      7: 'scale',
      8: 'chordRoot',
      9: 'scale',
      11: 'scale',
    });
    expect(r.has(6)).toBe(false);
  });
  it('Chord mode: only chord tones and bass are visible', () => {
    const r = pitchClassRoles(bar('C', ['Dm7']), 0, 'chord');
    expect(names(r)).toEqual({ 0: 'seventh', 2: 'chordRoot', 5: 'third', 9: 'fifth' });
  });
  it('slash bass wins collisions: C/E has E as bass; Am/G has G as bass outside the chord', () => {
    expect(pitchClassRoles(bar(null, ['C/E']), 0, 'chord').get(4)).toBe('bass');
    expect(pitchClassRoles(bar('C', ['Am/G']), 0, 'keyChord').get(7)).toBe('bass');
  });
  it('key root shows keyRoot only when it has no chord role', () => {
    expect(pitchClassRoles(bar('C', ['Cmaj7']), 0, 'keyChord').get(0)).toBe('chordRoot');
    expect(pitchClassRoles(bar('C', ['G7']), 0, 'keyChord').get(0)).toBe('keyRoot');
  });
  it('split bars use the half; N.C. shows key only; no harmony shows nothing', () => {
    const split = bar('C', ['Dm7', 'G7']);
    expect(pitchClassRoles(split, 0, 'chord').get(2)).toBe('chordRoot');
    expect(pitchClassRoles(split, 1, 'chord').get(7)).toBe('chordRoot');
    expect(names(pitchClassRoles(bar('C', []), 0, 'keyChord'))).toEqual(
      names(pitchClassRoles(bar('C', []), 0, 'key')),
    );
    expect(pitchClassRoles(bar('C', []), 0, 'chord').size).toBe(0);
    expect(pitchClassRoles(null, 0, 'keyChord').size).toBe(0);
    expect(pitchClassRoles(bar(null, []), 0, 'keyChord').size).toBe(0);
  });
});

describe('resolveRoles on the fourths grid', () => {
  const mapping = buildMapping(DEFAULT_LAYOUT, 0, { kind: 'absolute' });

  it('C major + Cmaj7 in keyChord mode', () => {
    expect(rolesSnapshot(resolveRoles(bar('C', ['Cmaj7']), 0, mapping, 'keyChord'))).toMatchInlineSnapshot(`
      # | 1 2 3 4 5 6 7 8
      8 | 7 R . s . 3 s .
      7 | . 5 . s . 7 R .
      6 | . s . 3 s . 5 .
      5 | . s . 7 R . s .
      4 | . 3 s . 5 . s .
      3 | . 7 R . s . 3 s
      2 | s . 5 . s . 7 R
      1 | R . s . 3 s . 5

      3 = third
      5 = fifth
      7 = seventh
      B = bass
      R = chordRoot
      x = extension
      k = keyRoot
      s = scale
      . = off
    `);
  });

  it('key mode shows the key root marker; unmapped pads are off', () => {
    const roles = resolveRoles(bar('C', ['G7']), 0, mapping, 'key');
    expect(roles.get(11)).toBe('keyRoot'); // C1
    expect(roles.get(13)).toBe('scale'); // D1
    expect(roles.get(12)).toBe('off'); // C#1
    const high = buildMapping({ rowOffset: 5, baseNote: 120 }, 0, { kind: 'absolute' });
    expect(resolveRoles(bar('C', ['C']), 0, high, 'keyChord').get(88)).toBe('off');
  });
});
