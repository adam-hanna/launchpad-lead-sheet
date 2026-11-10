import { destinationKey, type Destination, type OutputMessage } from './noteOwnership';

/**
 * Note Offs that could not be delivered because their output disappeared (plan §4.2 "destination
 * unavailable"). Blocking is scoped per port: the port stays blocked until every pending release has
 * actually been sent; a failed send keeps the record. Sending cleanup is never presented as proof that
 * the instrument is silent.
 */
export class PendingCleanup {
  private readonly byPort = new Map<string, Map<string, Destination>>();

  add(destinations: readonly Destination[]): void {
    for (const d of destinations) {
      let m = this.byPort.get(d.port);
      if (!m) {
        m = new Map();
        this.byPort.set(d.port, m);
      }
      m.set(destinationKey(d), d);
    }
  }

  /** True while the port still owes Note Offs; new Note Ons to it must wait (plan §4.2). */
  isBlocked(port: string): boolean {
    return (this.byPort.get(port)?.size ?? 0) > 0;
  }

  /** Note Off messages to attempt for a port. The record is kept until `confirm` removes them. */
  messagesFor(port: string): OutputMessage[] {
    const m = this.byPort.get(port);
    if (!m) return [];
    return [...m.values()].map((d) => ({ type: 'noteOff', port: d.port, channel: d.channel, note: d.note }));
  }

  /** Remove destinations whose release was actually delivered. */
  confirm(delivered: readonly Destination[]): void {
    for (const d of delivered) {
      const m = this.byPort.get(d.port);
      if (!m) continue;
      m.delete(destinationKey(d));
      if (m.size === 0) this.byPort.delete(d.port);
    }
  }

  /** Everything still owed, for the UI's stuck-note list. */
  stuck(): { readonly port: string; readonly notes: readonly Destination[] }[] {
    return [...this.byPort.entries()].map(([port, m]) => ({ port, notes: [...m.values()] }));
  }

  ports(): string[] {
    return [...this.byPort.keys()];
  }

  size(): number {
    let n = 0;
    for (const m of this.byPort.values()) n += m.size;
    return n;
  }
}
