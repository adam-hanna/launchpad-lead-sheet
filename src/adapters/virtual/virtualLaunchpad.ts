import { LAYOUT_NOTE, LAYOUT_PROGRAMMER, type LaunchpadPort, type Unsubscribe } from '@core/device';
import { isGridPad, type PadIndex } from '@core/grid';
import { emptyFrame, type Frame, type LedSpec } from '@core/lighting';

export interface VirtualState {
  readonly frame: Frame;
  readonly layout: number;
  /** Forwarded clock ticks since the last Start (drives flash phase like the hardware does). */
  readonly clockTicks: number;
  readonly running: boolean;
  readonly pressed: ReadonlySet<PadIndex>;
}

type PadCb = (pad: PadIndex, velocity: number, timestamp: number) => void;
type ButtonCb = (button: PadIndex, value: number, timestamp: number) => void;
type PressureCb = (pad: PadIndex, value: number, timestamp: number) => void;
type ChannelPressureCb = (value: number, timestamp: number) => void;
type LayoutCb = (layout: number, page: number) => void;

/**
 * An in-memory Launchpad implementing the same port as the hardware driver (plan §3.1). It keeps the
 * frame the app has painted, mirrors Programmer/Live mode switches as layout notifications, counts
 * forwarded clock for flash phase, and lets a UI (or a test) press pads and buttons.
 */
export class VirtualLaunchpad implements LaunchpadPort {
  private frame: Frame = emptyFrame();
  private layout = LAYOUT_NOTE;
  private clockTicks = 0;
  private running = false;
  private readonly pressed = new Set<PadIndex>();
  private readonly pads = new Set<PadCb>();
  private readonly buttons = new Set<ButtonCb>();
  private readonly poly = new Set<PressureCb>();
  private readonly channel = new Set<ChannelPressureCb>();
  private readonly layouts = new Set<LayoutCb>();
  private readonly listeners = new Set<(state: VirtualState) => void>();
  /** Test hook: make `send` report failure. */
  failSends = false;
  private cached: VirtualState | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  // ---- LaunchpadPort --------------------------------------------------------------------------------

  send(specs: readonly LedSpec[]): boolean {
    if (this.failSends) return false;
    if (specs.length === 0) return true;
    const next = new Map(this.frame);
    for (const { pad, state } of specs) if (next.has(pad)) next.set(pad, state);
    this.frame = next;
    this.notify();
    return true;
  }

  forwardClock(data: ArrayLike<number>): void {
    switch (data[0]) {
      case 0xf8: // Clock
        if (this.running) this.clockTicks += 1;
        break;
      case 0xfa: // Start
        this.clockTicks = 0;
        this.running = true;
        break;
      case 0xfb: // Continue
        this.running = true;
        break;
      case 0xfc: // Stop
        this.running = false;
        break;
      default:
        return;
    }
    this.notify();
  }

  enterProgrammerMode(): boolean {
    this.setLayout(LAYOUT_PROGRAMMER);
    return true;
  }

  restoreLiveMode(): boolean {
    this.setLayout(LAYOUT_NOTE);
    return true;
  }

  requestLayout(): boolean {
    for (const cb of this.layouts) cb(this.layout, 0);
    return true;
  }

  onPad(cb: PadCb): Unsubscribe {
    this.pads.add(cb);
    return () => this.pads.delete(cb);
  }
  onButton(cb: ButtonCb): Unsubscribe {
    this.buttons.add(cb);
    return () => this.buttons.delete(cb);
  }
  onPolyPressure(cb: PressureCb): Unsubscribe {
    this.poly.add(cb);
    return () => this.poly.delete(cb);
  }
  onChannelPressure(cb: ChannelPressureCb): Unsubscribe {
    this.channel.add(cb);
    return () => this.channel.delete(cb);
  }
  onLayoutChanged(cb: LayoutCb): Unsubscribe {
    this.layouts.add(cb);
    return () => this.layouts.delete(cb);
  }

  // ---- the "fingers" --------------------------------------------------------------------------------

  press(pad: PadIndex, velocity = 100): void {
    if (!isGridPad(pad) || this.pressed.has(pad)) return;
    this.pressed.add(pad);
    for (const cb of this.pads) cb(pad, Math.max(1, Math.min(127, velocity)), this.now());
    this.notify();
  }

  release(pad: PadIndex): void {
    if (!this.pressed.delete(pad)) return;
    for (const cb of this.pads) cb(pad, 0, this.now());
    this.notify();
  }

  /** Release everything (pointer cancel, blur, page hide: plan §4.2). */
  releaseAll(): void {
    for (const pad of [...this.pressed]) this.release(pad);
  }

  pressButton(button: PadIndex, value = 127): void {
    for (const cb of this.buttons) cb(button, value, this.now());
  }

  releaseButton(button: PadIndex): void {
    for (const cb of this.buttons) cb(button, 0, this.now());
  }

  polyPressure(pad: PadIndex, value: number): void {
    if (!isGridPad(pad)) return;
    for (const cb of this.poly) cb(pad, value, this.now());
  }

  channelPressure(value: number): void {
    for (const cb of this.channel) cb(value, this.now());
  }

  /** Simulate the device being switched to another view (Live's script, the Setup button). */
  simulateLayout(layout: number): void {
    this.setLayout(layout);
  }

  // ---- observation ----------------------------------------------------------------------------------

  /** Snapshot, cached until the next change so useSyncExternalStore sees a stable reference. */
  state(): VirtualState {
    this.cached ??= {
      frame: this.frame,
      layout: this.layout,
      clockTicks: this.clockTicks,
      running: this.running,
      pressed: new Set(this.pressed),
    };
    return this.cached;
  }

  subscribe(listener: (state: VirtualState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setLayout(layout: number): void {
    this.layout = layout;
    for (const cb of this.layouts) cb(layout, 0);
    this.notify();
  }

  private notify(): void {
    this.cached = null;
    const s = this.state();
    for (const l of this.listeners) l(s);
  }
}
