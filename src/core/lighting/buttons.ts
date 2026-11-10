import { TOP_BUTTONS, type PadIndex } from '../grid';
import { OFF, led, type LedState } from './ledState';

/** Left-column buttons used for octave shifting (Pro MK3: ↑ is 80, ↓ is 70). */
export const OCTAVE_UP_BUTTON: PadIndex = 80;
export const OCTAVE_DOWN_BUTTON: PadIndex = 70;

export const MIN_OCTAVE_SHIFT = -4;
export const MAX_OCTAVE_SHIFT = 6;

export function clampOctaveShift(shift: number): number {
  return Math.max(MIN_OCTAVE_SHIFT, Math.min(MAX_OCTAVE_SHIFT, Math.round(shift)));
}

/**
 * Side-button LED feedback (roadmap M5-T7): both octave buttons glow dimly when available, brighter in
 * the direction the grid has been shifted (one step per octave), and off at the limit.
 */
export function octaveButtonStates(octaveShift: number): ReadonlyMap<PadIndex, LedState> {
  const m = new Map<PadIndex, LedState>();
  const level = (steps: number) => led.rgb(20 + steps * 25, 20 + steps * 25, 20 + steps * 25);
  m.set(OCTAVE_UP_BUTTON, octaveShift >= MAX_OCTAVE_SHIFT ? OFF : level(Math.max(0, octaveShift)));
  m.set(OCTAVE_DOWN_BUTTON, octaveShift <= MIN_OCTAVE_SHIFT ? OFF : level(Math.max(0, -octaveShift)));
  return m;
}

/**
 * Top-row beat indicator (roadmap M7-T3): the current beat (1-based) lit white, the other beats of the
 * bar dim, buttons beyond the bar's beat count off. Bars with more than eight beats wrap.
 */
export function beatIndicatorStates(beat: number, beatsPerBar: number): ReadonlyMap<PadIndex, LedState> {
  const m = new Map<PadIndex, LedState>();
  const shown = Math.min(8, beatsPerBar);
  const current = ((beat - 1) % 8) + 1;
  TOP_BUTTONS.forEach((pad, i) => {
    const n = i + 1;
    if (n > shown) m.set(pad, OFF);
    else m.set(pad, n === current ? led.rgb(110, 110, 110) : led.rgb(10, 10, 10));
  });
  return m;
}
