import { describe, expect, it } from 'vitest';
import { resolve } from './resolve';
import { parseChart } from './text';
import type { Sheet } from './types';

const FIXTURE = `title: Round Trip
time: 3/4
tempo: 132
origin: 9
loop: 2-5

[A]
| {Bb} Bbmaj7 Gm7 | Cm7 F7 |  | N.C. |
| % | {-} Dm7 | {F# dorian} F#m7 |
[B]
| {G} G | % |
`;

function parseOk(text: string): Sheet {
  const r = parseChart(text, 'id-1');
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.sheet;
}
const symbols = (sheet: Sheet) =>
  sheet.bars.map((b) =>
    b.chords === undefined ? 'inherit' : b.chords.map((c) => c.symbol).join(' ') || 'N.C.',
  );

describe('parseChart', () => {
  it('parses headers, sections, keys, chords, N.C., inherit and %', () => {
    const s = parseOk(FIXTURE);
    expect(s.title).toBe('Round Trip');
    expect(s.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(s.tempoNote).toBe(132);
    expect(s.originBar).toBe(9);
    expect(s.loop).toEqual({ startBar: 2, endBar: 5 });
    expect(s.id).toBe('id-1');
    expect(s.bars).toHaveLength(9);
    expect(symbols(s)).toEqual(['Bbmaj7 Gm7', 'Cm7 F7', 'inherit', 'N.C.', 'N.C.', 'Dm7', 'F#m7', 'G', 'G']);
    expect(s.bars[0]!.section).toBe('A');
    expect(s.bars[7]!.section).toBe('B');
    expect(s.bars[0]!.key).toMatchObject({ root: 10, scale: 'major', rootName: 'Bb' });
    expect(s.bars[1]!.key).toBeUndefined();
    expect(s.bars[5]!.key).toBeNull();
    expect(s.bars[6]!.key).toMatchObject({ root: 6, scale: 'dorian' });
  });

  it('% copies the previous bar as resolved: both chords of a split, then the sustained second chord', () => {
    const s = parseOk('| Dm7 G7 | % | | % |');
    expect(symbols(s)).toEqual(['Dm7 G7', 'Dm7 G7', 'inherit', 'G7']);
    // % is explicit: resolution of later bars does not depend on bar 1 any more
    expect(resolve(s).map((b) => b.chords.map((c) => c.symbol))).toEqual([
      ['Dm7', 'G7'],
      ['Dm7', 'G7'],
      ['G7'],
      ['G7'],
    ]);
  });

  it('% at the very start is N.C.', () => {
    expect(symbols(parseOk('| % | C |'))).toEqual(['N.C.', 'C']);
  });

  it('accepts N.C. spellings, several bars per line, and defaults', () => {
    const s = parseOk('| C | nc | n.c. | NC |\n| G |');
    expect(symbols(s)).toEqual(['C', 'N.C.', 'N.C.', 'N.C.', 'G']);
    expect(s.title).toBe('Untitled');
    expect(s.meter).toEqual({ numerator: 4, denominator: 4 });
    expect(s.originBar).toBe(1);
    expect(s.loop).toBeUndefined();
    expect(s.tempoNote).toBeUndefined();
  });

  it('empty text is an empty sheet', () => {
    expect(parseOk('').bars).toEqual([]);
    expect(parseOk('title: X\n').bars).toEqual([]);
  });

  it.each<[string, string, Partial<{ line: number; bar: number; token: string }>]>([
    ['bad chord', '| C | Hm7 |', { line: 1, bar: 2, token: 'Hm7' }],
    ['bad key', '| {G bebop} C |', { line: 1, bar: 1, token: '{G bebop}' }],
    ['three chords', '| C F G |', { line: 1, bar: 1, token: 'C F G' }],
    ['bad time', 'time: 5/3\n| C |', { line: 1, token: '5/3' }],
    ['bad tempo', 'tempo: fast\n| C |', { line: 1, token: 'fast' }],
    ['bad origin', 'origin: 0\n| C |', { line: 1, token: '0' }],
    ['bad loop syntax', 'loop: 5\n| C |', { line: 1, token: '5' }],
    ['loop past end', 'loop: 1-3\n| C | D |', { line: 1, token: '1-3' }],
    ['unknown header', 'colour: pink\n| C |', { line: 1, token: 'colour' }],
    ['header after bars', '| C |\ntitle: late', { line: 2 }],
    ['garbage line', 'hello world', { line: 1 }],
    ['missing closing pipe', '| C | D', { line: 1 }],
    ['dangling section', '| C |\n[B]', { line: 2, token: '[B]' }],
  ])('reports %s with location', (_n, text, where) => {
    const r = parseChart(text, 'x');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject(where);
    expect(r.errors[0]!.message).toBeTruthy();
  });

  it('collects several errors at once', () => {
    const r = parseChart('| Hm7 | {Q} C | C D E |', 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.bar)).toEqual([1, 2, 3]);
  });
});
