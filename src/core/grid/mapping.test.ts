import { describe, expect, it } from 'vitest';
import { resolve, createEmptySheet } from '../sheet';
import { parseChord, parseKeyToken } from '../theory';
import { DEFAULT_LAYOUT, LAYOUT_PRESETS, effectiveBase, presetName, type Layout } from './layout';
import { anchorFor, buildMapping, mappingFor } from './mapping';

const fourths: Layout = DEFAULT_LAYOUT; // base C1 = 36, rows +5

describe('absolute mapping', () => {
  it('Live-style fourths: bottom-left is the base note, rows a fourth apart', () => {
    const m = buildMapping(fourths, 0, { kind: 'absolute' });
    expect(m.noteAt(11)).toBe(36);
    expect(m.noteAt(18)).toBe(43);
    expect(m.noteAt(21)).toBe(41);
    expect(m.noteAt(88)).toBe(36 + 7 * 5 + 7);
    expect(m.noteAt(91)).toBeNull(); // a button
  });
  it('octave shift moves the whole grid; the same note appears on several pads', () => {
    const m = buildMapping(fourths, 1, { kind: 'absolute' });
    expect(m.noteAt(11)).toBe(48);
    expect(m.padsFor(53)).toEqual([16, 21]); // F#: col 6 row 1 and col 1 row 2 (48+5)
    expect(m.padsFor(1)).toEqual([]);
  });
  it('notes beyond 127 are unmapped and silent', () => {
    const m = buildMapping({ rowOffset: 5, baseNote: 100 }, 0, { kind: 'absolute' });
    expect(m.noteAt(11)).toBe(100);
    expect(m.noteAt(88)).toBeNull(); // 100 + 35 + 7 = 142
    expect(m.noteAt(58)).toBe(127);
    expect(m.noteAt(64)).toBeNull(); // 128
    const neg = buildMapping({ rowOffset: 5, baseNote: 0 }, -1, { kind: 'absolute' });
    expect(neg.noteAt(11)).toBeNull();
    expect(neg.noteAt(31)).toBeNull(); // row 3: -12 + 2*5 = -2
    expect(neg.noteAt(41)).toBe(3); // row 4: -12 + 15
  });
  it('presets and custom row offsets', () => {
    expect(
      buildMapping({ rowOffset: LAYOUT_PRESETS.sequential, baseNote: 36 }, 0, { kind: 'absolute' }).noteAt(
        21,
      ),
    ).toBe(44);
    expect(
      buildMapping({ rowOffset: LAYOUT_PRESETS.thirds, baseNote: 36 }, 0, { kind: 'absolute' }).noteAt(21),
    ).toBe(40);
    expect(presetName(fourths)).toBe('fourths');
    expect(presetName({ rowOffset: 7, baseNote: 36 })).toBe('custom');
    expect(effectiveBase(fourths, -2)).toBe(12);
  });
});

describe('relative mapping (plan §4.7)', () => {
  it('places the anchor at the lowest note ≥ effectiveBase with that pitch class', () => {
    // effectiveBase C2 (36 is C1 in Live naming; the plan's example uses the same register logic)
    const b = buildMapping(fourths, 0, { kind: 'relative', anchor: 11 }); // B
    const c = buildMapping(fourths, 0, { kind: 'relative', anchor: 0 }); // C
    expect(b.bottomLeftNote).toBe(47);
    expect(c.bottomLeftNote).toBe(36);
    expect(b.bottomLeftNote - c.bottomLeftNote).toBe(11); // B → C shifts the grid down eleven
    expect(c.noteAt(11)).toBe(36);
    expect(b.noteAt(11)).toBe(47);
  });
  it('is not path dependent and depends on the base register', () => {
    const viaB = buildMapping(fourths, 0, { kind: 'relative', anchor: 0 });
    const direct = buildMapping(fourths, 0, { kind: 'relative', anchor: 0 });
    expect(viaB.bottomLeftNote).toBe(direct.bottomLeftNote);
    const otherBase = buildMapping({ rowOffset: 5, baseNote: 41 }, 0, { kind: 'relative', anchor: 0 }); // F base
    expect(otherBase.bottomLeftNote).toBe(48);
  });
  it('acceptance: shift up one octave, switch Absolute → Relative → Absolute: register preserved', () => {
    const abs0 = buildMapping(fourths, 1, { kind: 'absolute' });
    const rel = buildMapping(fourths, 1, { kind: 'relative', anchor: 0 });
    const abs1 = buildMapping(fourths, 1, { kind: 'absolute' });
    expect(abs0.noteAt(11)).toBe(48);
    expect(rel.noteAt(11)).toBe(48);
    expect(abs1.noteAt(11)).toBe(abs0.noteAt(11));
  });
});

describe('anchorFor', () => {
  const sheet = {
    ...createEmptySheet('t'),
    bars: [
      { key: parseKeyToken('G'), chords: [parseChord('Am7'), parseChord('D7')] as const },
      { key: null, chords: [parseChord('Bb')] as const },
      { chords: [] as const },
    ],
  };
  const [bar1, bar2, bar3] = resolve(sheet);

  it('chordRoot setting: chord root per half, falling back to key root, then base', () => {
    expect(anchorFor('chordRoot', bar1!, 0, fourths, 0)).toBe(9);
    expect(anchorFor('chordRoot', bar1!, 1, fourths, 0)).toBe(2);
    expect(anchorFor('chordRoot', bar3!, 0, fourths, 0)).toBe(0); // N.C., no key → base pitch class C
    expect(anchorFor('chordRoot', null, 0, { rowOffset: 5, baseNote: 38 }, 0)).toBe(2);
  });
  it('keyRoot setting: key root, falling back to chord root when the bar has no key (acceptance)', () => {
    expect(anchorFor('keyRoot', bar1!, 1, fourths, 0)).toBe(7);
    expect(anchorFor('keyRoot', bar2!, 0, fourths, 0)).toBe(10);
  });
  it('mappingFor wires it together; absolute ignores the anchor', () => {
    expect(mappingFor(fourths, 0, false, 'chordRoot', bar1!, 0).noteAt(11)).toBe(36);
    expect(mappingFor(fourths, 0, true, 'chordRoot', bar1!, 0).noteAt(11)).toBe(45); // A1
    expect(mappingFor(fourths, 0, true, 'keyRoot', bar1!, 0).noteAt(11)).toBe(43); // G1
  });
});
