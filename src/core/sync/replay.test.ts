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

/**
 * Scenario assertions on the traces recorded 2026-11-10 (Live 12 Lite 12.4.16, 120 bpm, 4/4). They pin
 * what Live actually sends (docs/spikes/README.md G3): Start alone on the very first play from 1.1.1,
 * `SPP + Start` on later plays from the start marker, `SPP, Stop, SPP, Continue` when starting mid-song,
 * `Stop, SPP, Continue` on a seek while playing, a lone `SPP` on a stopped seek, one stray Clock a few ms
 * after every Stop, and nothing at all on an Arrangement loop wrap.
 */
describe('recorded G3 traces: scenario assertions', () => {
  const recorded = import.meta.glob<Trace>('../../../docs/spikes/traces/*.json', {
    eager: true,
    import: 'default',
  });
  const find = (prefix: string) => {
    const key = Object.keys(recorded).find((f) => f.includes(`/g3-${prefix}-2026-11-10`));
    return key ? recorded[key]! : null;
  };
  const replay = (t: Trace, originBar = 1) =>
    replayTrace(new ClockEngine({ meter: M44, originBar }), t, { endAt: Infinity });
  const isBytes = (s: { event: unknown }, b: readonly number[]) =>
    typeof s.event === 'object' && s.event !== null && 'bytes' in s.event && s.event.bytes[0] === b[0];
  const after = (steps: ReturnType<typeof replay>, b: readonly number[], nth = 0) => {
    const idx = steps.map((s, i) => (isBytes(s, b) ? i : -1)).filter((i) => i >= 0)[nth];
    return idx === undefined ? null : steps[idx]!;
  };

  it.skipIf(!find('start-from-1.1.1'))(
    'start from 1.1.1: Start alone, then SPP 0 + Start on the second play',
    () => {
      const steps = replay(find('start-from-1.1.1')!);
      const start = after(steps, START)!;
      expect(start.snapshot).toMatchObject({ state: 'playing', ticks: 0 });
      // 383 clocks: the first occupies tick 0 → tick 382 = bar 4 tick 94
      const stop = after(steps, STOP)!;
      expect(stop.snapshot.state).toBe('stopped');
      expect(stop.snapshot.position).toMatchObject({ liveBar: 4, tickInBar: 94 });
      // The stray Clock a few ms after Stop must not move anything or raise lostClock.
      const stray = steps[steps.indexOf(stop) + 1]!;
      expect(isBytes(stray, [0xf8])).toBe(true);
      expect(stray.snapshot).toMatchObject({ state: 'stopped', ticks: 382 });
      const second = after(steps, START, 1)!;
      expect(second.snapshot).toMatchObject({ state: 'playing', ticks: 0 });
      expect(steps.some((s) => s.event === 'timeout')).toBe(false);
    },
  );

  it.skipIf(!find('start-mid-song'))(
    'start mid-song: SPP, Stop, SPP, Continue → playing from the SPP position',
    () => {
      const steps = replay(find('start-mid-song')!);
      const cont = after(steps, CONTINUE)!;
      expect(cont.snapshot.state).toBe('playing');
      const firstClock = steps[steps.indexOf(cont) + 1]!;
      expect(firstClock.snapshot.ticks).toBe(255 * 6); // SPP 255 sixteenths → tick 1530
      expect(firstClock.snapshot.position).toMatchObject({ liveBar: 16, tickInBar: 90 });
      expect(steps.at(-1)!.snapshot.state).toBe('stopped');
    },
  );

  it.skipIf(!find('seek-while-stopped'))(
    'seek while playing (captured in the stopped-seek file): Stop, SPP 128, Continue → bar 9',
    () => {
      const steps = replay(find('seek-while-stopped')!);
      const cont = after(steps, CONTINUE)!;
      const firstClock = steps[steps.indexOf(cont) + 1]!;
      expect(firstClock.snapshot).toMatchObject({ state: 'playing', ticks: 128 * 6 });
      expect(firstClock.snapshot.position).toMatchObject({ liveBar: 9, tickInBar: 0 });
    },
  );

  it.skipIf(!find('stop'))(
    'stop twice: the second Stop returns to 1.1.1 as a lone SPP 0 while stopped',
    () => {
      const steps = replay(find('stop')!);
      const last = steps.at(-1)!;
      expect(isBytes(last, [0xf2])).toBe(true);
      expect(last.snapshot).toMatchObject({ state: 'stopped', ticks: 0 });
      expect(last.snapshot.position).toMatchObject({ liveBar: 1, tickInBar: 0 });
    },
  );

  it.skipIf(!find('loop-wrap'))(
    'loop wrap: Live sends nothing at the wrap; ticks keep counting past the loop end',
    () => {
      const steps = replay(find('loop-wrap')!);
      const cont = after(steps, CONTINUE, 1)!; // SPP 67 + Continue starts the looped run
      const idx = steps.indexOf(cont);
      const run = steps.slice(
        idx + 1,
        steps.findIndex((s, i) => i > idx && isBytes(s, STOP)),
      );
      expect(run.every((s) => isBytes(s, [0xf8]))).toBe(true);
      expect(run).toHaveLength(826);
      // 67 sixteenths + 825 ticks → bar 13: the loop (bars 5–8) wrapped about twice with no message.
      expect(run.at(-1)!.snapshot.position).toMatchObject({ liveBar: 13 });
    },
  );

  it.skipIf(!find('long-stop-then-continue'))(
    'long stop: a 5-minute stop produces no timeout; play resumes with SPP 0 + Start',
    () => {
      const steps = replay(find('long-stop-then-continue')!);
      expect(steps.some((s) => s.event === 'timeout')).toBe(false);
      expect(after(steps, START, 1)!.snapshot).toMatchObject({ state: 'playing', ticks: 0 });
    },
  );

  it.skipIf(!find('reconnect-while-running'))(
    'reconnect while running: the IAC clock is unaffected by the Launchpad replug',
    () => {
      const steps = replay(find('reconnect-while-running')!);
      expect(steps.some((s) => s.event === 'timeout')).toBe(false);
      expect(after(steps, STOP)!.snapshot.ticks).toBe(804);
    },
  );
});
