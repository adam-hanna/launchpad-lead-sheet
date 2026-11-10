import {
  DeviceOwnership,
  type LaunchpadPort,
  type OwnershipEffect,
  type OwnershipSnapshot,
} from '@core/device';
import { mappingFor, type PadIndex } from '@core/grid';
import { FrameRenderer, THEMES, WARM_THEME, type LedState, type Theme } from '@core/lighting';
import {
  activeHarmony,
  chordAt,
  createEmptySheet,
  loadSheet,
  parseChart,
  resolve,
  type ActiveHarmony,
  type ChartParseResult,
  type LoadResult,
  type ResolvedBar,
  type Sheet,
} from '@core/sheet';
import { ClockEngine, TempoEstimator, type TransportSnapshot } from '@core/sync';
import { formatKey } from '@core/theory';
import {
  autodetectPorts,
  isLaunchpadMidiPort,
  type MidiAccessState,
  type PortInfo,
  type PortSelection,
  type WebMidi,
} from '@adapters/midi';
import { ProMk3Port } from '@adapters/launchpad';
import type { VirtualLaunchpad } from '@adapters/virtual';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export interface ActiveSummary {
  readonly status: ActiveHarmony['status'];
  readonly barIndex: number | null;
  readonly half: 0 | 1;
  readonly chordSymbol: string | null;
  readonly keyText: string | null;
}

export interface SessionSnapshot {
  readonly access: MidiAccessState;
  readonly ports: readonly PortInfo[];
  readonly selection: PortSelection;
  readonly transport: TransportSnapshot;
  readonly tempo: number | null;
  readonly ownership: OwnershipSnapshot;
  readonly sheet: Sheet;
  /** 1-based bar shown while not playing. */
  readonly selectedBar: number;
  readonly active: ActiveSummary;
  readonly settings: Settings;
  readonly pressedCount: number;
  readonly lastError: string | null;
}

export interface HardwarePort extends LaunchpadPort {
  dispose(): void;
}

export interface SessionOptions {
  readonly midi: WebMidi;
  readonly virtual: VirtualLaunchpad;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly createHardwarePort?: (midi: WebMidi, inputId: string, outputId: string) => HardwarePort;
  readonly initialSettings?: Partial<Settings>;
}

type Unsub = () => void;

/**
 * Wires core and adapters into one running session (roadmap M4-T7): clock input → ClockEngine,
 * sheet → harmony → mapping → FrameRenderer → hardware and virtual Launchpads, with device ownership
 * effects applied in order. Framework-free; the React store subscribes to `snapshot()`.
 */
export class SessionController {
  private readonly midi: WebMidi;
  private readonly virtual: VirtualLaunchpad;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly createHardwarePort: (midi: WebMidi, inputId: string, outputId: string) => HardwarePort;

  private readonly engine: ClockEngine;
  private readonly tempo = new TempoEstimator();
  private readonly ownership: DeviceOwnership;
  private readonly hwRenderer = new FrameRenderer();
  private readonly virtualRenderer = new FrameRenderer();

  private sheet: Sheet = createEmptySheet('empty', 'Empty sheet');
  private resolved: ResolvedBar[] = [];
  private selectedBar = 1;
  private settings: Settings;
  private selection: PortSelection = {};
  private hardware: HardwarePort | null = null;
  private hardwareUnsubs: Unsub[] = [];
  private clockUnsub: Unsub | null = null;
  private timeoutHandle: unknown = null;
  private inputEnabled = false;
  private lastError: string | null = null;
  /** Pads physically held, by source. Replaced by NoteOwnership-driven feedback in M5. */
  private readonly pressedHardware = new Set<PadIndex>();
  private readonly pressedVirtual = new Set<PadIndex>();
  private buttons: ReadonlyMap<PadIndex, LedState> | undefined;
  private readonly listeners = new Set<(s: SessionSnapshot) => void>();
  private readonly disposers: Unsub[] = [];

  constructor(options: SessionOptions) {
    this.midi = options.midi;
    this.virtual = options.virtual;
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimer =
      options.clearTimer ??
      ((h) => {
        globalThis.clearTimeout(h as ReturnType<typeof setTimeout>);
      });
    this.createHardwarePort = options.createHardwarePort ?? ((midi, i, o) => new ProMk3Port(midi, i, o));
    this.settings = { ...DEFAULT_SETTINGS, ...options.initialSettings };
    this.engine = new ClockEngine({ meter: this.sheet.meter, originBar: this.sheet.originBar });
    this.ownership = new DeviceOwnership(this.now);

    this.disposers.push(
      this.engine.subscribe(() => {
        this.render();
        this.emit();
      }),
      this.midi.onAccessChange(() => {
        this.emit();
      }),
      this.midi.onStateChange((port) => {
        this.onPortStateChange(port);
      }),
      this.virtual.onPad((pad, velocity) => {
        if (velocity > 0) this.pressedVirtual.add(pad);
        else this.pressedVirtual.delete(pad);
        this.render();
        this.emit();
      }),
    );
    this.render();
  }

