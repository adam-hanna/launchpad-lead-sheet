import { describe, expect, it } from 'vitest';
import {
  FUNCTION_PRIORITY,
  QUALITIES,
  applyAlterations,
  chordTones,
  resolveTones,
  type ChordQuality,
} from './chordTones';

const pcs = (root: number, q: ChordQuality, alts: Parameters<typeof chordTones>[2] = []) =>
  chordTones(root as 0, q, alts).map((t) => `${String(t.pc)}:${t.fn}`);

describe('quality tables', () => {
  it('every quality starts on the root and has a third-or-sus and a fifth unless it is a power chord', () => {
    for (const [name, tones] of Object.entries(QUALITIES)) {
      expect(tones[0]).toEqual({ interval: 0, fn: 'root' });
      const fns = tones.map((t) => t.fn);
      if (name !== 'power') expect(fns).toContain('third');
      expect(fns).toContain('fifth');
      const intervals = tones.map((t) => t.interval);
      expect(new Set(intervals).size).toBe(intervals.length);
    }
  });

  it.each<[ChordQuality, string[]]>([
    ['major', ['0:root', '4:third', '7:fifth']],
    ['minor', ['0:root', '3:third', '7:fifth']],
    ['diminished', ['0:root', '3:third', '6:fifth']],
    ['augmented', ['0:root', '4:third', '8:fifth']],
    ['power', ['0:root', '7:fifth']],
    ['sus4', ['0:root', '5:third', '7:fifth']],
    ['six', ['0:root', '4:third', '7:fifth', '9:extension']],
    ['dominant7', ['0:root', '4:third', '7:fifth', '10:seventh']],
    ['major7', ['0:root', '4:third', '7:fifth', '11:seventh']],
    ['minorMajor7', ['0:root', '3:third', '7:fifth', '11:seventh']],
    ['diminished7', ['0:root', '3:third', '6:fifth', '9:seventh']],
    ['halfDiminished7', ['0:root', '3:third', '6:fifth', '10:seventh']],
    ['dominant9', ['0:root', '4:third', '7:fifth', '10:seventh', '2:extension']],
    ['dominant13', ['0:root', '4:third', '7:fifth', '10:seventh', '2:extension', '9:extension']],
    ['sixNine', ['0:root', '4:third', '7:fifth', '9:extension', '2:extension']],
  ])('%s on C', (q, expected) => {
    expect(pcs(0, q)).toEqual(expected);
  });
});

describe('applyAlterations', () => {
  it('b5 and #5 replace the fifth', () => {
    expect(pcs(0, 'dominant7', ['b5'])).toContain('6:fifth');
    expect(pcs(0, 'dominant7', ['b5'])).not.toContain('7:fifth');
    expect(pcs(0, 'major', ['#5'])).toContain('8:fifth');
  });
  it('b9 #9 #11 b13 add extensions', () => {
    expect(pcs(0, 'dominant7', ['b9'])).toContain('1:extension');
    expect(pcs(0, 'dominant7', ['#9'])).toContain('3:extension');
    expect(pcs(0, 'dominant7', ['#11'])).toContain('6:extension');
    expect(pcs(0, 'dominant7', ['b13'])).toContain('8:extension');
  });
  it('add tokens add once; duplicates are not doubled', () => {
    const once = applyAlterations(QUALITIES.dominant9, ['add9']);
    expect(once.filter((t) => t.interval === 14)).toHaveLength(1);
    expect(pcs(0, 'major', ['add2'])).toEqual(pcs(0, 'major', ['add9']));
    expect(pcs(0, 'major', ['add4'])).toContain('5:extension');
    expect(pcs(0, 'major', ['add6'])).toContain('9:extension');
    expect(pcs(0, 'major', ['add13'])).toContain('9:extension');
  });
  it('no3 / no5 / omit remove functions', () => {
    expect(pcs(0, 'dominant7', ['no3'])).not.toContain('4:third');
    expect(pcs(0, 'dominant7', ['omit3'])).not.toContain('4:third');
    expect(pcs(0, 'major', ['no5'])).toEqual(['0:root', '4:third']);
    expect(pcs(0, 'major', ['omit5'])).toEqual(['0:root', '4:third']);
  });
  it('sus as an alteration replaces the third', () => {
    expect(pcs(0, 'major7', ['sus4'])).toContain('5:third');
    expect(pcs(0, 'major7', ['sus4'])).not.toContain('4:third');
    expect(pcs(0, 'dominant7', ['sus2'])).toContain('2:third');
  });
  it('alterations are applied in order', () => {
    expect(pcs(0, 'major', ['b5', '#5'])).toContain('8:fifth');
    expect(pcs(0, 'major', ['b5', '#5'])).not.toContain('6:fifth');
  });
});

describe('resolveTones', () => {
  it('collapses pitch-class collisions by function priority', () => {
    // #5 (8) and b13 (20 → 8): fifth outranks extension
    const tones = resolveTones(0, applyAlterations(QUALITIES.dominant7, ['#5', 'b13']));
    expect(tones.filter((t) => t.pc === 8)).toEqual([{ pc: 8, interval: 8, fn: 'fifth' }]);
    // 6th (9) on a dim7 (bb7 = 9): seventh outranks extension
    const dim = resolveTones(0, applyAlterations(QUALITIES.diminished7, ['add6']));
    expect(dim.find((t) => t.pc === 9)?.fn).toBe('seventh');
  });
  it('sorts by interval and wraps the root', () => {
    expect(chordTones(11, 'major').map((t) => t.pc)).toEqual([11, 3, 6]);
  });
  it('priority order is bass, root, third, fifth, seventh, extension', () => {
    expect(FUNCTION_PRIORITY).toEqual(['bass', 'root', 'third', 'fifth', 'seventh', 'extension']);
  });
});
