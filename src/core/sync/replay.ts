import { ClockEngine, type TransportSnapshot } from './clockEngine';

/**
 * Trace format recorded by the spike harness (gate G3) and replayed by tests. `t` is milliseconds from
 * the start of the recording; `bytes` is one complete MIDI message.
 */
export interface TraceEvent {
  readonly t: number;
  readonly bytes: readonly number[];
}

export interface Trace {
  readonly schema: 1;
  readonly scenario: string;
  readonly events: readonly TraceEvent[];
  readonly startedAt?: string;
  readonly port?: string | null;
  readonly notes?: string;
}

export interface ReplayStep {
  readonly t: number;
  readonly event: TraceEvent | 'timeout';
  readonly snapshot: TransportSnapshot;
}

/**
 * Feed a trace into an engine in timestamp order, firing the clock timeout wherever a gap between events
 * exceeds the engine's deadline. Returns one step per engine input so tests can assert on any point.
 */
export function replayTrace(
  engine: ClockEngine,
  trace: Trace,
  options: { readonly endAt?: number } = {},
): ReplayStep[] {
  const steps: ReplayStep[] = [];
  const events = [...trace.events].sort((a, b) => a.t - b.t);
  for (const ev of events) {
    const deadline = engine.nextDeadline();
    if (deadline !== null && deadline < ev.t && engine.checkTimeout(deadline)) {
      steps.push({ t: deadline, event: 'timeout', snapshot: engine.snapshot() });
    }
    engine.onMidi(ev.bytes, ev.t);
    steps.push({ t: ev.t, event: ev, snapshot: engine.snapshot() });
  }
  if (options.endAt !== undefined) {
    const deadline = engine.nextDeadline();
    if (deadline !== null && deadline <= options.endAt && engine.checkTimeout(deadline)) {
      steps.push({ t: deadline, event: 'timeout', snapshot: engine.snapshot() });
    }
  }
  return steps;
}

/** Build a synthetic trace: a clock stream at `bpm` for `ticks` ticks starting at `t0`, after `prefix`. */
export function synthClock(t0: number, bpm: number, ticks: number): TraceEvent[] {
  const interval = 60_000 / (bpm * 24);
  return Array.from({ length: ticks }, (_, i) => ({ t: t0 + i * interval, bytes: [0xf8] }));
}

export const START: readonly number[] = [0xfa];
export const CONTINUE: readonly number[] = [0xfb];
export const STOP: readonly number[] = [0xfc];
export function spp(sixteenths: number): readonly number[] {
  return [0xf2, sixteenths & 0x7f, (sixteenths >> 7) & 0x7f];
}
