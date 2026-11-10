import { describe, expect, it } from 'vitest';
import { isGridSnapshot, renderGrid, type GridSnapshot } from './gridSnapshot';

// Even rows (from the top) are scale tones, odd rows are off, bottom-left is the root.
const grid: GridSnapshot = {
  kind: 'grid8x8',
  rows: Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => (r === 7 && c === 0 ? 'R' : r % 2 === 0 ? 's' : '.')),
  ),
  legend: { R: 'root', s: 'scale', '.': 'off' },
};

describe('gridSnapshot', () => {
  it('recognises grid snapshots', () => {
    expect(isGridSnapshot(grid)).toBe(true);
    expect(isGridSnapshot({ rows: [] })).toBe(false);
    expect(isGridSnapshot(null)).toBe(false);
  });

  it('renders top row first with pad-row labels', () => {
    const lines = renderGrid(grid).split('\n');
    expect(lines[0]).toBe('# | 1 2 3 4 5 6 7 8');
    expect(lines[1]).toBe('8 | s s s s s s s s');
    expect(lines[8]).toBe('1 | R . . . . . . .');
  });

  it('is used by inline snapshots', () => {
    expect(grid).toMatchInlineSnapshot(`
      # | 1 2 3 4 5 6 7 8
      8 | s s s s s s s s
      7 | . . . . . . . .
      6 | s s s s s s s s
      5 | . . . . . . . .
      4 | s s s s s s s s
      3 | . . . . . . . .
      2 | s s s s s s s s
      1 | R . . . . . . .

      R = root
      s = scale
      . = off
    `);
  });
});
