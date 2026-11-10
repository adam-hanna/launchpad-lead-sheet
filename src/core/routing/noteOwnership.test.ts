import { describe, expect, it } from 'vitest';
import { NoteOwnership, type NoteOwner, type OutputMessage } from './noteOwnership';

const hw = (pad: number): NoteOwner => ({ source: 'hw', pad });
const vt = (pad: number): NoteOwner => ({ source: 'virtual', pad });
const dest = (note: number, velocity = 100, port = 'out-notes', channel = 0) => ({
  port,
  channel,
  note,
  velocity,
});
const kinds = (m: OutputMessage[]) =>
  m.map((x) =>
    x.type === 'noteOn'
      ? `on:${String(x.note)}@${String(x.velocity)}`
      : x.type === 'noteOff'
        ? `off:${String(x.note)}`
        : x.type === 'polyPressure'
          ? `pp:${String(x.note)}=${String(x.value)}`
          : `cp=${String(x.value)}`,
  );

describe('NoteOwnership (plan §4.1 acceptance)', () => {
  it('two hardware pads and one virtual pad hold the same note; release in any order → one on, one off', () => {
    const o = new NoteOwnership();
    expect(kinds(o.press(hw(11), dest(60, 100)))).toEqual(['on:60@100']);
    expect(kinds(o.press(hw(22), dest(60, 50)))).toEqual([]); // second owner: no retrigger, velocity ignored
    expect(kinds(o.press(vt(11), dest(60, 1)))).toEqual([]);
    expect(o.activeNotes()).toEqual(new Set([60]));
    // a layout change happened in between: owners keep their recorded destinations
    expect(kinds(o.release(hw(22)))).toEqual([]);
    expect(kinds(o.release(vt(11)))).toEqual([]);
    expect(o.activeNotes()).toEqual(new Set([60]));
    expect(kinds(o.release(hw(11)))).toEqual(['off:60']);
    expect(o.ownerCount()).toBe(0);
  });

  it('the Note Off reaches the original port and channel after a port/channel change', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60, 100, 'A', 2));
    // settings changed to port B channel 0; the held note still belongs to A/2
    const off = o.release(hw(11));
    expect(off).toEqual([{ type: 'noteOff', port: 'A', channel: 2, note: 60 }]);
  });

  it('press C4, remap pad to D4, duplicate Note On, release → one C4 on, one C4 off, no D4; counts zero', () => {
    const o = new NoteOwnership();
    expect(kinds(o.press(hw(11), dest(60)))).toEqual(['on:60@100']);
    expect(kinds(o.press(hw(11), dest(62)))).toEqual([]); // idempotent; record preserved
    expect(o.owned(hw(11))?.note).toBe(60);
    expect(kinds(o.release(hw(11)))).toEqual(['off:60']);
    expect(o.activeDestinations()).toEqual([]);
    // the same with a second owner sharing C4
    o.press(hw(11), dest(60));
    o.press(vt(33), dest(60));
    o.press(hw(11), dest(62));
    expect(kinds(o.release(hw(11)))).toEqual([]);
    expect(kinds(o.release(vt(33)))).toEqual(['off:60']);
  });

  it('unknown release never decrements; Panic then late release is a no-op', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60));
    o.press(hw(12), dest(60));
    expect(kinds(o.release(hw(99)))).toEqual([]);
    expect(kinds(o.release(vt(11)))).toEqual([]);
    const p = o.panic();
    expect(kinds(p.messages)).toEqual(['off:60']);
    expect(p.unreachable).toEqual([]);
    expect(kinds(o.release(hw(11)))).toEqual([]);
    expect(kinds(o.release(hw(12)))).toEqual([]);
    expect(o.ownerCount()).toBe(0);
  });

  it('Panic only sends to reachable destinations and reports the rest', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60, 100, 'gone'));
    o.press(hw(12), dest(62, 100, 'here'));
    const p = o.panic((port) => port === 'here');
    expect(kinds(p.messages)).toEqual(['off:62']);
    expect(p.unreachable).toEqual([{ port: 'gone', channel: 0, note: 60 }]);
  });

  it('releaseSource releases only one source and respects refcounts (hardware cleanup)', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60));
    o.press(vt(11), dest(60));
    o.press(hw(12), dest(64));
    expect(kinds(o.releaseSource('hw'))).toEqual(['off:64']); // 60 survives: the virtual owner still holds it
    expect(o.activeNotes()).toEqual(new Set([60]));
    expect(kinds(o.releaseSource('virtual'))).toEqual(['off:60']);
  });

  it('releasePort releases owners on that port only', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60, 100, 'A'));
    o.press(hw(12), dest(62, 100, 'B'));
    expect(kinds(o.releasePort('A'))).toEqual(['off:60']);
    expect(o.isActive(hw(12))).toBe(true);
  });
});

describe('pressure routing (plan §4.10 acceptance)', () => {
  it('poly pressure is the max across owners, emitted only on change, recomputed on release', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60));
    o.press(hw(22), dest(60));
    o.press(vt(11), dest(60)); // a virtual owner with no pressure input counts as 0
    expect(kinds(o.polyPressure(hw(11), 90))).toEqual(['pp:60=90']);
    expect(kinds(o.polyPressure(hw(22), 40))).toEqual([]); // max unchanged
    expect(kinds(o.polyPressure(hw(22), 40))).toEqual([]);
    expect(kinds(o.release(hw(11)))).toEqual(['pp:60=40']); // loudest released → remaining max without a new event
    expect(kinds(o.release(hw(22)))).toEqual(['pp:60=0']);
    expect(kinds(o.release(vt(11)))).toEqual(['off:60']);
  });
  it('pressure on an unowned pad is dropped; channel pressure is forwarded as is', () => {
    const o = new NoteOwnership();
    expect(o.polyPressure(hw(11), 50)).toEqual([]);
    expect(o.channelPressure('out', 3, 77)).toEqual([
      { type: 'channelPressure', port: 'out', channel: 3, value: 77 },
    ]);
  });
  it('pressure on two different notes is independent', () => {
    const o = new NoteOwnership();
    o.press(hw(11), dest(60));
    o.press(hw(12), dest(61));
    expect(kinds(o.polyPressure(hw(11), 10))).toEqual(['pp:60=10']);
    expect(kinds(o.polyPressure(hw(12), 20))).toEqual(['pp:61=20']);
  });
});
