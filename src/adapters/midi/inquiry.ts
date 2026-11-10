import type { PortInfo } from './types';
import type { WebMidi } from './webMidi';

/** F0 7E 7F 06 01 F7 — Universal device inquiry (all devices). */
export const INQUIRY_REQUEST: readonly number[] = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

export type KnownModel =
  'launchpad-pro-mk3' | 'launchpad-pro-mk3-bootloader' | 'launchpad-x' | 'launchpad-mini-mk3' | 'unknown';

export interface InquiryReply {
  readonly manufacturer: readonly number[];
  readonly family: number;
  readonly member: number;
  /** Firmware version as the four digit bytes concatenated, e.g. "0122". */
  readonly version: string;
  readonly model: KnownModel;
}

/** Decode a Universal Device Inquiry reply; null for anything else. */
export function decodeInquiryReply(data: Uint8Array | readonly number[]): InquiryReply | null {
  // F0 7E <dev> 06 02 <manufacturer 3 bytes> <family lo hi> <member lo hi> <version 4> F7
  if (data.length < 17 || data[0] !== 0xf0 || data[1] !== 0x7e || data[3] !== 0x06 || data[4] !== 0x02)
    return null;
  const manufacturer = [data[5] ?? 0, data[6] ?? 0, data[7] ?? 0];
  const family = data[8] ?? 0;
  const member = data[9] ?? 0;
  const version = Array.from(data.slice(12, 16), (b) => String(b)).join('');
  const novation = manufacturer[0] === 0x00 && manufacturer[1] === 0x20 && manufacturer[2] === 0x29;
  let model: KnownModel = 'unknown';
  // Family bytes verified on hardware (gate G1, 2026-11-10): the Pro MK3 answers 23 01.
  if (novation && family === 0x23 && member === 0x01) model = 'launchpad-pro-mk3';
  else if (novation && family === 0x23 && member === 0x11) model = 'launchpad-pro-mk3-bootloader';
  else if (novation && family === 0x03 && member === 0x01) model = 'launchpad-x';
  else if (novation && family === 0x13 && member === 0x01) model = 'launchpad-mini-mk3';
  return { manufacturer, family, member, version, model };
}

/**
 * Send an inquiry on `outputId` and wait for the reply on `inputId`. Resolves null on timeout or when
 * the output is missing. Never rejects.
 */
export function identify(
  midi: WebMidi,
  outputId: string,
  inputId: string,
  timeoutMs = 500,
  timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = globalThis,
): Promise<InquiryReply | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (reply: InquiryReply | null) => {
      if (done) return;
      done = true;
      unsubscribe();
      timers.clearTimeout(timer);
      resolve(reply);
    };
    const unsubscribe = midi.subscribeInput(inputId, (data) => {
      const reply = decodeInquiryReply(data);
      if (reply) finish(reply);
    });
    const timer = timers.setTimeout(() => {
      finish(null);
    }, timeoutMs);
    if (!midi.send(outputId, INQUIRY_REQUEST)) finish(null);
  });
}

// ---- Port auto-detection by name (plan §3.3) ---------------------------------------------------------

export interface PortSelection {
  readonly lpIn?: string;
  readonly lpOut?: string;
  readonly clockIn?: string;
  readonly notesOut?: string;
}

/** The Launchpad Pro MK3 "MIDI" interface; never the DAW or DIN ones. */
const LP_MIDI = /^(LPProMK3 MIDI|Launchpad Pro MK3(?!.*(DAW|DIN)).*MIDI.*)$/i;
const CLOCK = [/LS Clock/i, /IAC.*Clock/i, /Clock/i];
const NOTES = [/LS Notes/i, /IAC.*Notes/i, /Notes/i];

function pick(
  ports: readonly PortInfo[],
  type: PortInfo['type'],
  patterns: readonly RegExp[],
  remembered?: string,
): string | undefined {
  const candidates = ports.filter((p) => p.type === type && p.state === 'connected');
  if (remembered && candidates.some((p) => p.id === remembered)) return remembered;
  for (const re of patterns) {
    const hit = candidates.find((p) => re.test(p.name));
    if (hit) return hit.id;
  }
  return undefined;
}

/**
 * Choose ports by name, preferring remembered ids that are still present. Missing ports are simply
 * absent from the result so the setup panel can show which ones need attention.
 */
export function autodetectPorts(ports: readonly PortInfo[], remembered: PortSelection = {}): PortSelection {
  const out: { lpIn?: string; lpOut?: string; clockIn?: string; notesOut?: string } = {};
  const lpIn = pick(ports, 'input', [LP_MIDI], remembered.lpIn);
  const lpOut = pick(ports, 'output', [LP_MIDI], remembered.lpOut);
  const clockIn = pick(ports, 'input', CLOCK, remembered.clockIn);
  const notesOut = pick(ports, 'output', NOTES, remembered.notesOut);
  if (lpIn) out.lpIn = lpIn;
  if (lpOut) out.lpOut = lpOut;
  if (clockIn) out.clockIn = clockIn;
  if (notesOut) out.notesOut = notesOut;
  return out;
}

export function isLaunchpadMidiPort(name: string): boolean {
  return LP_MIDI.test(name);
}
