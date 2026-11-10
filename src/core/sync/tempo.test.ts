import { describe, expect, it } from 'vitest';
import { TempoEstimator } from './tempo';

const CLOCK = [0xf8];

describe('TempoEstimator', () => {
  it('converges on the clock rate', () => {
    const t = new TempoEstimator(0.5);
    const dt = 60_000 / (120 * 24);
    for (let i = 0; i < 50; i++) t.onMidi(CLOCK, i * dt);
    expect(t.estimate()).toBeCloseTo(120, 3);
  });

  it('is unknown before two clocks, resets on Start/Stop and after a long gap', () => {
    const t = new TempoEstimator();
    expect(t.estimate()).toBeNull();
    t.onMidi(CLOCK, 0);
    expect(t.estimate()).toBeNull();
    t.onMidi(CLOCK, 25);
    expect(t.estimate()).toBeCloseTo(100, 3);
    t.onMidi([0xfa], 30);
    expect(t.estimate()).toBeNull();
    t.onMidi(CLOCK, 100);
    t.onMidi(CLOCK, 125);
    expect(t.estimate()).not.toBeNull();
    t.onMidi(CLOCK, 5000); // gap > 1 s
    expect(t.estimate()).toBeNull();
    t.onMidi([0xfc], 5001);
    expect(t.estimate()).toBeNull();
  });

  it('ignores non-clock messages and zero gaps', () => {
    const t = new TempoEstimator();
    t.onMidi(CLOCK, 0);
    t.onMidi([0x90, 60, 1], 10);
    t.onMidi(CLOCK, 0); // duplicate timestamp
    expect(t.estimate()).toBeNull();
  });
});
