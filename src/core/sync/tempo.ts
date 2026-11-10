import { MIDI_CLOCK, MIDI_START, MIDI_STOP } from './clockEngine';
import { TICKS_PER_QUARTER } from './meterMath';

/**
 * Smoothed tempo estimate for display only (plan §4.4: logic never depends on it). Exponential moving
 * average over clock intervals; resets on Start and Stop and after a gap longer than `gapResetMs`.
 */
export class TempoEstimator {
  private lastClockAt: number | null = null;
  private bpm: number | null = null;

  constructor(
    private readonly smoothing = 0.1,
    private readonly gapResetMs = 1000,
  ) {}

  onMidi(data: ArrayLike<number>, timestamp: number): void {
    const status = data[0];
    if (status === MIDI_START || status === MIDI_STOP) {
      this.reset();
      return;
    }
    if (status !== MIDI_CLOCK) return;
    if (this.lastClockAt !== null) {
      const gap = timestamp - this.lastClockAt;
      if (gap <= 0 || gap > this.gapResetMs) {
        this.bpm = null;
      } else {
        const instant = 60_000 / (gap * TICKS_PER_QUARTER);
        this.bpm = this.bpm === null ? instant : this.bpm + (instant - this.bpm) * this.smoothing;
      }
    }
    this.lastClockAt = timestamp;
  }

  /** Current estimate in BPM, or null when unknown. */
  estimate(): number | null {
    return this.bpm;
  }

  reset(): void {
    this.lastClockAt = null;
    this.bpm = null;
  }
}
