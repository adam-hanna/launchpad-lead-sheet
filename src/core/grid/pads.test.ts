import { describe, expect, it } from 'vitest';
import { ALL_LEDS, GRID_PADS, LOGO, isButton, isGridPad, padIndex, padRowCol } from './pads';

describe('pads', () => {
  it('grid pads run 11..88 bottom-left to top-right', () => {
    expect(GRID_PADS).toHaveLength(64);
    expect(GRID_PADS[0]).toBe(11);
    expect(GRID_PADS[7]).toBe(18);
    expect(GRID_PADS[8]).toBe(21);
    expect(GRID_PADS[63]).toBe(88);
    expect(GRID_PADS.every(isGridPad)).toBe(true);
  });
  it('row/col round trip and non-grid indices', () => {
    expect(padRowCol(11)).toEqual({ row: 1, col: 1 });
    expect(padRowCol(87)).toEqual({ row: 8, col: 7 });
    expect(padIndex(8, 7)).toBe(87);
    for (const i of [0, 9, 10, 19, 80, 89, 91, 99, 100]) {
      expect(isGridPad(i)).toBe(false);
      expect(padRowCol(i)).toBeNull();
    }
  });
  it('97 addressable LEDs, buttons distinct from pads', () => {
    expect(ALL_LEDS).toHaveLength(97);
    expect(new Set(ALL_LEDS).size).toBe(97);
    expect(isButton(91)).toBe(true);
    expect(isButton(LOGO)).toBe(true);
    expect(isButton(11)).toBe(false);
    expect(isButton(0)).toBe(false);
  });
});
