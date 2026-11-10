import { describe, expect, it } from 'vitest';
import { standardFakeAccess } from './fake';
import { NotesOutput, encodeOutput } from './notesOutput';
import { WebMidi } from './webMidi';

describe('encodeOutput', () => {
  it('encodes note and pressure messages with channel and clamping', () => {
    expect(encodeOutput({ type: 'noteOn', port: 'p', channel: 0, note: 60, velocity: 100 })).toEqual([
      0x90, 60, 100,
    ]);
    expect(encodeOutput({ type: 'noteOn', port: 'p', channel: 15, note: 60, velocity: 0 })).toEqual([
      0x9f, 60, 1,
    ]);
    expect(encodeOutput({ type: 'noteOff', port: 'p', channel: 2, note: 61 })).toEqual([0x82, 61, 0]);
    expect(encodeOutput({ type: 'polyPressure', port: 'p', channel: 1, note: 62, value: 200 })).toEqual([
      0xa1, 62, 127,
    ]);
    expect(encodeOutput({ type: 'channelPressure', port: 'p', channel: 3, value: -4 })).toEqual([0xd3, 0]);
  });
});

describe('NotesOutput', () => {
  it('sends to each message port and reports failed destinations', async () => {
    const access = standardFakeAccess();
    const midi = new WebMidi(() => Promise.resolve(access));
    await midi.requestAccess();
    const out = new NotesOutput(midi);
    const r = out.send([
      { type: 'noteOn', port: 'out-notes', channel: 0, note: 60, velocity: 90 },
      { type: 'noteOff', port: 'gone', channel: 0, note: 61 },
      { type: 'channelPressure', port: 'gone', channel: 0, value: 5 },
    ]);
    expect(r.sent).toBe(1);
    expect(r.failed).toEqual([{ port: 'gone', channel: 0, note: 61 }]);
    expect(access.outputs.get('out-notes')!.sent.map((s) => s.data)).toEqual([[0x90, 60, 90]]);
    expect(out.reachable('out-notes')).toBe(true);
    expect(out.reachable('gone')).toBe(false);
    access.unplug('out-notes');
    expect(out.reachable('out-notes')).toBe(false);
  });
});
