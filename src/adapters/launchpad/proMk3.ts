import {
  CHANNEL_PRESSURE,
  CONTROL_CHANGE,
  FORWARDED_REALTIME,
  NOTE_OFF,
  NOTE_ON,
  POLY_PRESSURE,
  decodeLayoutMessage,
  layoutQueryMessage,
  modeMessage,
  type LaunchpadPort,
  type Unsubscribe,
} from '@core/device';
import { isGridPad, type PadIndex } from '@core/grid';
import { encodeLedSysEx, type LedSpec } from '@core/lighting';
import type { WebMidi } from '@adapters/midi';

type PadCb = (pad: PadIndex, velocity: number, timestamp: number) => void;
type ButtonCb = (button: PadIndex, value: number, timestamp: number) => void;
type PressureCb = (pad: PadIndex, value: number, timestamp: number) => void;
type ChannelPressureCb = (value: number, timestamp: number) => void;
type LayoutCb = (layout: number, page: number) => void;

/**
 * Launchpad Pro MK3 in Programmer mode over the `LPProMK3 MIDI` port pair (docs/launchpad-protocol.md).
 * Decodes pad/button/pressure/layout input and encodes LED frames; no ownership or routing logic here.
 */
export class ProMk3Port implements LaunchpadPort {
  private readonly pads = new Set<PadCb>();
  private readonly buttons = new Set<ButtonCb>();
  private readonly poly = new Set<PressureCb>();
  private readonly channel = new Set<ChannelPressureCb>();
  private readonly layouts = new Set<LayoutCb>();
  private readonly unsubscribeInput: Unsubscribe;

  constructor(
    private readonly midi: WebMidi,
    private readonly inputId: string,
    private readonly outputId: string,
  ) {
    this.unsubscribeInput = midi.subscribeInput(inputId, (data, ts) => {
      this.decode(data, ts);
    });
  }

  get ids(): { readonly inputId: string; readonly outputId: string } {
    return { inputId: this.inputId, outputId: this.outputId };
  }

  send(specs: readonly LedSpec[]): boolean {
    let ok = true;
    for (const msg of encodeLedSysEx(specs)) ok = this.midi.send(this.outputId, msg) && ok;
    return ok;
  }

  forwardClock(data: ArrayLike<number>): void {
    const status = data[0];
    if (status !== undefined && FORWARDED_REALTIME.has(status)) this.midi.send(this.outputId, [status]);
  }

  enterProgrammerMode(): boolean {
    return this.midi.send(this.outputId, modeMessage(true));
  }

  restoreLiveMode(): boolean {
    return this.midi.send(this.outputId, modeMessage(false));
  }

  requestLayout(): boolean {
    return this.midi.send(this.outputId, layoutQueryMessage());
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

  dispose(): void {
    this.unsubscribeInput();
    this.pads.clear();
    this.buttons.clear();
    this.poly.clear();
    this.channel.clear();
    this.layouts.clear();
  }

  private decode(data: Uint8Array, ts: number): void {
    const status = data[0];
    if (status === undefined) return;
    if (status === 0xf0) {
      const layout = decodeLayoutMessage(data);
      if (layout) for (const cb of this.layouts) cb(layout.layout, layout.page);
      return;
    }
    const kind = status & 0xf0;
    const d1 = data[1] ?? 0;
    const d2 = data[2] ?? 0;
    switch (kind) {
      case NOTE_ON:
      case NOTE_OFF: {
        // The device sends Note On with velocity 0 for releases; Note Off is normalised to velocity 0 too.
        const velocity = kind === NOTE_OFF ? 0 : d2;
        if (isGridPad(d1)) for (const cb of this.pads) cb(d1, velocity, ts);
        return;
      }
      case CONTROL_CHANGE:
        for (const cb of this.buttons) cb(d1, d2, ts);
        return;
      case POLY_PRESSURE:
        if (isGridPad(d1)) for (const cb of this.poly) cb(d1, d2, ts);
        return;
      case CHANNEL_PRESSURE:
        for (const cb of this.channel) cb(d1, ts);
        return;
      default:
        return;
    }
  }
}
