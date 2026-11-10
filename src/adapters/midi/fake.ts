import type {
  MidiAccessLike,
  MidiInputLike,
  MidiMessageEventLike,
  MidiOutputLike,
  MidiPortState,
  MidiStateChangeEventLike,
} from './types';

/**
 * In-memory Web MIDI for unit tests and the virtual device. Inputs can `receive` bytes; outputs record
 * what was `sent`; ports can be unplugged and replugged to exercise hot-plug handling.
 */
export class FakeInput implements MidiInputLike {
  readonly type = 'input' as const;
  state: MidiPortState = 'connected';
  connection = 'closed';
  onmidimessage: ((event: MidiMessageEventLike) => void) | null = null;
  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}
  open() {
    this.connection = 'open';
    return Promise.resolve(this);
  }
  close() {
    this.connection = 'closed';
    return Promise.resolve(this);
  }
  receive(bytes: readonly number[], timeStamp = 0): void {
    this.onmidimessage?.({ data: Uint8Array.from(bytes), timeStamp });
  }
}

export class FakeOutput implements MidiOutputLike {
  readonly type = 'output' as const;
  state: MidiPortState = 'connected';
  connection = 'closed';
  readonly sent: { readonly data: number[]; readonly timestamp: number | undefined }[] = [];
  failNextSend = false;
  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}
  open() {
    this.connection = 'open';
    return Promise.resolve(this);
  }
  close() {
    this.connection = 'closed';
    return Promise.resolve(this);
  }
  send(data: number[] | Uint8Array, timestamp?: number): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('send failed');
    }
    this.sent.push({ data: Array.from(data), timestamp });
  }
}

export class FakeAccess implements MidiAccessLike {
  readonly inputs = new Map<string, FakeInput>();
  readonly outputs = new Map<string, FakeOutput>();
  sysexEnabled = true;
  onstatechange: ((event: MidiStateChangeEventLike) => void) | null = null;

  addInput(id: string, name: string): FakeInput {
    const p = new FakeInput(id, name);
    this.inputs.set(id, p);
    return p;
  }
  addOutput(id: string, name: string): FakeOutput {
    const p = new FakeOutput(id, name);
    this.outputs.set(id, p);
    return p;
  }
  /** Notify without a state change, as Chrome does when a port's connection opens or closes. */
  touch(id: string): void {
    const port = this.inputs.get(id) ?? this.outputs.get(id);
    if (!port) return;
    port.connection = port.connection === 'open' ? 'closed' : 'open';
    this.onstatechange?.({ port });
  }

  /** Mark a port disconnected and notify, as the browser does on unplug. */
  unplug(id: string): void {
    const port = this.inputs.get(id) ?? this.outputs.get(id);
    if (!port) return;
    port.state = 'disconnected';
    this.onstatechange?.({ port });
  }
  replug(id: string): void {
    const port = this.inputs.get(id) ?? this.outputs.get(id);
    if (!port) return;
    port.state = 'connected';
    this.onstatechange?.({ port });
  }
}

/** A fake with the ports the app expects: Launchpad Pro MK3 MIDI pair and two IAC buses. */
export function standardFakeAccess(): FakeAccess {
  const a = new FakeAccess();
  a.addInput('in-lp', 'LPProMK3 MIDI');
  a.addInput('in-daw', 'LPProMK3 DAW');
  a.addInput('in-clock', 'IAC Driver LS Clock');
  a.addOutput('out-lp', 'LPProMK3 MIDI');
  a.addOutput('out-daw', 'LPProMK3 DAW');
  a.addOutput('out-notes', 'IAC Driver LS Notes');
  return a;
}
