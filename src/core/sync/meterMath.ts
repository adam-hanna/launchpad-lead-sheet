import type { Meter } from '../sheet';

/** MIDI clock resolution: 24 ticks per quarter note. */
export const TICKS_PER_QUARTER = 24;
/** Song Position Pointer counts sixteenth notes; 6 clock ticks each. */
export const TICKS_PER_SIXTEENTH = 6;

/** Plan §4.8: `ticksPerBar = 24 * numerator * 4 / denominator` (always an integer for supported meters). */
export function ticksPerBar(meter: Meter): number {
  return (TICKS_PER_QUARTER * meter.numerator * 4) / meter.denominator;
}

/** Beats are counted in denominator units: 96 / denominator ticks each. */
export function ticksPerBeat(meter: Meter): number {
  return (TICKS_PER_QUARTER * 4) / meter.denominator;
}

/** The two-chord split point: always an integer for the supported meter set. */
export function halfBarTick(meter: Meter): number {
  return ticksPerBar(meter) / 2;
}

export interface BarPosition {
  /** 1-based Live Arrangement bar. */
  readonly liveBar: number;
  /** 1-based beat within the bar, in denominator units. */
  readonly beat: number;
  /** 0-based tick within the bar. */
  readonly tickInBar: number;
  /** 0 = first half, 1 = second half. */
  readonly half: 0 | 1;
  /** Absolute quarter-note phase 0–23 for flash rendering (plan §4.3). */
  readonly quarterPhase: number;
}

/** Decompose an absolute tick count (0 = 1.1.1) into bar, beat, tick and half. */
export function positionFromTicks(ticks: number, meter: Meter): BarPosition {
  const perBar = ticksPerBar(meter);
  const perBeat = ticksPerBeat(meter);
  const liveBar = Math.floor(ticks / perBar) + 1;
  const tickInBar = ticks - (liveBar - 1) * perBar;
  const beat = Math.floor(tickInBar / perBeat) + 1;
  return {
    liveBar,
    beat,
    tickInBar,
    half: tickInBar >= halfBarTick(meter) ? 1 : 0,
    quarterPhase: ticks % TICKS_PER_QUARTER,
  };
}

/** Absolute tick of the start of a 1-based Live bar. */
export function ticksAtBar(liveBar: number, meter: Meter): number {
  return (liveBar - 1) * ticksPerBar(meter);
}

/** Decode a Song Position Pointer payload (LSB, MSB, 7 bits each) into absolute ticks. */
export function sppToTicks(lsb: number, msb: number): number {
  return ((lsb & 0x7f) | ((msb & 0x7f) << 7)) * TICKS_PER_SIXTEENTH;
}

/** Encode absolute ticks as an SPP payload (truncating to whole sixteenths). */
export function ticksToSpp(ticks: number): readonly [lsb: number, msb: number] {
  const sixteenths = Math.floor(ticks / TICKS_PER_SIXTEENTH) & 0x3fff;
  return [sixteenths & 0x7f, sixteenths >> 7];
}
