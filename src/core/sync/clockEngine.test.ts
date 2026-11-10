import { describe, expect, it } from 'vitest';
import { ClockEngine, type TransportSnapshot } from './clockEngine';
import { CONTINUE, START, STOP, spp } from './replay';

const M44 = { numerator: 4, denominator: 4 } as const;
const CLOCK = [0xf8];

function engine(opts: { originBar?: number; timeoutMs?: number } = {}) {
  return new ClockEngine({ meter: M44, ...opts });
}
/** Send `n` clocks starting at `t0`, `dt` apart; returns the time after the last one. */
function clocks(e: ClockEngine, n: number, t0: number, dt = 20): number {
  for (let i = 0; i < n; i++) e.onMidi(CLOCK, t0 + i * dt);
  return t0 + (n - 1) * dt;
}

describe('ClockEngine: initial and Start', () => {
  it('starts unsynced with stop intent and no position', () => {
    const s = engine().snapshot();
    expect(s).toMatchObject({ state: 'unsynced', intent: 'stop', valid: false, position: null });
  });

  it('Start sets 1.1.1 pending; the first Clock occupies tick 0, later clocks advance', () => {
    const e = engine();
    e.onMidi(START, 0);
    expect(e.snapshot()).toMatchObject({ state: 'playing', valid: true, ticks: 0, pendingFirstClock: true });
    e.onMidi(CLOCK, 10);
    expect(e.snapshot()).toMatchObject({ ticks: 0, pendingFirstClock: false });
    clocks(e, 95, 30);
    expect(e.snapshot().ticks).toBe(95);
    expect(e.snapshot().position).toMatchObject({ liveBar: 1, beat: 4, tickInBar: 95 });
    e.onMidi(CLOCK, 2000);
    expect(e.snapshot().position).toMatchObject({ liveBar: 2, beat: 1, tickInBar: 0, sheetBar: 2 });
  });
});

describe('ClockEngine: SPP and origin (plan §4.4 acceptance)', () => {
  it('start at Live bar 17 with originBar 9 → sheet bar 9', () => {
    const e = engine({ originBar: 9 });
    e.onMidi(spp(16 * 16), 0); // bar 17 = 16 bars * 16 sixteenths
    e.onMidi(CONTINUE, 1);
    e.onMidi(CLOCK, 2);
    expect(e.snapshot().position).toMatchObject({ liveBar: 17, sheetBar: 9 });
    expect(e.snapshot().state).toBe('playing');
  });

  it('before the origin the sheet bar is null', () => {
    const e = engine({ originBar: 9 });
    e.onMidi(START, 0);
    expect(e.snapshot().position?.sheetBar).toBeNull();
  });

  it('SPP while stopped updates position without playing and never times out', () => {
    const e = engine();
    e.onMidi(spp(32), 0);
    expect(e.snapshot()).toMatchObject({ state: 'stopped', valid: true, intent: 'stop' });
    expect(e.snapshot().position?.liveBar).toBe(3);
    expect(e.nextDeadline()).toBeNull();
    expect(e.checkTimeout(10_000)).toBe(false);
    expect(e.snapshot().state).toBe('stopped');
  });

  it('SPP alone never changes play intent (receiver rule)', () => {
    const e = engine();
    e.onMidi(START, 0);
    clocks(e, 10, 1);
    e.onMidi(spp(64), 500);
    expect(e.snapshot()).toMatchObject({ intent: 'play', ticks: 384, pendingFirstClock: true });
    e.onMidi(STOP, 600);
    e.onMidi(spp(0), 700);
    expect(e.snapshot()).toMatchObject({ intent: 'stop', ticks: 0, state: 'stopped' });
  });
});

describe('ClockEngine: Stop and Continue', () => {
  it('Stop keeps position and disarms the timer; Continue resumes with the first clock occupying the position', () => {
    const e = engine();
    e.onMidi(START, 0);
    clocks(e, 49, 1); // ticks 0..48
    e.onMidi(STOP, 100);
    expect(e.snapshot()).toMatchObject({ state: 'stopped', ticks: 48, valid: true });
    expect(e.nextDeadline()).toBeNull();
    // clocks while stopped are ignored
    e.onMidi(CLOCK, 110);
    expect(e.snapshot().ticks).toBe(48);
    // long stop, then Continue: no instant timeout from the stale timestamp
    e.onMidi(CONTINUE, 60_000);
    expect(e.checkTimeout(60_001)).toBe(false);
    expect(e.snapshot().state).toBe('playing');
    e.onMidi(CLOCK, 60_010);
    expect(e.snapshot().ticks).toBe(48);
    e.onMidi(CLOCK, 60_030);
    expect(e.snapshot().ticks).toBe(49);
  });

  it('Continue with no valid position stays unsynced, not bar 1', () => {
    const e = engine();
    e.onMidi(CONTINUE, 0);
    clocks(e, 10, 1);
    expect(e.snapshot()).toMatchObject({ state: 'unsynced', valid: false, intent: 'play', position: null });
  });
});

