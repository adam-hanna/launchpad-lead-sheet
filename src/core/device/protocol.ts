/** Launchpad Pro MK3 SysEx commands other than LED lighting (docs/launchpad-protocol.md). */

/** F0 00 20 29 02 0E — Launchpad Pro MK3 SysEx header. */
export const LP_HEADER: readonly number[] = [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e];

/** 0E <mode> — Live / Programmer mode switch. */
export const CMD_MODE = 0x0e;
/** 00 — select layout (host → device) and layout-changed notification (device → host). */
export const CMD_LAYOUT = 0x00;

export const LAYOUT_PROGRAMMER = 0x11;
export const LAYOUT_SESSION = 0x00;
export const LAYOUT_NOTE = 0x04;

export const LAYOUT_NAMES: Readonly<Record<number, string>> = {
  0x00: 'Session',
  0x01: 'Fader',
  0x02: 'Chord',
  0x03: 'Custom',
  0x04: 'Note / Drum',
  0x05: 'Scale settings',
  0x06: 'Sequencer settings',
  0x07: 'Sequencer steps',
  0x08: 'Sequencer velocity',
  0x09: 'Sequencer pattern settings',
  0x0a: 'Sequencer probability',
  0x0b: 'Sequencer mutation',
  0x0c: 'Sequencer micro step',
  0x0d: 'Sequencer projects',
  0x0e: 'Sequencer patterns',
  0x0f: 'Sequencer tempo',
  0x10: 'Sequencer swing',
  0x11: 'Programmer',
  0x12: 'Settings',
  0x13: 'Custom settings',
};

export function layoutName(layout: number): string {
  return LAYOUT_NAMES[layout] ?? `layout 0x${layout.toString(16)}`;
}

/** F0 00 20 29 02 0E 0E 01 F7 enters Programmer mode; … 0E 00 F7 returns to Live mode. */
export function modeMessage(programmer: boolean): number[] {
  return [...LP_HEADER, CMD_MODE, programmer ? 0x01 : 0x00, 0xf7];
}

/** F0 00 20 29 02 0E 00 F7 asks the device to report its current layout. */
export function layoutQueryMessage(): number[] {
  return [...LP_HEADER, CMD_LAYOUT, 0xf7];
}

export function isLaunchpadSysEx(data: ArrayLike<number>): boolean {
  if (data.length < LP_HEADER.length + 1) return false;
  for (let i = 0; i < LP_HEADER.length; i++) if (data[i] !== LP_HEADER[i]) return false;
  return true;
}

export interface LayoutMessage {
  readonly layout: number;
  readonly page: number;
}

/** Decode the device's layout-changed notification: F0 00 20 29 02 0E 00 <layout> <page> 00 F7. */
export function decodeLayoutMessage(data: ArrayLike<number>): LayoutMessage | null {
  if (!isLaunchpadSysEx(data) || data[6] !== CMD_LAYOUT || data.length < 9) return null;
  return { layout: data[7] ?? 0, page: data[8] ?? 0 };
}

// ---- MIDI status bytes used by the driver ----------------------------------------------------------

export const NOTE_ON = 0x90;
export const NOTE_OFF = 0x80;
export const CONTROL_CHANGE = 0xb0;
export const POLY_PRESSURE = 0xa0;
export const CHANNEL_PRESSURE = 0xd0;

/** Realtime bytes forwarded to the device so its flash/pulse follow Live's beat (plan §4.3). */
export const FORWARDED_REALTIME: ReadonlySet<number> = new Set([0xf8, 0xfa, 0xfb, 0xfc]);
