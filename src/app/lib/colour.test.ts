import { describe, expect, it } from 'vitest';
import { hexToRgb127, rgb127ToHex } from './colour';

describe('colour conversion', () => {
  it('round-trips extremes and handles short / bad hex', () => {
    expect(hexToRgb127('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb127('#ffffff')).toEqual([127, 127, 127]);
    expect(hexToRgb127('#fff')).toEqual([127, 127, 127]);
    expect(hexToRgb127('zz')).toEqual([0, 0, 0]);
    expect(rgb127ToHex([0, 0, 0])).toBe('#000000');
    expect(rgb127ToHex([127, 127, 127])).toBe('#ffffff');
    const mid = hexToRgb127(rgb127ToHex([127, 0, 64]));
    expect(mid[0]).toBe(127);
    expect(mid[1]).toBe(0);
    expect(Math.abs(mid[2] - 64)).toBeLessThanOrEqual(1);
  });
});
