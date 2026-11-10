import { describe, expect, it } from 'vitest';
import {
  MAX_OCTAVE_SHIFT,
  MIN_OCTAVE_SHIFT,
  OCTAVE_DOWN_BUTTON,
  OCTAVE_UP_BUTTON,
  clampOctaveShift,
  octaveButtonStates,
} from './buttons';

describe('octave buttons', () => {
  it('clamps the shift to the supported range', () => {
    expect(clampOctaveShift(0)).toBe(0);
    expect(clampOctaveShift(99)).toBe(MAX_OCTAVE_SHIFT);
    expect(clampOctaveShift(-99)).toBe(MIN_OCTAVE_SHIFT);
    expect(clampOctaveShift(1.4)).toBe(1);
  });
  it('lights both dimly at zero, brighter in the shifted direction, off at the limit', () => {
    const zero = octaveButtonStates(0);
    expect(zero.get(OCTAVE_UP_BUTTON)).toEqual({ kind: 'rgb', rgb: [20, 20, 20] });
    expect(zero.get(OCTAVE_DOWN_BUTTON)).toEqual({ kind: 'rgb', rgb: [20, 20, 20] });
    const up2 = octaveButtonStates(2);
    expect(up2.get(OCTAVE_UP_BUTTON)).toEqual({ kind: 'rgb', rgb: [70, 70, 70] });
    expect(up2.get(OCTAVE_DOWN_BUTTON)).toEqual({ kind: 'rgb', rgb: [20, 20, 20] });
    expect(octaveButtonStates(MAX_OCTAVE_SHIFT).get(OCTAVE_UP_BUTTON)).toEqual({ kind: 'off' });
    expect(octaveButtonStates(MIN_OCTAVE_SHIFT).get(OCTAVE_DOWN_BUTTON)).toEqual({ kind: 'off' });
    expect(octaveButtonStates(-1).get(OCTAVE_DOWN_BUTTON)).toEqual({ kind: 'rgb', rgb: [45, 45, 45] });
  });
});

describe('beat indicator', () => {
  it('lights the current beat white, others dim, beyond the bar off; wraps past eight', async () => {
    const { beatIndicatorStates } = await import('./buttons');
    const m = beatIndicatorStates(2, 4);
    expect(m.get(91)).toEqual({ kind: 'rgb', rgb: [10, 10, 10] });
    expect(m.get(92)).toEqual({ kind: 'rgb', rgb: [110, 110, 110] });
    expect(m.get(95)).toEqual({ kind: 'off' });
    expect(beatIndicatorStates(9, 12).get(91)).toEqual({ kind: 'rgb', rgb: [110, 110, 110] });
    expect(beatIndicatorStates(1, 12).get(98)).toEqual({ kind: 'rgb', rgb: [10, 10, 10] });
  });
});
