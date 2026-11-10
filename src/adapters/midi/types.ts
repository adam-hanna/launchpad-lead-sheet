/**
 * Structural subset of the Web MIDI API that the adapters depend on. Real `MIDIAccess` objects satisfy
 * it; tests pass fakes. Keeping the surface small is what lets everything above run in Node.
 */

export type MidiPortType = 'input' | 'output';
export type MidiPortState = 'connected' | 'disconnected';

export interface MidiPortLike {
  readonly id: string;
  readonly name: string | null;
  readonly type: MidiPortType;
  readonly state: MidiPortState;
  readonly connection: string;
  open(): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface MidiMessageEventLike {
  readonly data: Uint8Array | null;
  readonly timeStamp: number;
}

export interface MidiInputLike extends MidiPortLike {
  readonly type: 'input';
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}

export interface MidiOutputLike extends MidiPortLike {
  readonly type: 'output';
  send(data: number[] | Uint8Array, timestamp?: number): void;
}

export interface MidiStateChangeEventLike {
  readonly port: MidiPortLike | null;
}

export interface MidiAccessLike {
  readonly inputs: ReadonlyMap<string, MidiInputLike>;
  readonly outputs: ReadonlyMap<string, MidiOutputLike>;
  readonly sysexEnabled: boolean;
  onstatechange: ((event: MidiStateChangeEventLike) => void) | null;
}

export type Unsubscribe = () => void;

export type MidiHandler = (data: Uint8Array, timestamp: number) => void;

export interface PortInfo {
  readonly id: string;
  readonly name: string;
  readonly type: MidiPortType;
  readonly state: MidiPortState;
}
