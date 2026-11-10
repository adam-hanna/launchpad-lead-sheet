import { describe, expect, it } from 'vitest';
import { CHORD_QUALITIES, ChordParseError, QUALITY_ALIASES, chordPitchClasses, parseChord } from './chords';

const pcs = (symbol: string) => [...chordPitchClasses(parseChord(symbol))].sort((a, b) => a - b);
const fns = (symbol: string) => Object.fromEntries(parseChord(symbol).tones.map((t) => [t.pc, t.fn]));

describe('parseChord: roots and spelling', () => {
  it('keeps the user spelling and resolves enharmonics to the same pitch classes', () => {
    const cs = parseChord('C#m7');
    const db = parseChord('Dbm7');
    expect(cs.rootName).toBe('C#');
    expect(db.rootName).toBe('Db');
    expect(cs.root).toBe(db.root);
    expect(pcs('C#m7')).toEqual(pcs('Dbm7'));
    expect(parseChord(' G7 ').symbol).toBe('G7');
  });
  it('accepts unicode accidentals and double accidentals', () => {
    expect(parseChord('E♭').root).toBe(3);
    expect(parseChord('F##').root).toBe(7);
    expect(parseChord('Bbb7').root).toBe(9);
  });
});

describe('parseChord: qualities', () => {
  it.each([
    ['C', [0, 4, 7]],
    ['Cmaj', [0, 4, 7]],
    ['Cm', [0, 3, 7]],
    ['C-', [0, 3, 7]],
    ['Cmin', [0, 3, 7]],
    ['Cdim', [0, 3, 6]],
    ['C°', [0, 3, 6]],
    ['Caug', [0, 4, 8]],
    ['C+', [0, 4, 8]],
    ['C5', [0, 7]],
    ['Csus2', [0, 2, 7]],
    ['Csus4', [0, 5, 7]],
    ['Csus', [0, 5, 7]],
    ['C6', [0, 4, 7, 9]],
    ['Cm6', [0, 3, 7, 9]],
    ['C6/9', [0, 2, 4, 7, 9]],
    ['C69', [0, 2, 4, 7, 9]],
    ['Cadd9', [0, 2, 4, 7]],
    ['Cmadd9', [0, 2, 3, 7]],
    ['C7', [0, 4, 7, 10]],
    ['Cmaj7', [0, 4, 7, 11]],
    ['CM7', [0, 4, 7, 11]],
    ['CΔ', [0, 4, 7, 11]],
    ['CΔ7', [0, 4, 7, 11]],
    ['Cm7', [0, 3, 7, 10]],
    ['C-7', [0, 3, 7, 10]],
    ['CmMaj7', [0, 3, 7, 11]],
    ['Cm(maj7)', [0, 3, 7, 11]],
    ['CmΔ7', [0, 3, 7, 11]],
    ['Cdim7', [0, 3, 6, 9]],
    ['C°7', [0, 3, 6, 9]],
    ['Cø', [0, 3, 6, 10]],
    ['Cø7', [0, 3, 6, 10]],
    ['Cm7b5', [0, 3, 6, 10]],
    ['Cm7(b5)', [0, 3, 6, 10]],
    ['Caug7', [0, 4, 8, 10]],
    ['C7#5', [0, 4, 8, 10]],
    ['C+7', [0, 4, 8, 10]],
    ['Cmaj7#5', [0, 4, 8, 11]],
    ['C7sus4', [0, 5, 7, 10]],
    ['C7sus', [0, 5, 7, 10]],
    ['C9', [0, 2, 4, 7, 10]],
    ['Cmaj9', [0, 2, 4, 7, 11]],
    ['Cm9', [0, 2, 3, 7, 10]],
    ['C9sus4', [0, 2, 5, 7, 10]],
    ['C11', [0, 2, 4, 5, 7, 10]],
    ['Cm11', [0, 2, 3, 5, 7, 10]],
    ['C13', [0, 2, 4, 7, 9, 10]],
    ['Cmaj13', [0, 2, 4, 7, 9, 11]],
    ['Cm13', [0, 2, 3, 7, 9, 10]],
  ])('%s', (symbol, expected) => {
    expect(pcs(symbol)).toEqual(expected);
  });

  it('every alias maps to a known quality and parses on every root', () => {
    for (const [alias, quality] of Object.entries(QUALITY_ALIASES)) {
      expect(CHORD_QUALITIES).toContain(quality);
      for (const root of ['C', 'F#', 'Bb']) {
        const chord = parseChord(`${root}${alias}`);
        expect(chord.quality).toBe(quality);
        expect(chord.alterations).toEqual([]);
      }
    }
  });
});

