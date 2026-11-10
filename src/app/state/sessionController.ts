import {
  DeviceOwnership,
  type LaunchpadPort,
  type OwnershipEffect,
  type OwnershipSnapshot,
} from '@core/device';
import { mappingFor, type GridMapping, type PadIndex } from '@core/grid';
import {
  FrameRenderer,
  OCTAVE_DOWN_BUTTON,
  OCTAVE_UP_BUTTON,
  THEMES,
  WARM_THEME,
  clampOctaveShift,
  octaveButtonStates,
  type LedState,
  type Theme,
} from '@core/lighting';
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
import {
  NoteOwnership,
  PendingCleanup,
  type Destination,
  type OutputMessage,
  type OwnerSource,
} from '@core/routing';
import { ClockEngine, TempoEstimator, type TransportSnapshot } from '@core/sync';
import { formatKey } from '@core/theory';
import {
  NotesOutput,
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
  /** Owners currently holding a note (hardware and virtual pads). */
  readonly pressedCount: number;
  /** Distinct MIDI notes sounding on the notes output. */
  readonly heldNotes: readonly number[];
  /** Notes whose Note Off could not be delivered because their output is gone (plan §4.2). */
  readonly stuck: readonly { readonly port: string; readonly notes: readonly number[] }[];
  readonly lastError: string | null;
}

