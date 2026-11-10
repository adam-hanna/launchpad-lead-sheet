import type { Destination, OutputMessage } from '@core/routing';
import type { WebMidi } from './webMidi';

export interface SendReport {
  readonly sent: number;
  /** Destinations whose message could not be delivered (port missing or send threw). */
  readonly failed: Destination[];
}

/** Encode one routed message as MIDI bytes. */
export function encodeOutput(m: OutputMessage): number[] {
  const ch = m.channel & 0x0f;
  switch (m.type) {
    case 'noteOn':
      return [0x90 | ch, m.note, Math.max(1, Math.min(127, m.velocity))]; // Note On
    case 'noteOff':
      return [0x80 | ch, m.note, 0x00]; // Note Off
    case 'polyPressure':
      return [0xa0 | ch, m.note, Math.max(0, Math.min(127, m.value))]; // Polyphonic key pressure
    case 'channelPressure':
      return [0xd0 | ch, Math.max(0, Math.min(127, m.value))]; // Channel pressure
  }
}

/**
 * Sends routed note/pressure messages to their recorded ports (the IAC notes bus). Each message carries
 * its own port id, so notes started on a previous output still reach it (plan §4.1).
 */
export class NotesOutput {
  constructor(private readonly midi: WebMidi) {}

  send(messages: readonly OutputMessage[]): SendReport {
    let sent = 0;
    const failed: Destination[] = [];
    for (const m of messages) {
      if (this.midi.send(m.port, encodeOutput(m))) sent += 1;
      else if (m.type !== 'channelPressure') failed.push({ port: m.port, channel: m.channel, note: m.note });
    }
    return { sent, failed };
  }

  reachable(port: string): boolean {
    return this.midi.output(port)?.state === 'connected';
  }
}
