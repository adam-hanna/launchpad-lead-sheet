import type {
  MidiAccessLike,
  MidiHandler,
  MidiInputLike,
  MidiOutputLike,
  MidiPortLike,
  PortInfo,
  Unsubscribe,
} from './types';

/** Access lifecycle (plan §4.12 setup states). */
export type MidiAccessState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'requesting' }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'granted'; readonly sysex: boolean };

export type AccessRequest = () => Promise<MidiAccessLike>;

/**
 * Thin, testable layer over `navigator.requestMIDIAccess`: port listing, hot-plug events, fan-out of
 * input messages to several subscribers, and sends by port id. No domain logic lives here.
 */
export class WebMidi {
  private access: MidiAccessLike | null = null;
  private accessState: MidiAccessState;
  private readonly handlers = new Map<string, Set<MidiHandler>>();
  private readonly stateListeners = new Set<(port: PortInfo) => void>();
  private readonly accessListeners = new Set<(state: MidiAccessState) => void>();

  constructor(private readonly request: AccessRequest | null) {
    this.accessState = request ? { kind: 'idle' } : { kind: 'unsupported' };
  }

  /** Bind to the real browser API (SysEx requested; the Launchpad needs it). */
  static fromNavigator(nav?: Partial<Navigator>): WebMidi {
    // Runtime check: Firefox/Safari ship a Navigator without requestMIDIAccess; Node has no navigator.
    const n = nav ?? (globalThis as { navigator?: Partial<Navigator> }).navigator;
    const request = n?.requestMIDIAccess;
    if (typeof request !== 'function') return new WebMidi(null);
    return new WebMidi(() => request.call(n, { sysex: true }) as Promise<unknown> as Promise<MidiAccessLike>);
  }

  state(): MidiAccessState {
    return this.accessState;
  }

  /** Must be called from a user gesture in browsers. Never throws; the state carries the outcome. */
  async requestAccess(): Promise<MidiAccessState> {
    if (!this.request) return this.accessState;
    if (this.access) return this.accessState;
    this.setAccessState({ kind: 'requesting' });
    try {
      const access = await this.request();
      this.access = access;
      access.onstatechange = (e) => {
        if (e.port) {
          const info = toInfo(e.port);
          if (e.port.type === 'input' && e.port.state === 'connected') this.rebind(e.port.id);
          for (const l of this.stateListeners) l(info);
        }
      };
      this.setAccessState({ kind: 'granted', sysex: access.sysexEnabled });
    } catch (e) {
      const reason = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.setAccessState({ kind: 'denied', reason });
    }
    return this.accessState;
  }

  ports(): PortInfo[] {
    if (!this.access) return [];
    return [...this.access.inputs.values(), ...this.access.outputs.values()].map(toInfo);
  }

  input(id: string): MidiInputLike | null {
    return this.access?.inputs.get(id) ?? null;
  }

  output(id: string): MidiOutputLike | null {
    return this.access?.outputs.get(id) ?? null;
  }

  /** Hot-plug notifications (port connected/disconnected). */
  onStateChange(listener: (port: PortInfo) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onAccessChange(listener: (state: MidiAccessState) => void): Unsubscribe {
    this.accessListeners.add(listener);
    return () => this.accessListeners.delete(listener);
  }

  /**
   * Subscribe to an input. Several subscribers may share a port (the Launchpad input feeds both the
   * driver and the harness log); the port's single `onmidimessage` fans out to all of them.
   */
  subscribeInput(id: string, handler: MidiHandler): Unsubscribe {
    let set = this.handlers.get(id);
    if (!set) {
      set = new Set();
      this.handlers.set(id, set);
    }
    set.add(handler);
    this.rebind(id);
    return () => {
      const s = this.handlers.get(id);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(id);
        const port = this.input(id);
        if (port) port.onmidimessage = null;
      }
    };
  }

  /** Send bytes to an output. Returns false when the port is missing or the send throws. */
  send(outputId: string, bytes: readonly number[] | Uint8Array, timestamp?: number): boolean {
    const port = this.output(outputId);
    if (!port) return false;
    try {
      if (timestamp === undefined) port.send(bytes instanceof Uint8Array ? bytes : [...bytes]);
      else port.send(bytes instanceof Uint8Array ? bytes : [...bytes], timestamp);
      return true;
    } catch {
      return false;
    }
  }

  private rebind(inputId: string): void {
    const port = this.input(inputId);
    const set = this.handlers.get(inputId);
    if (!port || !set) return;
    port.onmidimessage = (e) => {
      if (!e.data) return;
      for (const h of set) h(e.data, e.timeStamp);
    };
  }

  private setAccessState(state: MidiAccessState): void {
    this.accessState = state;
    for (const l of this.accessListeners) l(state);
  }
}

export function toInfo(port: MidiPortLike): PortInfo {
  return { id: port.id, name: port.name ?? '', type: port.type, state: port.state };
}