describe('ClockEngine: timeout and recovery', () => {
  it('clock loss → lostClock; clocks alone never restore validity; SPP does', () => {
    const e = engine({ timeoutMs: 500 });
    e.onMidi(START, 0);
    const last = clocks(e, 10, 1);
    expect(e.nextDeadline()).toBe(last + 501);
    expect(e.checkTimeout(last + 400)).toBe(false);
    expect(e.checkTimeout(last + 600)).toBe(true);
    expect(e.snapshot()).toMatchObject({ state: 'lostClock', valid: false, timedOut: true, position: null });
    expect(e.checkTimeout(last + 700)).toBe(false); // fires once
    clocks(e, 50, last + 1000);
    expect(e.snapshot().state).toBe('lostClock');
    e.onMidi(spp(16), last + 2100);
    expect(e.snapshot()).toMatchObject({ state: 'playing', valid: true, timedOut: false });
    e.onMidi(CLOCK, last + 2110);
    expect(e.snapshot().position).toMatchObject({ liveBar: 2, tickInBar: 0 });
  });

  it('Stop after a timeout shows unsynced (precedence), Start recovers', () => {
    const e = engine();
    e.onMidi(START, 0);
    e.onMidi(CLOCK, 1);
    e.checkTimeout(1000);
    e.onMidi(STOP, 1001);
    expect(e.snapshot().state).toBe('unsynced');
    e.onMidi(START, 1002);
    expect(e.snapshot().state).toBe('playing');
  });
});

describe('ClockEngine: clock input port', () => {
  it('disconnect invalidates and stops; reconnect keeps it unsynced until Start/SPP', () => {
    const e = engine();
    e.onMidi(START, 0);
    clocks(e, 5, 1);
    e.onClockInputDisconnected();
    expect(e.snapshot()).toMatchObject({
      state: 'unsynced',
      valid: false,
      intent: 'stop',
      clockInputConnected: false,
    });
    expect(e.nextDeadline()).toBeNull();
    e.onClockInputConnected();
    expect(e.snapshot()).toMatchObject({ state: 'unsynced', clockInputConnected: true });
    e.onMidi(spp(0), 100);
    expect(e.snapshot().state).toBe('stopped');
  });
});

describe('ClockEngine: configuration, subscription, ignored input', () => {
  it('setMeter and setOriginBar re-derive the position', () => {
    const e = engine();
    e.onMidi(START, 0);
    clocks(e, 73, 1); // tick 72
    expect(e.snapshot().position).toMatchObject({ liveBar: 1, beat: 4 });
    e.setMeter({ numerator: 3, denominator: 4 });
    expect(e.snapshot().position).toMatchObject({ liveBar: 2, beat: 1, tickInBar: 0 });
    e.setOriginBar(2);
    expect(e.snapshot().position?.sheetBar).toBe(1);
  });

  it('notifies listeners only on change and unsubscribes', () => {
    const e = engine();
    const seen: TransportSnapshot[] = [];
    const off = e.subscribe((s) => seen.push(s));
    e.onMidi([0x90, 60, 100], 0); // note on: not ours
    e.onMidi([0xfe], 0); // active sensing: not ours
    expect(seen).toHaveLength(0);
    e.onMidi(START, 0);
    e.onMidi(CLOCK, 1); // occupies: ticks unchanged but pendingFirstClock flips → change
    e.onMidi(CLOCK, 2);
    expect(seen.map((s) => s.state)).toEqual(['playing', 'playing', 'playing']);
    e.onMidi(STOP, 3);
    e.onMidi(STOP, 4); // no change
    expect(seen).toHaveLength(4);
    off();
    e.onMidi(START, 5);
    expect(seen).toHaveLength(4);
  });
});

describe('ClockEngine: tick offset (plan §4.4 should-have)', () => {
  it('shifts the displayed position without touching counted ticks and never goes below 1.1.1', () => {
    const e = engine();
    e.onMidi(START, 0);
    clocks(e, 11, 1); // tick 10
    e.setTickOffset(3);
    expect(e.snapshot().ticks).toBe(10);
    expect(e.snapshot().position?.tickInBar).toBe(13);
    e.setTickOffset(-20);
    expect(e.snapshot().position).toMatchObject({ liveBar: 1, tickInBar: 0 });
    e.setTickOffset(96);
    expect(e.snapshot().position).toMatchObject({ liveBar: 2, tickInBar: 10 });
  });
});