/** Port ids to set; `undefined` clears a slot. */
export type PortSelectionPatch = { readonly [K in keyof PortSelection]?: string | undefined };

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
  private readonly notes = new NoteOwnership();
  private readonly pending = new PendingCleanup();
  private readonly output: NotesOutput;
  private mapping: GridMapping;

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
    this.output = new NotesOutput(this.midi);
    this.mapping = mappingFor(
      this.settings.layout,
      this.settings.octaveShift,
      this.settings.relative,
      this.settings.anchor,
      null,
      0,
    );
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
        this.onPad('virtual', pad, velocity);
      }),
      this.virtual.onPolyPressure((pad, value) => {
        this.onPolyPressure('virtual', pad, value);
      }),
      this.virtual.onChannelPressure((value) => {
        this.onChannelPressure(value);
      }),
      this.virtual.onButton((button, value) => {
        this.onButton(button, value);
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
      pressedCount: this.notes.ownerCount(),
      heldNotes: [...this.notes.activeNotes()].sort((a, b) => a - b),
      stuck: this.pending.stuck().map((s) => ({ port: s.port, notes: s.notes.map((d) => d.note) })),
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

  selectPorts(patch: PortSelectionPatch): void {
    const keys = ['lpIn', 'lpOut', 'clockIn', 'notesOut'] as const;
    const next: { -readonly [K in keyof PortSelection]?: string } = {};
    for (const key of keys) {
      const value = key in patch ? patch[key] : this.selection[key];
      if (value !== undefined) next[key] = value;
    }
    const lpChanged = next.lpIn !== this.selection.lpIn || next.lpOut !== this.selection.lpOut;
    const clockChanged = next.clockIn !== this.selection.clockIn;
    const oldNotesOut = this.selection.notesOut;
    // Output changed: release every note to the OLD destination before switching (plan §4.2).
    if (oldNotesOut !== undefined && next.notesOut !== oldNotesOut)
      this.send(this.notes.releasePort(oldNotesOut));
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

  /** Panic: Note Off to every reachable destination, clear ownership, repaint (plan §4.1). */
  panic(): void {
    const { messages, unreachable } = this.notes.panic((port) => this.output.reachable(port));
    this.send(messages);
    if (unreachable.length) {
      this.pending.add(unreachable);
      this.fail(
        `${String(unreachable.length)} note(s) could not be silenced: their output is gone. Silence them in Live.`,
      );
    }
    this.render();
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
    this.settings = { ...this.settings, octaveShift: clampOctaveShift(this.settings.octaveShift) };
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
        this.onPad('hw', pad, velocity);
      }),
      port.onPolyPressure((pad, value) => {
        if (!this.inputEnabled) return;
        this.onPolyPressure('hw', pad, value);
      }),
      port.onChannelPressure((value) => {
        if (!this.inputEnabled) return;
        this.onChannelPressure(value);
      }),
      port.onButton((button, value) => {
        if (!this.inputEnabled) return;
        this.onButton(button, value);
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
    this.send(this.notes.releaseSource('hw'));
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
    if (port.type === 'output') {
      if (port.state === 'disconnected') {
        // Destination unavailable: owners on it move to the pending-cleanup record (plan §4.2).
        const owed = this.notes
          .releasePort(port.id)
          .flatMap<Destination>((m) =>
            m.type === 'noteOff' ? [{ port: m.port, channel: m.channel, note: m.note }] : [],
          );
        this.pending.add(owed);
        if (owed.length)
          this.fail(
            `${String(owed.length)} note(s) stuck: output disconnected. Silence them in Live or replug.`,
          );
        this.render();
      } else if (this.pending.isBlocked(port.id)) {
        this.flushPending(port.id);
      }
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
          // Hardware-owner cleanup (plan §4.2): refcounts respected, virtual owners keep sounding.
          this.send(this.notes.releaseSource('hw'));
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

  // ---- internals: routing ---------------------------------------------------------------------------

  private onPad(source: OwnerSource, pad: PadIndex, velocity: number): void {
    const owner = { source, pad };
    if (velocity > 0) {
      const note = this.mapping.noteAt(pad);
      const port = this.selection.notesOut;
      if (note === null || !port) return;
      // A returning destination must deliver its owed Note Offs before accepting new notes.
      if (this.pending.isBlocked(port)) {
        this.flushPending(port);
        if (this.pending.isBlocked(port)) {
          this.fail('notes output still owes releases; press ignored');
          return;
        }
      }
      this.send(this.notes.press(owner, { port, channel: this.settings.notesChannel, note, velocity }));
    } else {
      this.send(this.notes.release(owner));
    }
    this.render();
    this.emit();
  }

  private onPolyPressure(source: OwnerSource, pad: PadIndex, value: number): void {
    this.send(this.notes.polyPressure({ source, pad }, value));
  }

  private onChannelPressure(value: number): void {
    const port = this.selection.notesOut;
    if (!port) return;
    this.send(this.notes.channelPressure(port, this.settings.notesChannel, value));
  }

  private onButton(button: PadIndex, value: number): void {
    if (value === 0) return;
    if (button === OCTAVE_UP_BUTTON) this.updateSettings({ octaveShift: this.settings.octaveShift + 1 });
    else if (button === OCTAVE_DOWN_BUTTON)
      this.updateSettings({ octaveShift: this.settings.octaveShift - 1 });
  }

  private send(messages: readonly OutputMessage[]): void {
    if (messages.length === 0) return;
    const report = this.output.send(messages);
    if (report.failed.length) {
      this.pending.add(report.failed);
      this.fail(`${String(report.failed.length)} MIDI message(s) could not be sent to the notes output`);
    }
  }

  /** Retry the Note Offs a port owes; keep whatever still fails (plan §4.2). */
  private flushPending(port: string): void {
    const messages = this.pending.messagesFor(port);
    if (messages.length === 0) return;
    const report = this.output.send(messages);
    const failed = new Set(report.failed.map((d) => `${d.port}/${String(d.channel)}/${String(d.note)}`));
    const delivered = messages.flatMap<Destination>((m) =>
      m.type === 'noteOff' && !failed.has(`${m.port}/${String(m.channel)}/${String(m.note)}`)
        ? [{ port: m.port, channel: m.channel, note: m.note }]
        : [],
    );
    this.pending.confirm(delivered);
    if (!this.pending.isBlocked(port)) this.lastError = null;
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
    this.mapping = mapping;
    // Press feedback: every pad the current mapping maps to an owned note (plan §4.1).
    const pressed = new Set<PadIndex>();
    for (const note of this.notes.activeNotes()) for (const pad of mapping.padsFor(note)) pressed.add(pad);
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
      buttons: new Map([...octaveButtonStates(s.octaveShift), ...(this.buttons ?? [])]),
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
