import { describe, expect, it } from 'vitest';
import { DeviceOwnership, type OwnershipEffect } from './ownership';
import { LAYOUT_NOTE, LAYOUT_PROGRAMMER, LAYOUT_SESSION } from './protocol';

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}
const types = (fx: OwnershipEffect[]) =>
  fx.map((e) =>
    e.type === 'send'
      ? `send:${e.command}`
      : e.type === 'inputEnabled'
        ? `input:${String(e.enabled)}`
        : e.type === 'statusChanged'
          ? `status:${e.status}`
          : e.type,
  );

/** Connect, enter, confirm programmer mode. */
function owned() {
  const c = clock();
  const o = new DeviceOwnership(c.now);
  o.deviceConnected();
  o.userEnter();
  o.layoutObserved(LAYOUT_PROGRAMMER);
  expect(o.snapshot().status).toBe('owned');
  return { c, o };
}

describe('DeviceOwnership: acquisition', () => {
  it('starts disconnected and released; Enter before connect only records intent', () => {
    const o = new DeviceOwnership(() => 0);
    expect(o.snapshot()).toMatchObject({ status: 'disconnected', desired: 'released', inputEnabled: false });
    expect(types(o.userEnter())).toEqual(['invalidateFrame']);
    expect(o.snapshot().desired).toBe('ours');
    expect(types(o.deviceConnected())).toEqual([
      'invalidateFrame',
      'send:enterProgrammer',
      'status:acquiring',
    ]);
  });

  it('confirming Programmer mode repaints, then enables input, in that order', () => {
    const o = new DeviceOwnership(() => 0);
    o.deviceConnected();
    o.userEnter();
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual(['repaint', 'input:true', 'status:owned']);
    // a repeated programmer notification with input already enabled does nothing
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual([]);
  });

  it('a layout report while released is ignored and input stays gated', () => {
    const o = new DeviceOwnership(() => 0);
    o.deviceConnected();
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual([]);
    expect(o.snapshot()).toMatchObject({ status: 'released', inputEnabled: false });
    expect(types(o.layoutObserved(LAYOUT_NOTE))).toEqual([]);
  });
});

describe('DeviceOwnership: Restore (plan §4.2 acceptance)', () => {
  it('cleanup precedes the Live-mode command, and nothing auto-reacquires afterwards', () => {
    const { o } = owned();
    expect(types(o.userRestore())).toEqual([
      'input:false',
      'cleanupHardwareOwners',
      'send:restoreLive',
      'status:released',
    ]);
    expect(types(o.layoutObserved(LAYOUT_NOTE))).toEqual([]);
    expect(types(o.deviceDisconnected())).toEqual([
      'cleanupHardwareOwners',
      'invalidateFrame',
      'status:disconnected',
    ]);
    expect(types(o.deviceConnected())).toEqual(['invalidateFrame', 'status:released']);
    expect(o.snapshot().desired).toBe('released');
  });
});

describe('DeviceOwnership: disconnect and reconnect', () => {
  it('unplug cleans up and gates input but preserves desired; replug reacquires automatically', () => {
    const { o } = owned();
    expect(types(o.deviceDisconnected())).toEqual([
      'input:false',
      'cleanupHardwareOwners',
      'invalidateFrame',
      'status:disconnected',
    ]);
    expect(o.snapshot().desired).toBe('ours');
    expect(types(o.deviceConnected())).toEqual([
      'invalidateFrame',
      'send:enterProgrammer',
      'status:acquiring',
    ]);
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual(['repaint', 'input:true', 'status:owned']);
  });
});

describe('DeviceOwnership: unexpected mode loss and bounded recovery', () => {
  it('kick-out: gate input, clean up, invalidate, re-enter; desired preserved', () => {
    const { o } = owned();
    expect(types(o.layoutObserved(LAYOUT_SESSION))).toEqual([
      'input:false',
      'cleanupHardwareOwners',
      'invalidateFrame',
      'send:enterProgrammer',
      'status:acquiring',
    ]);
    expect(o.snapshot()).toMatchObject({ desired: 'ours', reentries: 1 });
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual(['repaint', 'input:true', 'status:owned']);
  });

  it('three kick-outs within 10 s → conflict; no further SysEx until manual retry', () => {
    const { c, o } = owned();
    for (let i = 0; i < 3; i++) {
      expect(types(o.layoutObserved(LAYOUT_SESSION))).toContain('send:enterProgrammer');
      o.layoutObserved(LAYOUT_PROGRAMMER);
      c.advance(1000);
    }
    const fx = o.layoutObserved(LAYOUT_SESSION);
    expect(types(fx)).not.toContain('send:enterProgrammer');
    expect(types(fx)).toContain('status:conflict');
    expect(o.snapshot()).toMatchObject({ status: 'conflict', desired: 'ours', conflict: true });
    expect(types(o.layoutObserved(LAYOUT_NOTE))).toEqual([]);
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual([]); // suspended even if it comes back
    // replug while in conflict does not auto-enter either
    o.deviceDisconnected();
    expect(types(o.deviceConnected())).toEqual(['invalidateFrame', 'status:conflict']);
  });

  it('kick-outs spread over more than the window do not trigger conflict', () => {
    const { c, o } = owned();
    for (let i = 0; i < 5; i++) {
      expect(types(o.layoutObserved(LAYOUT_SESSION))).toContain('send:enterProgrammer');
      o.layoutObserved(LAYOUT_PROGRAMMER);
      c.advance(6000);
    }
    expect(o.snapshot().conflict).toBe(false);
  });

  it('manual retry clears the flag and attempts once; success resumes, another kick-out re-raises immediately', () => {
    const { c, o } = owned();
    for (let i = 0; i < 4; i++) {
      o.layoutObserved(LAYOUT_SESSION);
      if (i < 3) o.layoutObserved(LAYOUT_PROGRAMMER);
      c.advance(100);
    }
    expect(o.snapshot().status).toBe('conflict');
    expect(types(o.userEnter())).toEqual(['invalidateFrame', 'send:enterProgrammer', 'status:acquiring']);
    expect(o.snapshot().conflict).toBe(false);
    // failure: kicked out again right away → conflict without three attempts
    expect(types(o.layoutObserved(LAYOUT_SESSION))).toEqual(['invalidateFrame', 'status:conflict']);
    // retry again, this time it sticks
    o.userEnter();
    expect(types(o.layoutObserved(LAYOUT_PROGRAMMER))).toEqual(['repaint', 'input:true', 'status:owned']);
    // normal bounded recovery applies again afterwards
    expect(types(o.layoutObserved(LAYOUT_SESSION))).toContain('send:enterProgrammer');
  });

  it('Enter while already acquiring just resends', () => {
    const o = new DeviceOwnership(() => 0);
    o.deviceConnected();
    o.userEnter();
    expect(types(o.userEnter())).toEqual(['invalidateFrame', 'send:enterProgrammer']);
  });
});
