import type { GridMapping, PadIndex } from '../grid';
import type { ResolvedBar } from '../sheet';
import type { TransportUiState } from '../sync';
import { diffFrames, type Frame, type LedSpec, type LedState } from './ledState';
import { resolveRoles, type DisplayMode } from './roles';
import { render, type OffStyle, type Theme } from './theme';

/**
 * Everything the frame depends on (plan §4.3 render dependencies). Changing any field re-renders;
 * bar boundaries are not special.
 */
export interface RenderDeps {
  readonly harmony: ResolvedBar | null;
  readonly half: 0 | 1;
  readonly mapping: GridMapping;
  readonly transport: TransportUiState;
  readonly displayMode: DisplayMode;
  readonly offStyle: OffStyle;
  readonly theme: Theme;
  readonly rootFlash: boolean;
  readonly dark: boolean;
  readonly pressed: ReadonlySet<PadIndex>;
  readonly buttons?: ReadonlyMap<PadIndex, LedState>;
}

export interface RenderResult {
  readonly frame: Frame;
  /** Specs to send: a diff against the device cache, or the complete frame when the cache is invalid. */
  readonly specs: readonly LedSpec[];
  readonly fullRepaint: boolean;
}

/**
 * Owns the device-frame cache (plan §4.3). The diff is only valid against what the device is known to
 * show; `invalidateDevice()` is called on disconnect, observed mode loss, failed send and tab-lock
 * acquisition, after which the next `render` sends every LED including `off`.
 */
export class FrameRenderer {
  private deviceFrame: Frame | null = null;
  private lastFrame: Frame | null = null;

  render(deps: RenderDeps): RenderResult {
    const roles = resolveRoles(deps.harmony, deps.half, deps.mapping, deps.displayMode);
    const frame = render({
      roles,
      theme: deps.theme,
      pressed: deps.pressed,
      playing: deps.transport === 'playing',
      rootFlash: deps.rootFlash,
      offStyle: deps.offStyle,
      dark: deps.dark,
      ...(deps.buttons ? { buttons: deps.buttons } : {}),
    });
    const fullRepaint = this.deviceFrame === null;
    const specs = diffFrames(this.deviceFrame, frame);
    this.lastFrame = frame;
    this.deviceFrame = frame;
    return { frame, specs, fullRepaint };
  }

  /** Forget what the device shows; the next render is a complete repaint. */
  invalidateDevice(): void {
    this.deviceFrame = null;
  }

  /** A send failed: the device may show anything, so treat it as unknown. */
  markSendFailed(): void {
    this.invalidateDevice();
  }

  /** The frame most recently rendered, regardless of device state. */
  current(): Frame | null {
    return this.lastFrame;
  }

  deviceKnown(): boolean {
    return this.deviceFrame !== null;
  }
}
