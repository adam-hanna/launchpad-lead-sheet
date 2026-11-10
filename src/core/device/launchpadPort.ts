import type { PadIndex } from '../grid';
import type { LedSpec } from '../lighting';

export type Unsubscribe = () => void;

/**
 * What the app needs from a Launchpad (plan §3.1). Implemented by the Pro MK3 driver over Web MIDI and by
 * the virtual Launchpad; everything above this interface is hardware-agnostic.
 */
export interface LaunchpadPort {
  /** Send LED specs (chunked into SysEx by the implementation). Returns false if any send failed. */
  send(specs: readonly LedSpec[]): boolean;
  /** Forward a realtime message (Clock/Start/Continue/Stop) so hardware flash follows the beat. */
  forwardClock(data: ArrayLike<number>): void;
  enterProgrammerMode(): boolean;
  restoreLiveMode(): boolean;
  requestLayout(): boolean;

  /** Grid pad press/release; `velocity` 0 is a release. */
  onPad(cb: (pad: PadIndex, velocity: number, timestamp: number) => void): Unsubscribe;
  /** Surrounding buttons (CCs); `value` 0 is a release. */
  onButton(cb: (button: PadIndex, value: number, timestamp: number) => void): Unsubscribe;
  onPolyPressure(cb: (pad: PadIndex, value: number, timestamp: number) => void): Unsubscribe;
  onChannelPressure(cb: (value: number, timestamp: number) => void): Unsubscribe;
  /** The device reports its view whenever it changes (also our means of confirming Programmer mode). */
  onLayoutChanged(cb: (layout: number, page: number) => void): Unsubscribe;
}
