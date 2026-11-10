import { toSheetBar, type Meter } from '../sheet';
import { positionFromTicks, sppToTicks, type BarPosition } from './meterMath';

/** MIDI realtime and system-common status bytes we consume (plan §4.4). */
export const MIDI_CLOCK = 0xf8; // Timing Clock
export const MIDI_START = 0xfa; // Start
export const MIDI_CONTINUE = 0xfb; // Continue
export const MIDI_STOP = 0xfc; // Stop
export const MIDI_SPP = 0xf2; // Song Position Pointer

export type PlayIntent = 'play' | 'stop';
export type TransportUiState = 'unsynced' | 'playing' | 'stopped' | 'lostClock';

export interface Position extends BarPosition {
  /** 1-based sheet bar after the origin offset, or null before the origin. */
  readonly sheetBar: number | null;
}

export interface TransportSnapshot {
  readonly intent: PlayIntent;
  readonly valid: boolean;
  readonly timedOut: boolean;
  readonly clockInputConnected: boolean;
  /** Absolute ticks since 1.1.1; meaningful only when `valid`. */
  readonly ticks: number;
  /** True between Start/Continue/SPP and the first Clock that occupies the position. */
  readonly pendingFirstClock: boolean;
  readonly state: TransportUiState;
  /** Derived from ticks while `valid`; null otherwise. */
  readonly position: Position | null;
}

export interface ClockEngineOptions {
  readonly meter: Meter;
  readonly originBar?: number;
  /** Clock timeout in ms (plan §4.4: 500). */
  readonly timeoutMs?: number;
}

export type Listener = (snapshot: TransportSnapshot, previous: TransportSnapshot) => void;

/**
 * Transport follower (plan §4.4). Pure state machine: feed it MIDI bytes with their timestamps and call
 * `checkTimeout(now)` periodically (or at `nextDeadline()`); it never reads a clock itself and never
 * infers progress from wall time.
 */
export class ClockEngine {
  private meter: Meter;
  private originBar: number;
  /** Display compensation in ticks (plan §4.4 should-have); never changes counted ticks. */
  private tickOffset = 0;
  private readonly timeoutMs: number;

  private intent: PlayIntent = 'stop';
  private valid = false;
  private timedOut = false;
  private clockInputConnected = true;
  private ticks = 0;
  private pendingFirstClock = false;
  private timerArmed = false;
  private lastClockAt = 0;

  private readonly listeners = new Set<Listener>();
  private last: TransportSnapshot;

  constructor(options: ClockEngineOptions) {
    this.meter = options.meter;
    this.originBar = options.originBar ?? 1;
    this.timeoutMs = options.timeoutMs ?? 500;
    this.last = this.snapshot();
  }

  // ---- configuration ----------------------------------------------------------------------------

  setMeter(meter: Meter): void {
    this.meter = meter;
    this.emit();
  }

  setOriginBar(originBar: number): void {
    this.originBar = originBar;
    this.emit();
  }

  setTickOffset(ticks: number): void {
    this.tickOffset = Math.trunc(ticks);
    this.emit();
  }

  // ---- inputs ------------------------------------------------------------------------------------

  /** Feed one MIDI message from the clock input. `timestamp` is the message's own time in ms. */
  onMidi(data: ArrayLike<number>, timestamp: number): void {
    const status = data[0];
    switch (status) {
      case MIDI_START:
        this.ticks = 0;
        this.pendingFirstClock = true;
        this.valid = true;
        this.intent = 'play';
        this.arm(timestamp);
        break;
      case MIDI_SPP:
        this.ticks = sppToTicks(data[1] ?? 0, data[2] ?? 0);
        this.pendingFirstClock = true;
        this.valid = true;
        // The plan's table says "timer armed"; arming only while intent = play keeps a seek while
        // stopped from timing out into unsynced (there are no clocks to re-arm it while stopped).
        if (this.intent === 'play') this.arm(timestamp);
        else this.timedOut = false;
        break;
      case MIDI_CONTINUE:
        this.intent = 'play';
        this.pendingFirstClock = true;
        this.arm(timestamp);
        break;
      case MIDI_STOP:
        this.intent = 'stop';
        this.timerArmed = false;
        break;
      case MIDI_CLOCK:
        if (this.intent !== 'play') return; // ignored while stopped
        if (this.pendingFirstClock) this.pendingFirstClock = false;
        else this.ticks += 1;
        this.lastClockAt = timestamp;
        this.timerArmed = true;
        break;
      default:
        return; // not ours
    }
    this.emit();
  }

  /** The clock input port went away: position cannot be trusted and we cannot know if Live plays. */
  onClockInputDisconnected(): void {
    this.clockInputConnected = false;
    this.valid = false;
    this.intent = 'stop';
    this.timerArmed = false;
    this.emit();
  }

  /** Port is back; validity stays false until Start or SPP. */
  onClockInputConnected(): void {
    this.clockInputConnected = true;
    this.emit();
  }

  /**
   * Fire the clock timeout if armed and overdue. Hosts call this on a short interval or at
   * `nextDeadline()`. Returns true when the timeout fired.
   */
  checkTimeout(now: number): boolean {
    if (!this.timerArmed || now - this.lastClockAt <= this.timeoutMs) return false;
    this.timerArmed = false;
    this.timedOut = true;
    this.valid = false;
    this.emit();
    return true;
  }

  /** When `checkTimeout` next needs to run, or null when the timer is not armed. */
  nextDeadline(): number | null {
    return this.timerArmed ? this.lastClockAt + this.timeoutMs + 1 : null;
  }

  // ---- outputs -----------------------------------------------------------------------------------

  snapshot(): TransportSnapshot {
    const state = this.uiState();
    const position = this.valid ? this.position() : null;
    return {
      intent: this.intent,
      valid: this.valid,
      timedOut: this.timedOut,
      clockInputConnected: this.clockInputConnected,
      ticks: this.ticks,
      pendingFirstClock: this.pendingFirstClock,
      state,
      position,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- internals ---------------------------------------------------------------------------------

  private arm(timestamp: number): void {
    this.lastClockAt = timestamp;
    this.timerArmed = true;
    this.timedOut = false;
  }

  /** UI state precedence, first match wins (plan §4.4). */
  private uiState(): TransportUiState {
    if (this.intent === 'play' && this.timedOut) return 'lostClock';
    if (!this.valid) return 'unsynced';
    if (this.intent === 'play') return 'playing';
    return 'stopped';
  }

  private position(): Position {
    const bar = positionFromTicks(Math.max(0, this.ticks + this.tickOffset), this.meter);
    return { ...bar, sheetBar: toSheetBar(bar.liveBar, this.originBar) };
  }

  private emit(): void {
    const next = this.snapshot();
    const prev = this.last;
    if (sameSnapshot(prev, next)) return;
    this.last = next;
    for (const l of this.listeners) l(next, prev);
  }
}

function sameSnapshot(a: TransportSnapshot, b: TransportSnapshot): boolean {
  return (
    a.intent === b.intent &&
    a.valid === b.valid &&
    a.timedOut === b.timedOut &&
    a.clockInputConnected === b.clockInputConnected &&
    a.ticks === b.ticks &&
    a.pendingFirstClock === b.pendingFirstClock &&
    a.state === b.state &&
    a.position?.sheetBar === b.position?.sheetBar &&
    a.position?.liveBar === b.position?.liveBar
  );
}
