import { describe, expect, it } from 'vitest';
import { resolve } from './resolve';
import { toDoc } from './schema';
import { parseChart } from './text';
import { formatChart } from './textFormat';
import type { Sheet } from './types';

const FIXTURE =
  'title: Round Trip\ntime: 3/4\ntempo: 132\norigin: 9\nloop: 2-5\n\n[A]\n| {Bb} Bbmaj7 Gm7 | Cm7 F7 |  | N.C. |\n| % | {-} Dm7 | {F# dorian} F#m7 |\n[B]\n| {G} G | % |\n';

function parseOk(text: string): Sheet {
  const r = parseChart(text, 'id-1');
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.sheet;
}

describe('formatChart', () => {
  it('writes canonical headers, sections and cells, four bars per line', () => {
    const s = parseOk(FIXTURE);
    expect(formatChart(s)).toBe(`title: Round Trip
time: 3/4
tempo: 132
origin: 9
loop: 2-5

[A]
| {Bb} Bbmaj7 Gm7 | Cm7 F7 |  | N.C. |
| N.C. | {-} Dm7 | {F# dorian} F#m7 |

[B]
| {G} G | G |
`);
  });

  it('omits origin 1, tempo and loop when absent; empty sheet is headers only', () => {
    expect(formatChart(parseOk('| C |'))).toBe('title: Untitled\ntime: 4/4\n\n| C |\n');
    expect(formatChart(parseOk(''))).toBe('title: Untitled\ntime: 4/4\n');
  });

  it('semantic round trip: import → export → import preserves content and inherit/explicit/clear', () => {
    const first = parseOk(FIXTURE);
    const text = formatChart(first);
    const second = parseOk(text);
    expect(toDoc(second)).toEqual(toDoc(first));
  });

  it('canonical export is stable and % expansion makes copy and literal identical', () => {
    const a = formatChart(parseOk('| Cmaj7 | % |'));
    const b = formatChart(parseOk('| Cmaj7 | Cmaj7 |'));
    expect(a).toBe(b);
    expect(formatChart(parseOk(a))).toBe(a);
    expect(formatChart(parseOk(formatChart(parseOk(FIXTURE))))).toBe(formatChart(parseOk(FIXTURE)));
  });

  it('editing bar 1 afterwards leaves an expanded % bar unchanged', () => {
    const s = parseOk('| Cmaj7 | % |');
    const edited: Sheet = {
      ...s,
      bars: [{ chords: s.bars[0]!.chords!.length ? [parseOkChord('Am7')] : [] }, s.bars[1]!],
    };
    expect(resolve(edited)[1]!.chords.map((c) => c.symbol)).toEqual(['Cmaj7']);
  });

  it('respects barsPerLine', () => {
    expect(formatChart(parseOk('| C | D | E |'), { barsPerLine: 2 })).toBe(
      'title: Untitled\ntime: 4/4\n\n| C | D |\n| E |\n',
    );
  });
});

function parseOkChord(symbol: string) {
  const s = parseOk(`| ${symbol} |`);
  return s.bars[0]!.chords![0]!;
}
