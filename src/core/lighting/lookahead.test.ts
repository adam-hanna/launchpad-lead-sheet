import { describe, expect, it } from 'vitest';
import { changedPads } from './lookahead';
import type { Role } from './roles';

const m = (entries: [number, Role][]) => new Map<number, Role>(entries);

describe('changedPads', () => {
  it('lists pads whose role changes, ignoring off → off', () => {
    const current = m([
      [11, 'chordRoot'],
      [12, 'off'],
      [13, 'scale'],
      [14, 'off'],
    ]);
    const next = m([
      [11, 'third'],
      [12, 'off'],
      [13, 'scale'],
      [14, 'fifth'],
    ]);
    expect([...changedPads(current, next)].sort()).toEqual([11, 14]);
  });
  it('a lit pad missing from the next map counts as a change', () => {
    expect([...changedPads(m([[11, 'scale']]), m([]))]).toEqual([11]);
    expect([...changedPads(m([[11, 'off']]), m([]))]).toEqual([]);
    expect(changedPads(m([]), m([])).size).toBe(0);
  });
});