describe('parseChord: alterations', () => {
  it.each([
    ['C7b9', [0, 1, 4, 7, 10]],
    ['C7#9', [0, 3, 4, 7, 10]],
    ['C7(b9)', [0, 1, 4, 7, 10]],
    ['C7b9#11', [0, 1, 4, 6, 7, 10]],
    ['C7(b9,#11)', [0, 1, 4, 6, 7, 10]],
    ['C7b13', [0, 4, 7, 8, 10]],
    ['Cmaj7#11', [0, 4, 6, 7, 11]],
    ['C7b5', [0, 4, 6, 10]],
    ['Cm7(add11)', [0, 3, 5, 7, 10]],
    ['Cadd9(no3)', [0, 2, 7]],
    ['C7no5', [0, 4, 10]],
    ['Cmaj7sus4', [0, 5, 7, 11]],
    ['C(add9)', [0, 2, 4, 7]],
    ['Am(add9)', [9, 11, 0, 4].sort((a, b) => a - b)],
  ])('%s', (symbol, expected) => {
    expect(pcs(symbol)).toEqual(expected);
  });

  it('records alterations in order', () => {
    expect(parseChord('G7b9#11').alterations).toEqual(['b9', '#11']);
    expect(parseChord('G7(#9)(b13)').alterations).toEqual(['#9', 'b13']);
  });
});

describe('parseChord: slash bass', () => {
  it('parses a bass note and keeps its spelling', () => {
    const c = parseChord('C/E');
    expect(c.bass).toBe(4);
    expect(c.bassName).toBe('E');
    expect(c.quality).toBe('major');
    expect(pcs('C/E')).toEqual([0, 4, 7]);
  });
  it('bass outside the chord is included in pitch classes but not in tones', () => {
    const c = parseChord('Am/G');
    expect(c.bass).toBe(7);
    expect(c.tones.map((t) => t.pc)).not.toContain(7);
    expect(pcs('Am/G')).toEqual([0, 4, 7, 9]);
  });
  it('6/9 is a quality, not a slash chord', () => {
    const c = parseChord('C6/9');
    expect(c.bass).toBeUndefined();
    expect(c.quality).toBe('sixNine');
  });
  it('slash with alterations and parentheses', () => {
    const c = parseChord('G7(b9)/B');
    expect(c.bass).toBe(11);
    expect(c.alterations).toEqual(['b9']);
  });
});

describe('parseChord: functions', () => {
  it('assigns functions used by lighting', () => {
    expect(fns('Cmaj7')).toEqual({ 0: 'root', 4: 'third', 7: 'fifth', 11: 'seventh' });
    expect(fns('C7sus4')[5]).toBe('third');
    expect(fns('C6')[9]).toBe('extension');
    expect(fns('C9')[2]).toBe('extension');
    expect(fns('Cdim7')[9]).toBe('seventh');
  });
});

describe('parseChord: errors', () => {
  it.each<[string, number]>([
    ['', 0],
    ['H7', 0],
    ['7', 0],
    ['Cmaj7x', 5],
    ['Cfoo', 1],
    ['C7alt', 2],
    ['C7/H', 2],
    ['C7b', 2],
    ['Cm7b', 3],
  ])('rejects %j at position %i', (symbol, position) => {
    try {
      parseChord(symbol);
      expect.unreachable(`parsed ${symbol}`);
    } catch (e) {
      expect(e).toBeInstanceOf(ChordParseError);
      const err = e as ChordParseError;
      expect(err.symbol).toBe(symbol.trim());
      expect(err.position).toBe(position);
      expect(err.message).toBeTruthy();
    }
  });
});