  // ---- observation ----------------------------------------------------------------------------------

  snapshot(): SessionSnapshot {
    const transport = this.engine.snapshot();
    const { harmony, half } = this.currentHarmony(transport);
    const chord = harmony.harmony ? chordAt(harmony.harmony, half) : null;
    return {
      access: this.midi.state(),
      ports: this.midi.ports(),
      selection: this.selection,
      transport,
      tempo: this.tempo.estimate(),
      ownership: this.ownership.snapshot(),
      sheet: this.sheet,
      selectedBar: this.selectedBar,
      active: {
        status: harmony.status,
        barIndex: harmony.barIndex,
        half,
        chordSymbol: chord?.symbol ?? null,
        keyText: harmony.harmony?.key ? formatKey(harmony.harmony.key) : null,
      },
      settings: this.settings,
      pressedCount: this.pressedHardware.size + this.pressedVirtual.size,
      lastError: this.lastError,
    };
  }

  subscribe(listener: (s: SessionSnapshot) => void): Unsub {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- MIDI access and ports ------------------------------------------------------------------------

  async requestAccess(): Promise<MidiAccessState> {
    const state = await this.midi.requestAccess();
    if (state.kind === 'granted') this.autodetect();
    this.emit();
    return state;
  }

  autodetect(): void {
    this.selectPorts(autodetectPorts(this.midi.ports(), this.selection));
  }

  selectPorts(selection: PortSelection): void {
    const next: PortSelection = { ...this.selection, ...selection };
    const lpChanged = next.lpIn !== this.selection.lpIn || next.lpOut !== this.selection.lpOut;
    const clockChanged = next.clockIn !== this.selection.clockIn;
    this.selection = next;
    if (lpChanged) this.bindHardware();
    if (clockChanged) this.bindClock();
    this.emit();
  }

  // ---- device ---------------------------------------------------------------------------------------

  enterProgrammer(): void {
    this.virtual.enterProgrammerMode();
    this.apply(this.ownership.userEnter());
    this.emit();
  }

  restoreLive(): void {
    this.virtual.restoreLiveMode();
    this.apply(this.ownership.userRestore());
    this.emit();
  }

  // ---- sheet ----------------------------------------------------------------------------------------

  loadSheet(sheet: Sheet): void {
    this.sheet = sheet;
    this.resolved = resolve(sheet);
    this.engine.setMeter(sheet.meter);
    this.engine.setOriginBar(sheet.originBar);
    this.selectedBar = Math.min(Math.max(1, this.selectedBar), Math.max(1, sheet.bars.length));
    this.render();
    this.emit();
  }

  loadSheetJson(input: unknown): LoadResult {
    const r = loadSheet(input);
    if (r.ok) this.loadSheet(r.sheet);
    else this.fail(r.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
    return r;
  }

  loadChart(text: string, id = `chart-${String(Date.now())}`): ChartParseResult {
    const r = parseChart(text, id);
    if (r.ok) this.loadSheet(r.sheet);
    else this.fail(r.errors.map((e) => `line ${String(e.line)}: ${e.message}`).join('; '));
    return r;
  }

  selectBar(bar: number): void {
    this.selectedBar = Math.min(Math.max(1, bar), Math.max(1, this.sheet.bars.length));
    this.render();
    this.emit();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.render();
    this.emit();
  }

  /** States for the surrounding buttons (octave indicators etc.), owned by whoever calls this. */
  setButtons(buttons: ReadonlyMap<PadIndex, LedState> | undefined): void {
    this.buttons = buttons;
    this.render();
  }

  dispose(): void {
    this.unbindHardware();
    this.unbindClock();
    for (const d of this.disposers) d();
    this.listeners.clear();
  }

  // ---- internals: binding ---------------------------------------------------------------------------

  private bindHardware(): void {
    this.unbindHardware();
    const { lpIn, lpOut } = this.selection;
    if (!lpIn || !lpOut) {
      this.apply(this.ownership.deviceDisconnected());
      return;
    }
    const port = this.createHardwarePort(this.midi, lpIn, lpOut);
    this.hardware = port;
    this.hardwareUnsubs = [
      port.onLayoutChanged((layout) => {
        this.apply(this.ownership.layoutObserved(layout));
        this.emit();
      }),
      port.onPad((pad, velocity) => {
        if (!this.inputEnabled) return;
        if (velocity > 0) this.pressedHardware.add(pad);
        else this.pressedHardware.delete(pad);
        this.render();
        this.emit();
      }),
    ];
    const connected =
      this.midi.input(lpIn)?.state === 'connected' && this.midi.output(lpOut)?.state === 'connected';
    this.apply(connected ? this.ownership.deviceConnected() : this.ownership.deviceDisconnected());
  }

  private unbindHardware(): void {
    for (const u of this.hardwareUnsubs) u();
    this.hardwareUnsubs = [];
    this.hardware?.dispose();
    this.hardware = null;
    this.pressedHardware.clear();
  }

  private bindClock(): void {
    this.unbindClock();
    const { clockIn } = this.selection;
    if (!clockIn) return;
    this.clockUnsub = this.midi.subscribeInput(clockIn, (data, ts) => {
      this.engine.onMidi(data, ts);
      this.tempo.onMidi(data, ts);
      this.hardware?.forwardClock(data);
      this.virtual.forwardClock(data);
      this.scheduleTimeout();
    });
    this.engine.onClockInputConnected();
  }

  private unbindClock(): void {
    this.clockUnsub?.();
    this.clockUnsub = null;
    if (this.timeoutHandle !== null) {
      this.clearTimer(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private scheduleTimeout(): void {
    if (this.timeoutHandle !== null) {
      this.clearTimer(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    const deadline = this.engine.nextDeadline();
    if (deadline === null) return;
    this.timeoutHandle = this.setTimer(
      () => {
        this.timeoutHandle = null;
        this.engine.checkTimeout(this.now());
        this.scheduleTimeout();
      },
      Math.max(1, deadline - this.now()),
    );
  }

  private onPortStateChange(port: PortInfo): void {
    const { lpIn, lpOut, clockIn } = this.selection;
    if (port.id === lpIn || port.id === lpOut || (isLaunchpadMidiPort(port.name) && (!lpIn || !lpOut))) {
      if (port.state === 'disconnected') {
        this.apply(this.ownership.deviceDisconnected());
      } else {
        // Re-create the driver so its subscription binds to the live port object, then re-enter if desired.
        if (!lpIn || !lpOut) this.autodetect();
        else this.bindHardware();
      }
    }
    if (port.id === clockIn) {
      if (port.state === 'disconnected') this.engine.onClockInputDisconnected();
      else this.bindClock();
    }
    this.emit();
  }

  // ---- internals: ownership effects -------------------------------------------------------------------

  private apply(effects: readonly OwnershipEffect[]): void {
    for (const fx of effects) {
      switch (fx.type) {
        case 'send': {
          const ok =
            fx.command === 'enterProgrammer'
              ? this.hardware?.enterProgrammerMode()
              : this.hardware?.restoreLiveMode();
          if (ok === false) {
            this.hwRenderer.markSendFailed();
            this.fail(`could not send ${fx.command} to the Launchpad`);
          }
          break;
        }
        case 'cleanupHardwareOwners':
          // M5 releases hardware-owned notes here; until then only the press feedback is cleared.
          this.pressedHardware.clear();
          break;
        case 'invalidateFrame':
          this.hwRenderer.invalidateDevice();
          break;
        case 'repaint':
          this.render(true);
          break;
        case 'inputEnabled':
          this.inputEnabled = fx.enabled;
          break;
        case 'statusChanged':
          break;
      }
    }
  }

  // ---- internals: rendering -------------------------------------------------------------------------

  private currentHarmony(transport: TransportSnapshot): { harmony: ActiveHarmony; half: 0 | 1 } {
    if (transport.state === 'playing' && transport.position) {
      return {
        harmony: activeHarmony(
          this.resolved,
          transport.position.sheetBar,
          this.sheet.loop,
          this.settings.pastEnd,
        ),
        half: transport.position.half,
      };
    }
    return {
      harmony: activeHarmony(this.resolved, this.selectedBar, undefined, this.settings.pastEnd),
      half: 0,
    };
  }

  private theme(): Theme {
    return THEMES.find((t) => t.name === this.settings.themeName) ?? WARM_THEME;
  }

  private render(forceHardware = false): void {
    const transport = this.engine.snapshot();
    const { harmony, half } = this.currentHarmony(transport);
    const s = this.settings;
    const mapping = mappingFor(s.layout, s.octaveShift, s.relative, s.anchor, harmony.harmony, half);
    const pressed = new Set<PadIndex>([...this.pressedHardware, ...this.pressedVirtual]);
    const deps = {
      harmony: harmony.harmony,
      half,
      mapping,
      transport: transport.state,
      displayMode: s.displayMode,
      offStyle: s.offStyle,
      theme: this.theme(),
      rootFlash: s.rootFlash,
      dark: harmony.dark,
      pressed,
      ...(this.buttons ? { buttons: this.buttons } : {}),
    };

    const v = this.virtualRenderer.render(deps);
    if (v.specs.length) this.virtual.send(v.specs);

    if (this.hardware && (forceHardware || this.ownership.snapshot().status === 'owned')) {
      const h = this.hwRenderer.render(deps);
      if (h.specs.length && !this.hardware.send(h.specs)) {
        this.hwRenderer.markSendFailed();
        this.fail('LED send failed; the frame will be repainted');
      }
    }
  }

  private fail(message: string): void {
    this.lastError = message;
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
}
