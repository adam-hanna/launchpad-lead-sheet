import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { standardFakeAccess } from './fake';
import {
  INQUIRY_REQUEST,
  autodetectPorts,
  decodeInquiryReply,
  identify,
  isLaunchpadMidiPort,
} from './inquiry';
import { WebMidi } from './webMidi';

// F0 7E 00 06 02 00 20 29 13 01 00 00 <v1 v2 v3 v4> F7
const PRO_MK3_REPLY = [
  0xf0, 0x7e, 0x00, 0x06, 0x02, 0x00, 0x20, 0x29, 0x23, 0x01, 0x00, 0x00, 0, 1, 2, 2, 0xf7,
];

describe('decodeInquiryReply', () => {
  it('decodes the Pro MK3 application reply and firmware digits', () => {
    expect(decodeInquiryReply(PRO_MK3_REPLY)).toEqual({
      manufacturer: [0x00, 0x20, 0x29],
      family: 0x23,
      member: 0x01,
      version: '0122',
      model: 'launchpad-pro-mk3',
    });
  });
  it('recognises bootloader, X, Mini MK3 and unknown devices', () => {
    const with_ = (family: number, member: number, manu = [0x00, 0x20, 0x29]) => [
      0xf0,
      0x7e,
      0x00,
      0x06,
      0x02,
      ...manu,
      family,
      member,
      0,
      0,
      1,
      0,
      0,
      0,
      0xf7,
    ];
    expect(decodeInquiryReply(with_(0x23, 0x11))!.model).toBe('launchpad-pro-mk3-bootloader');
    expect(decodeInquiryReply(with_(0x03, 0x01))!.model).toBe('launchpad-x');
    expect(decodeInquiryReply(with_(0x13, 0x01))!.model).toBe('launchpad-mini-mk3');
    expect(decodeInquiryReply(with_(0x23, 0x01, [0x00, 0x00, 0x7f]))!.model).toBe('unknown');
  });
  it('rejects non-inquiry messages', () => {
    expect(decodeInquiryReply([0x90, 60, 100])).toBeNull();
    expect(decodeInquiryReply([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, 0x11, 0x00, 0x00, 0xf7])).toBeNull();
    expect(decodeInquiryReply(PRO_MK3_REPLY.slice(0, 10))).toBeNull();
  });
});

describe('identify', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends the inquiry and resolves with the decoded reply', async () => {
    const access = standardFakeAccess();
    const m = new WebMidi(() => Promise.resolve(access));
    await m.requestAccess();
    const p = identify(m, 'out-lp', 'in-lp');
    expect(access.outputs.get('out-lp')!.sent[0]!.data).toEqual([...INQUIRY_REQUEST]);
    access.inputs.get('in-lp')!.receive([0x90, 11, 1]); // unrelated traffic is ignored
    access.inputs.get('in-lp')!.receive(PRO_MK3_REPLY);
    expect((await p)!.model).toBe('launchpad-pro-mk3');
    expect(access.inputs.get('in-lp')!.onmidimessage).toBeNull(); // unsubscribed
  });

  it('resolves null on timeout and when the output is missing', async () => {
    const access = standardFakeAccess();
    const m = new WebMidi(() => Promise.resolve(access));
    await m.requestAccess();
    const p = identify(m, 'out-lp', 'in-lp', 200);
    vi.advanceTimersByTime(250);
    expect(await p).toBeNull();
    expect(await identify(m, 'missing', 'in-lp')).toBeNull();
  });
});

describe('autodetectPorts', () => {
  const ports = standardFakeAccess();
  const m = new WebMidi(() => Promise.resolve(ports));

  it('picks the Launchpad MIDI pair (never DAW) and the IAC buses by name', async () => {
    await m.requestAccess();
    expect(autodetectPorts(m.ports())).toEqual({
      lpIn: 'in-lp',
      lpOut: 'out-lp',
      clockIn: 'in-clock',
      notesOut: 'out-notes',
    });
  });
  it('prefers remembered ids that are still connected; falls back when they are gone', async () => {
    await m.requestAccess();
    expect(autodetectPorts(m.ports(), { clockIn: 'in-lp' }).clockIn).toBe('in-lp');
    expect(autodetectPorts(m.ports(), { clockIn: 'gone' }).clockIn).toBe('in-clock');
    ports.unplug('in-clock');
    expect(autodetectPorts(m.ports()).clockIn).toBeUndefined();
    ports.replug('in-clock');
  });
  it('omits missing ports and matches real-world names', () => {
    expect(autodetectPorts([])).toEqual({});
    expect(isLaunchpadMidiPort('LPProMK3 MIDI')).toBe(true);
    expect(isLaunchpadMidiPort('Launchpad Pro MK3 LPProMK3 MIDI')).toBe(true);
    expect(isLaunchpadMidiPort('LPProMK3 DAW')).toBe(false);
    expect(isLaunchpadMidiPort('LPProMK3 DIN')).toBe(false);
    expect(isLaunchpadMidiPort('Launchpad Pro MK3 DAW Out')).toBe(false);
  });
});
