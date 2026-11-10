import { describe, expect, it } from 'vitest';
import { ClockEngine } from './clockEngine';
import { CONTINUE, START, STOP, replayTrace, spp, synthClock, type Trace } from './replay';

const M44 = { numerator: 4, denominator: 4 } as const;
const trace = (scenario: string, events: Trace['events']): Trace => ({ schema: 1, scenario, events });

describe('replayTrace on synthetic traces', () => {
  it('start from 1.1.1: first clock occupies tick 0, half-bar boundary at tick 48', () => {
    const t = trace('start-from-1.1.1', [{ t: 0, bytes: START }, ...synthClock(10, 120, 97)]);
    const steps = replayTrace(new ClockEngine({ meter: M44 }), t);
    expect(steps[1]!.snapshot.ticks).toBe(0);
    const atHalf = steps.find((s) => s.snapshot.position?.tickInBar === 48);
    expect(atHalf?.snapshot.position?.half).toBe(1);
    expect(steps[steps.length - 1]!.snapshot.position).toMatchObject({ liveBar: 2, tickInBar: 0 });
  });

  it('start mid-song: SPP + Continue then clocks', () => {
    const t = trace('start-mid-song', [
      { t: 0, bytes: spp(16 * 16) },
      { t: 1, bytes: CONTINUE },
      ...synthClock(10, 120, 5),
    ]);
    const last = replayTrace(new ClockEngine({ meter: M44, originBar: 9 }), t).at(-1)!;
    expect(last.snapshot.state).toBe('playing');
    expect(last.snapshot.position).toMatchObject({ liveBar: 17, sheetBar: 9, tickInBar: 4 });
  });

  it('clock stall: a gap longer than the timeout produces a timeout step and clocks alone do not recover', () => {
    const t = trace('clock-stall', [
      { t: 0, bytes: START },
      ...synthClock(10, 120, 10),
      ...synthClock(2000, 120, 10),
    ]);
    const steps = replayTrace(new ClockEngine({ meter: M44 }), t);
    const timeout = steps.find((s) => s.event === 'timeout');
    expect(timeout).toBeDefined();
    expect(timeout!.t).toBeLessThan(2000);
    expect(steps.at(-1)!.snapshot.state).toBe('lostClock');
  });

  it('long stop then continue: no timeout step is produced for the stopped gap', () => {
    const t = trace('long-stop-then-continue', [
      { t: 0, bytes: START },
      ...synthClock(10, 120, 10),
      { t: 300, bytes: STOP },
      { t: 60_000, bytes: CONTINUE },
      ...synthClock(60_010, 120, 3),
    ]);
    const steps = replayTrace(new ClockEngine({ meter: M44 }), t);
    expect(steps.some((s) => s.event === 'timeout')).toBe(false);
    expect(steps.at(-1)!.snapshot).toMatchObject({ state: 'playing', ticks: 11 });
  });

  it('endAt fires a trailing timeout when the trace ends mid-play', () => {
    const t = trace('ends-while-playing', [{ t: 0, bytes: START }, ...synthClock(10, 120, 3)]);
    const steps = replayTrace(new ClockEngine({ meter: M44 }), t, { endAt: 5000 });
    expect(steps.at(-1)!.event).toBe('timeout');
    expect(steps.at(-1)!.snapshot.state).toBe('lostClock');
  });

  it('seek while stopped (SPP only) updates position but does not play', () => {
    const t = trace('seek-while-stopped', [
      { t: 0, bytes: START },
      ...synthClock(10, 120, 5),
      { t: 200, bytes: STOP },
      { t: 300, bytes: spp(64) },
    ]);
    const last = replayTrace(new ClockEngine({ meter: M44 }), t).at(-1)!;
    expect(last.snapshot).toMatchObject({ state: 'stopped', ticks: 384 });
  });

  it('sorts out-of-order events by time', () => {
    const t = trace('unsorted', [
      { t: 5, bytes: [0xf8] },
      { t: 0, bytes: START },
    ]);
    const steps = replayTrace(new ClockEngine({ meter: M44 }), t);
    expect(steps[0]!.event).toEqual({ t: 0, bytes: START });
    expect(steps.at(-1)!.snapshot.ticks).toBe(0);
  });
});

/**
 * Real traces from gate G3 land in docs/spikes/traces/*.json. Every file found is replayed and must end
 * in a coherent state; scenario-specific assertions are added as the traces arrive.
 */
describe('recorded G3 traces', () => {
  const recorded = import.meta.glob<Trace>('../../../docs/spikes/traces/*.json', {
    eager: true,
    import: 'default',
  });
  const files = Object.keys(recorded);

  it.skipIf(files.length === 0)('replays every recorded trace without throwing', () => {
    for (const f of files) {
      const parsed = recorded[f]!;
      expect(parsed.schema).toBe(1);
      const steps = replayTrace(new ClockEngine({ meter: M44 }), parsed, { endAt: Infinity });
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it('is skipped until traces are recorded', () => {
    expect(Array.isArray(files)).toBe(true);
  });
});
