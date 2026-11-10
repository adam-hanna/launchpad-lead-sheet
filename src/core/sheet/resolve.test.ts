import { describe, expect, it } from 'vitest';
import { parseChord, parseKeyToken } from '../theory';
import { chordAt, inheritingBars, lastSoundingChord, resolve } from './resolve';
import { createEmptySheet, type Bar, type Sheet } from './types';

const C = parseChord('Cmaj7');
const Dm = parseChord('Dm7');
const G7 = parseChord('G7');
const Em = parseChord('Em7');
const A7 = parseChord('A7');
const keyC = parseKeyToken('C');
const keyG = parseKeyToken('G');

function sheetOf(bars: Bar[]): Sheet {
  return { ...createEmptySheet('t'), bars };
}
const symbols = (chords: readonly { symbol: string }[]) => chords.map((c) => c.symbol);

describe('resolve', () => {
  it('plan §4.5 acceptance: | Cmaj7 | N.C. | Dm7 G7 |   | → [Cmaj7] [] [Dm7,G7] [G7]', () => {
    const r = resolve(sheetOf([{ chords: [C] }, { chords: [] }, { chords: [Dm, G7] }, {}]));
    expect(r.map((b) => symbols(b.chords))).toEqual([['Cmaj7'], [], ['Dm7', 'G7'], ['G7']]);
  });

  it('keys and chords inherit independently; null clears a key', () => {
    const r = resolve(
      sheetOf([{ key: keyC, chords: [C] }, { chords: [Dm] }, { key: keyG }, { key: null }, {}]),
    );
    expect(r.map((b) => b.key?.root ?? null)).toEqual([0, 0, 7, null, null]);
    expect(r.map((b) => symbols(b.chords))).toEqual([['Cmaj7'], ['Dm7'], ['Dm7'], ['Dm7'], ['Dm7']]);
  });

  it('first-bar inherit resolves to cleared key and N.C.', () => {
    const r = resolve(sheetOf([{}, { chords: [C] }]));
    expect(r[0]).toEqual({ key: null, chords: [] });
  });

  it('a bar inheriting after a split keeps sustaining the second chord through further inherits', () => {
    const r = resolve(sheetOf([{ chords: [Dm, G7] }, {}, {}]));
    expect(r.map((b) => symbols(b.chords))).toEqual([['Dm7', 'G7'], ['G7'], ['G7']]);
  });

  it('editing an earlier bar changes later inheriting bars (re-resolve is pure)', () => {
    const before = resolve(sheetOf([{ chords: [C] }, { chords: [Dm, G7] }, {}]));
    const after = resolve(sheetOf([{ chords: [C] }, { chords: [Em, A7] }, {}]));
    expect(symbols(before[2]!.chords)).toEqual(['G7']);
    expect(symbols(after[2]!.chords)).toEqual(['A7']);
  });

  it('carries section labels and handles an empty sheet', () => {
    expect(resolve(sheetOf([]))).toEqual([]);
    const r = resolve(sheetOf([{ section: 'A', chords: [C] }, {}]));
    expect(r[0]!.section).toBe('A');
    expect(r[1]!.section).toBeUndefined();
  });
});

describe('helpers', () => {
  it('chordAt and lastSoundingChord', () => {
    const [nc, one, two] = resolve(sheetOf([{ chords: [] }, { chords: [C] }, { chords: [Dm, G7] }]));
    expect(chordAt(nc!, 0)).toBeNull();
    expect(chordAt(one!, 0)?.symbol).toBe('Cmaj7');
    expect(chordAt(one!, 1)?.symbol).toBe('Cmaj7');
    expect(chordAt(two!, 0)?.symbol).toBe('Dm7');
    expect(chordAt(two!, 1)?.symbol).toBe('G7');
    expect(lastSoundingChord(two!)?.symbol).toBe('G7');
    expect(lastSoundingChord(nc!)).toBeNull();
  });
  it('inheritingBars lists bars with any inherited field', () => {
    expect(
      inheritingBars(sheetOf([{ key: keyC, chords: [C] }, { chords: [Dm] }, {}, { key: null, chords: [] }])),
    ).toEqual([1, 2]);
  });
});
