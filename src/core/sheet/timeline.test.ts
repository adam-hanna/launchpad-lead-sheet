import { describe, expect, it } from 'vitest';
import { parseChord, parseKeyToken } from '../theory';
import { resolve } from './resolve';
import { activeHarmony, mapLoop, toSheetBar } from './timeline';
import { createEmptySheet, type Bar } from './types';

const bars: Bar[] = [
  { key: parseKeyToken('C'), chords: [parseChord('Cmaj7')] },
  { chords: [parseChord('Am7')] },
  { chords: [parseChord('Dm7'), parseChord('G7')] },
];
const resolved = resolve({ ...createEmptySheet('t'), bars });
const sym = (h: ReturnType<typeof activeHarmony>) => h.harmony?.chords.map((c) => c.symbol);

describe('mapLoop', () => {
  it('folds bars after the loop end back into the range', () => {
    const loop = { startBar: 5, endBar: 8 };
    expect(mapLoop(9, loop)).toBe(5);
    expect(mapLoop(12, loop)).toBe(8);
    expect(mapLoop(13, loop)).toBe(5);
    expect(mapLoop(8, loop)).toBe(8);
    expect(mapLoop(3, loop)).toBe(3);
    expect(mapLoop(42)).toBe(42);
  });
  it('single-bar loop', () => {
    expect(mapLoop(7, { startBar: 2, endBar: 2 })).toBe(2);
  });
});

describe('toSheetBar', () => {
  it('plan §4.4 acceptance: Live bar 17 with origin 9 → sheet bar 9; before the origin → null', () => {
    expect(toSheetBar(17, 9)).toBe(9);
    expect(toSheetBar(1, 1)).toBe(1);
    expect(toSheetBar(8, 9)).toBeNull();
  });
});

describe('activeHarmony', () => {
  it('in the sheet', () => {
    const h = activeHarmony(resolved, 2, undefined);
    expect(h.status).toBe('inSheet');
    expect(h.barIndex).toBe(1);
    expect(sym(h)).toEqual(['Am7']);
    expect(h.dark).toBe(false);
  });
  it('loop 5–8 → bar 9 shows bar 5 (using a 3-bar sheet with loop 2–3: bar 4 → 2)', () => {
    const h = activeHarmony(resolved, 4, { startBar: 2, endBar: 3 });
    expect(h.barIndex).toBe(1);
    expect(h.status).toBe('inSheet');
  });
  it('past the end sustains the final sounding chord and key as a single-chord bar', () => {
    const h = activeHarmony(resolved, 7, undefined);
    expect(h.status).toBe('pastEnd');
    expect(sym(h)).toEqual(['G7']);
    expect(h.harmony?.key?.root).toBe(0);
    expect(h.dark).toBe(false);
  });
  it('past the end with repeat policy replays the last bar as is', () => {
    const h = activeHarmony(resolved, 7, undefined, 'repeat');
    expect(sym(h)).toEqual(['Dm7', 'G7']);
  });
  it('past the end with dark policy keeps the anchor but turns guidance off', () => {
    const h = activeHarmony(resolved, 7, undefined, 'dark');
    expect(h.dark).toBe(true);
    expect(sym(h)).toEqual(['G7']);
  });
  it('before the origin shows bar 1 as a count-in', () => {
    const h = activeHarmony(resolved, null, undefined);
    expect(h.status).toBe('beforeStart');
    expect(h.barIndex).toBe(0);
    expect(sym(h)).toEqual(['Cmaj7']);
  });
  it('empty sheet', () => {
    const h = activeHarmony([], 1, undefined);
    expect(h).toEqual({ status: 'empty', barIndex: null, harmony: null, dark: false });
    expect(activeHarmony([], null, undefined).status).toBe('empty');
  });
  it('is a pure function of its inputs (sequential vs seek give the same result)', () => {
    const seq = [1, 2, 3, 4, 5, 6, 7].map((b) => activeHarmony(resolved, b, undefined));
    expect(activeHarmony(resolved, 7, undefined)).toEqual(seq[6]);
  });
  it('N.C. at the end sustains as N.C.', () => {
    const r = resolve({ ...createEmptySheet('t'), bars: [{ chords: [parseChord('C')] }, { chords: [] }] });
    expect(activeHarmony(r, 5, undefined).harmony?.chords).toEqual([]);
  });
});
