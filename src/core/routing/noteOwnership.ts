import type { PadIndex } from '../grid';
import type { MidiNote } from '../theory';

/** Who is holding a note: the hardware Launchpad or the virtual one, and which pad (plan §4.1). */
export type OwnerSource = 'hw' | 'virtual';

export interface NoteOwner {
  readonly source: OwnerSource;
  readonly pad: PadIndex;
}

/** Where a note was sent. Captured at Note On; never changes while the owner is active. */
export interface Destination {
  readonly port: string;
  /** 0-based MIDI channel. */
  readonly channel: number;
  readonly note: MidiNote;
}

export interface OwnedNote extends Destination {
  readonly velocity: number;
}

export type OutputMessage =
  | {
      readonly type: 'noteOn';
      readonly port: string;
      readonly channel: number;
      readonly note: MidiNote;
      readonly velocity: number;
    }
  | { readonly type: 'noteOff'; readonly port: string; readonly channel: number; readonly note: MidiNote }
  | {
      readonly type: 'polyPressure';
      readonly port: string;
      readonly channel: number;
      readonly note: MidiNote;
      readonly value: number;
    }
  | {
      readonly type: 'channelPressure';
      readonly port: string;
      readonly channel: number;
      readonly value: number;
    };

export function ownerKey(owner: NoteOwner): string {
  return `${owner.source}:${String(owner.pad)}`;
}

export function destinationKey(d: Destination): string {
  return `${d.port}/${String(d.channel)}/${String(d.note)}`;
}

/**
 * Note ownership with a refcount per destination (plan §4.1, §4.10).
 *
 * - The first owner of a destination sends Note On; later owners of the same destination send nothing
 *   (no retrigger); the last release sends Note Off.
 * - A Note On for an owner that is already active is an idempotent no-op: the recorded destination is
 *   never overwritten (a remap during a hold must not strand the original note).
 * - Releasing an unknown owner never decrements. After Panic, late releases are no-ops.
 * - Polyphonic pressure is routed through ownership: the value sent for a destination is the maximum
 *   across its owners, emitted only when it changes, including when the loudest owner releases.
 */
export class NoteOwnership {
  private readonly owners = new Map<string, OwnedNote>();
  private readonly refcounts = new Map<string, number>();
  private readonly pressures = new Map<string, number>();
  private readonly sentPressure = new Map<string, number>();

  press(owner: NoteOwner, destination: OwnedNote): OutputMessage[] {
    const key = ownerKey(owner);
    if (this.owners.has(key)) return [];
    this.owners.set(key, destination);
    const dk = destinationKey(destination);
    const count = (this.refcounts.get(dk) ?? 0) + 1;
    this.refcounts.set(dk, count);
    if (count > 1) return [];
    return [
      {
        type: 'noteOn',
        port: destination.port,
        channel: destination.channel,
        note: destination.note,
        velocity: destination.velocity,
      },
    ];
  }

  release(owner: NoteOwner): OutputMessage[] {
    const key = ownerKey(owner);
    const owned = this.owners.get(key);
    if (!owned) return [];
    this.owners.delete(key);
    this.pressures.delete(key);
    const dk = destinationKey(owned);
    const count = (this.refcounts.get(dk) ?? 1) - 1;
    const out: OutputMessage[] = [];
    if (count <= 0) {
      this.refcounts.delete(dk);
      this.sentPressure.delete(dk);
      out.push({ type: 'noteOff', port: owned.port, channel: owned.channel, note: owned.note });
    } else {
      this.refcounts.set(dk, count);
      // Only re-emit pressure for destinations that have had pressure sent (plan §4.10).
      if (this.sentPressure.has(dk)) out.push(...this.emitPressure(owned));
    }
    return out;
  }

  /** Poly pressure from a pad; dropped when the pad owns nothing. */
  polyPressure(owner: NoteOwner, value: number): OutputMessage[] {
    const key = ownerKey(owner);
    const owned = this.owners.get(key);
    if (!owned) return [];
    this.pressures.set(key, value);
    return this.emitPressure(owned);
  }

  /** Channel pressure has no per-pad identity: forward on the configured output. */
  channelPressure(port: string, channel: number, value: number): OutputMessage[] {
    return [{ type: 'channelPressure', port, channel, value }];
  }

  /**
   * Panic: Note Off to every active destination that is reachable; unreachable destinations are returned
   * so the caller can keep them in the pending-cleanup record (plan §4.2). The table is cleared either way.
   */
  panic(reachable: (port: string) => boolean = () => true): {
    readonly messages: OutputMessage[];
    readonly unreachable: Destination[];
  } {
    const messages: OutputMessage[] = [];
    const unreachable: Destination[] = [];
    for (const d of this.activeDestinations()) {
      if (reachable(d.port))
        messages.push({ type: 'noteOff', port: d.port, channel: d.channel, note: d.note });
      else unreachable.push(d);
    }
    this.owners.clear();
    this.refcounts.clear();
    this.pressures.clear();
    this.sentPressure.clear();
    return { messages, unreachable };
  }

  /** Release every owner from one source (hardware-owner cleanup, plan §4.2); refcounts are respected. */
  releaseSource(source: OwnerSource): OutputMessage[] {
    const out: OutputMessage[] = [];
    for (const key of [...this.owners.keys()]) {
      if (!key.startsWith(`${source}:`)) continue;
      const pad = Number(key.slice(source.length + 1));
      out.push(...this.release({ source, pad }));
    }
    return out;
  }

  /** Owners whose destination is on a given port (for port changes and port loss). */
  releasePort(port: string): OutputMessage[] {
    const out: OutputMessage[] = [];
    for (const [key, owned] of [...this.owners.entries()]) {
      if (owned.port !== port) continue;
      const [source, pad] = key.split(':') as [OwnerSource, string];
      out.push(...this.release({ source, pad: Number(pad) }));
    }
    return out;
  }

  isActive(owner: NoteOwner): boolean {
    return this.owners.has(ownerKey(owner));
  }

  owned(owner: NoteOwner): OwnedNote | undefined {
    return this.owners.get(ownerKey(owner));
  }

  /** Distinct MIDI notes currently sounding (any port/channel), for press feedback (plan §4.1). */
  activeNotes(): ReadonlySet<MidiNote> {
    return new Set([...this.owners.values()].map((o) => o.note));
  }

  activeDestinations(): Destination[] {
    const seen = new Map<string, Destination>();
    for (const o of this.owners.values())
      seen.set(destinationKey(o), { port: o.port, channel: o.channel, note: o.note });
    return [...seen.values()];
  }

  ownerCount(): number {
    return this.owners.size;
  }

  private emitPressure(dest: Destination): OutputMessage[] {
    const dk = destinationKey(dest);
    let max = 0;
    for (const [key, owned] of this.owners) {
      if (destinationKey(owned) !== dk) continue;
      max = Math.max(max, this.pressures.get(key) ?? 0);
    }
    if (this.sentPressure.get(dk) === max) return [];
    this.sentPressure.set(dk, max);
    return [{ type: 'polyPressure', port: dest.port, channel: dest.channel, note: dest.note, value: max }];
  }
}
