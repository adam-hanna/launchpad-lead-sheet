import { describe, expect, it } from 'vitest';
import type { Meter } from '../sheet';
import {
  halfBarTick,
  positionFromTicks,
  sppToTicks,
  ticksAtBar,
  ticksPerBar,
  ticksPerBeat,
  ticksToSpp,
} from './meterMath';

const m = (numerator: number, denominator: Meter['denominator']): Meter => ({ numerator, denominator });

describe('meter arithmetic (plan §4.8 acceptance)', () => {
  it.each<[Meter, number, number, number]>([
    [m(4, 4), 96, 24, 48],
    [m(3, 4), 72, 24, 36],
    [m(6, 8), 72, 12, 36],
    [m(7, 16), 42, 6, 21],
    [m(1, 4), 24, 24, 12],
    [m(16, 16), 96, 6, 48],
    [m(2, 2), 96, 48, 48],
  ])('%o → %i ticks/bar, %i ticks/beat, split at %i', (meter, bar, beat, half) => {
    expect(ticksPerBar(meter)).toBe(bar);
    expect(ticksPerBeat(meter)).toBe(beat);
    expect(halfBarTick(meter)).toBe(half);
    expect(Number.isInteger(halfBarTick(meter))).toBe(true);
  });

  it('every supported meter has an integer half-bar', () => {
    for (let n = 1; n <= 16; n++)
      for (const d of [2, 4, 8, 16] as const) expect(Number.isInteger(halfBarTick(m(n, d)))).toBe(true);
  });
});

describe('positionFromTicks', () => {
  it('4/4: bar, beat, tick, half and quarter phase', () => {
    expect(positionFromTicks(0, m(4, 4))).toEqual({
      liveBar: 1,
      beat: 1,
      tickInBar: 0,
      half: 0,
      quarterPhase: 0,
    });
    expect(positionFromTicks(47, m(4, 4))).toMatchObject({
      liveBar: 1,
      beat: 2,
      tickInBar: 47,
      half: 0,
      quarterPhase: 23,
    });
    expect(positionFromTicks(48, m(4, 4))).toMatchObject({
      liveBar: 1,
      beat: 3,
      tickInBar: 48,
      half: 1,
      quarterPhase: 0,
    });
    expect(positionFromTicks(96, m(4, 4))).toMatchObject({ liveBar: 2, beat: 1, tickInBar: 0, half: 0 });
    expect(positionFromTicks(16 * 96 + 5, m(4, 4))).toMatchObject({ liveBar: 17, beat: 1, tickInBar: 5 });
  });
  it('3/4: the split falls mid-way through beat 2', () => {
    expect(positionFromTicks(35, m(3, 4))).toMatchObject({ beat: 2, half: 0 });
    expect(positionFromTicks(36, m(3, 4))).toMatchObject({ beat: 2, half: 1 });
  });
  it('6/8 shows six beats of 12 ticks; 7/16 quarter phase crosses the bar line', () => {
    expect(positionFromTicks(36, m(6, 8))).toMatchObject({ beat: 4, half: 1 });
    expect(positionFromTicks(42, m(7, 16))).toMatchObject({
      liveBar: 2,
      beat: 1,
      tickInBar: 0,
      quarterPhase: 18,
    });
    expect(positionFromTicks(48, m(7, 16))).toMatchObject({ liveBar: 2, quarterPhase: 0 });
  });
  it('ticksAtBar inverts the bar number', () => {
    expect(ticksAtBar(1, m(4, 4))).toBe(0);
    expect(ticksAtBar(17, m(4, 4))).toBe(1536);
    expect(positionFromTicks(ticksAtBar(5, m(7, 16)), m(7, 16)).liveBar).toBe(5);
  });
});

describe('SPP encoding', () => {
  it('decodes LSB/MSB sixteenths into ticks and back', () => {
    expect(sppToTicks(0, 0)).toBe(0);
    expect(sppToTicks(16, 0)).toBe(96); // bar 2 in 4/4
    expect(sppToTicks(0, 2)).toBe(256 * 6);
    expect(ticksToSpp(96)).toEqual([16, 0]);
    expect(ticksToSpp(256 * 6)).toEqual([0, 2]);
    expect(ticksToSpp(97)).toEqual([16, 0]);
    expect(sppToTicks(0x7f, 0x7f)).toBe(16383 * 6);
  });
});
