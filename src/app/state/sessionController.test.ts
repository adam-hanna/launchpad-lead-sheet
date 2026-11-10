import { describe, expect, it } from 'vitest';
import { LAYOUT_PROGRAMMER, LAYOUT_SESSION } from '@core/device';
import { ALL_LEDS } from '@core/grid';
import { stateAt } from '@core/lighting';
import { WebMidi } from '@adapters/midi';
import { standardFakeAccess } from '@adapters/midi/fake';
import { VirtualLaunchpad } from '@adapters/virtual';
import { DEMO_CHART } from './demoSheet';
import { SessionController } from './sessionController';

const LAYOUT_MSG = (layout: number) => [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, layout, 0x00, 0x00, 0xf7];
const isLedSysEx = (d: number[]) => d[0] === 0xf0 && d[6] === 0x03;
const isMode = (d: number[], on: boolean) => d[0] === 0xf0 && d[6] === 0x0e && d[7] === (on ? 1 : 0);

async function setup() {
  const access = standardFakeAccess();
  const midi = new WebMidi(() => Promise.resolve(access));
  const virtual = new VirtualLaunchpad(() => 0);
  let t = 0;
  const timers: { fn: () => void; at: number }[] = [];
  const controller = new SessionController({
    midi,
    virtual,
    now: () => t,
    setTimer: (fn, ms) => {
      const h = { fn, at: t + ms };
      timers.push(h);
      return h;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as { fn: () => void; at: number });
      if (i >= 0) timers.splice(i, 1);
    },
  });
  await controller.requestAccess();
  controller.loadChart(DEMO_CHART);
  const lpIn = access.inputs.get('in-lp')!;
  const lpOut = access.outputs.get('out-lp')!;
  const clockIn = access.inputs.get('in-clock')!;
  const advance = (ms: number) => {
    t += ms;
    for (const h of [...timers]) {
      if (h.at <= t) {
        timers.splice(timers.indexOf(h), 1);
        h.fn();
      }
    }
  };
  const clocks = (n: number, dt = 20) => {
    for (let i = 0; i < n; i++) {
      t += dt;
      clockIn.receive([0xf8], t);
    }
  };
  return { access, midi, virtual, controller, lpIn, lpOut, clockIn, advance, clocks, now: () => t };
}

describe('SessionController: first end-to-end light-up (M4-T7)', () => {
  it('access → autodetect → enter → confirm paints the complete frame on both Launchpads', async () => {
    const { controller, lpIn, lpOut, virtual } = await setup();
    let snap = controller.snapshot();
    expect(snap.access.kind).toBe('granted');
    expect(snap.selection).toEqual({
      lpIn: 'in-lp',
      lpOut: 'out-lp',
      clockIn: 'in-clock',
      notesOut: 'out-notes',
    });
    expect(snap.ownership.status).toBe('released');
    expect(snap.sheet.title).toBe('Demo changes');
    // the virtual Launchpad is painted immediately with the selected bar (bar 1: Cmaj7 in C)
    expect(stateAt(virtual.state().frame, 11).kind).toBe('rgb');

    controller.enterProgrammer();
    expect(lpOut.sent.some((s) => isMode(s.data, true))).toBe(true);
    expect(controller.snapshot().ownership.status).toBe('acquiring');
    expect(lpOut.sent.some((s) => isLedSysEx(s.data))).toBe(false); // nothing painted before confirmation

    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    snap = controller.snapshot();
    expect(snap.ownership.status).toBe('owned');
    const frames = lpOut.sent.filter((s) => isLedSysEx(s.data));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data.length).toBe(7 + ALL_LEDS.length * 3 + 1 - 0 + countRgbExtra(frames[0]!.data));
    expect(snap.active).toMatchObject({ status: 'inSheet', barIndex: 0, chordSymbol: 'Cmaj7', keyText: 'C' });
  });

  it('follows Live: Start + clocks move the harmony to bar 2 and send a diff; stop keeps the bar', async () => {
    const { controller, lpIn, lpOut, clockIn, clocks } = await setup();
    controller.enterProgrammer();
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    const before = lpOut.sent.length;
    clockIn.receive([0xfa], 0);
    expect(controller.snapshot().transport.state).toBe('playing');
    clocks(97); // first clock occupies tick 0, then 96 more → bar 2 tick 0
    const snap = controller.snapshot();
    expect(snap.transport.position).toMatchObject({ liveBar: 2, sheetBar: 2 });
    expect(snap.active).toMatchObject({ barIndex: 1, chordSymbol: 'Am7' });
    const diffs = lpOut.sent.slice(before).filter((s) => isLedSysEx(s.data));
    expect(diffs.length).toBeGreaterThan(0);
    // clock bytes are forwarded to the device for beat-locked flash
    expect(lpOut.sent.slice(before).filter((s) => s.data[0] === 0xf8).length).toBe(97);
    clockIn.receive([0xfc], 2000);
    expect(controller.snapshot().transport.state).toBe('stopped');
    // stopped: the editor selection (bar 1) is shown again
    expect(controller.snapshot().active.chordSymbol).toBe('Cmaj7');
  });

  it('half-bar changes select the second chord', async () => {
    const { controller, clockIn, clocks } = await setup();
    clockIn.receive([0xfa], 0);
    clocks(1 + 96 * 2); // bar 3 = | Dm7 G7 |
    expect(controller.snapshot().active).toMatchObject({ barIndex: 2, half: 0, chordSymbol: 'Dm7' });
    clocks(48);
    expect(controller.snapshot().active).toMatchObject({ barIndex: 2, half: 1, chordSymbol: 'G7' });
  });

  it('clock timeout fires through the injected timer', async () => {
    const { controller, clockIn, clocks, advance } = await setup();
    clockIn.receive([0xfa], 0);
    clocks(5);
    advance(600);
    expect(controller.snapshot().transport.state).toBe('lostClock');
  });

  it('hot-plug: unplugging the Launchpad disconnects, replugging re-enters and repaints', async () => {
    const { controller, access, lpIn, lpOut } = await setup();
    controller.enterProgrammer();
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    access.unplug('in-lp');
    expect(controller.snapshot().ownership.status).toBe('disconnected');
    const before = lpOut.sent.length;
    access.replug('in-lp');
    expect(controller.snapshot().ownership.status).toBe('acquiring');
    expect(lpOut.sent.slice(before).some((s) => isMode(s.data, true))).toBe(true);
    access.inputs.get('in-lp')!.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    expect(controller.snapshot().ownership.status).toBe('owned');
    expect(lpOut.sent.slice(before).filter((s) => isLedSysEx(s.data))).toHaveLength(1);
  });

  it('kick-out triggers bounded recovery; Restore cleans up and stays restored', async () => {
    const { controller, lpIn, lpOut } = await setup();
    controller.enterProgrammer();
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    const before = lpOut.sent.length;
    lpIn.receive(LAYOUT_MSG(LAYOUT_SESSION));
    expect(lpOut.sent.slice(before).some((s) => isMode(s.data, true))).toBe(true);
    controller.restoreLive();
    expect(lpOut.sent.some((s) => isMode(s.data, false))).toBe(true);
    expect(controller.snapshot().ownership).toMatchObject({ status: 'released', desired: 'released' });
    const after = lpOut.sent.length;
    lpIn.receive(LAYOUT_MSG(LAYOUT_SESSION));
    expect(lpOut.sent.length).toBe(after);
  });

  it('pad presses light feedback only when input is enabled; virtual pads always do', async () => {
    const { controller, lpIn, lpOut, virtual } = await setup();
    lpIn.receive([0x90, 11, 100]); // not owned yet → ignored
    expect(controller.snapshot().pressedCount).toBe(0);
    controller.enterProgrammer();
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    const before = lpOut.sent.length;
    lpIn.receive([0x90, 11, 100]);
    expect(controller.snapshot().pressedCount).toBe(1);
    expect(lpOut.sent.slice(before).filter((s) => isLedSysEx(s.data))).toHaveLength(1);
    expect(stateAt(virtual.state().frame, 11)).toEqual({ kind: 'rgb', rgb: [127, 127, 127] });
    lpIn.receive([0x90, 11, 0]);
    expect(controller.snapshot().pressedCount).toBe(0);
    virtual.press(12);
    expect(controller.snapshot().pressedCount).toBe(1);
    virtual.release(12);
  });

  it('clock input loss makes the transport unsynced; settings and selection re-render', async () => {
    const { controller, access, clockIn } = await setup();
    clockIn.receive([0xfa], 0);
    access.unplug('in-clock');
    expect(controller.snapshot().transport).toMatchObject({ state: 'unsynced', clockInputConnected: false });
    controller.selectBar(5);
    expect(controller.snapshot().active).toMatchObject({ barIndex: 4, chordSymbol: 'Fmaj7', keyText: 'F' });
    controller.updateSettings({ displayMode: 'key', relative: true });
    expect(controller.snapshot().settings).toMatchObject({ displayMode: 'key', relative: true });
    const bad = controller.loadChart('| Hm7 |');
    expect(bad.ok).toBe(false);
    expect(controller.snapshot().lastError).toMatch(/line 1/);
    const json = controller.loadSheetJson({ schemaVersion: 9 });
    expect(json.ok).toBe(false);
    controller.dispose();
  });
});

/** RGB specs are 5 bytes instead of 3; count the extra bytes in an LED SysEx to check completeness. */
function countRgbExtra(data: number[]): number {
  let i = 7;
  let extra = 0;
  while (i < data.length - 1) {
    const type = data[i];
    if (type === 0x03) {
      extra += 2;
      i += 5;
    } else if (type === 0x01) {
      extra += 1;
      i += 4;
    } else i += 3;
  }
  return extra;
}

describe('SessionController: note routing (M5)', () => {
  const notesOut = (access: ReturnType<typeof standardFakeAccess>) =>
    access.outputs.get('out-notes')!.sent.map((s) => s.data);

  async function owned() {
    const ctx = await setup();
    ctx.controller.enterProgrammer();
    ctx.lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    return ctx;
  }

  it('pad press sends Note On with velocity on the notes bus; release sends Note Off; feedback follows owned notes', async () => {
    const { controller, lpIn, access, virtual } = await owned();
    lpIn.receive([0x90, 11, 77]); // pad 11 = C1 (36) on the fourths grid
    expect(notesOut(access)).toEqual([[0x90, 36, 77]]);
    expect(controller.snapshot()).toMatchObject({ pressedCount: 1, heldNotes: [36] });
    expect(stateAt(virtual.state().frame, 11)).toEqual({ kind: 'rgb', rgb: [127, 127, 127] });
    lpIn.receive([0x90, 11, 0]);
    expect(notesOut(access)).toEqual([
      [0x90, 36, 77],
      [0x80, 36, 0],
    ]);
    expect(controller.snapshot().heldNotes).toEqual([]);
  });

  it('a remap during a hold keeps the original note; release sends the original Note Off', async () => {
    const { controller, lpIn, access } = await owned();
    lpIn.receive([0x90, 11, 100]);
    controller.updateSettings({ octaveShift: 1 }); // pad 11 now maps to 48
    lpIn.receive([0x90, 11, 100]); // duplicate for an active owner: no-op
    expect(controller.snapshot().heldNotes).toEqual([36]);
    lpIn.receive([0x90, 11, 0]);
    expect(notesOut(access)).toEqual([
      [0x90, 36, 100],
      [0x80, 36, 0],
    ]);
  });

  it('two pads with the same note: one Note On, one Note Off after the last release; virtual shares', async () => {
    const { lpIn, access, virtual, controller } = await owned();
    lpIn.receive([0x90, 16, 100]); // F#1 = 41... pad 16 = 36+5 = 41
    lpIn.receive([0x90, 21, 100]); // row 2 col 1 = 36+5 = 41 too
    virtual.press(16);
    expect(notesOut(access)).toEqual([[0x90, 41, 100]]);
    expect(controller.snapshot().pressedCount).toBe(3);
    lpIn.receive([0x90, 16, 0]);
    virtual.release(16);
    expect(notesOut(access)).toHaveLength(1);
    lpIn.receive([0x90, 21, 0]);
    expect(notesOut(access)).toEqual([
      [0x90, 41, 100],
      [0x80, 41, 0],
    ]);
  });

  it('poly pressure routes through ownership; channel pressure forwards on the notes channel', async () => {
    const { lpIn, access, controller } = await owned();
    controller.updateSettings({ notesChannel: 2 });
    lpIn.receive([0x90, 11, 100]);
    lpIn.receive([0xa0, 11, 64]);
    lpIn.receive([0xa0, 12, 64]); // unowned pad: dropped
    lpIn.receive([0xd0, 33]);
    expect(notesOut(access)).toEqual([
      [0x92, 36, 100],
      [0xa2, 36, 64],
      [0xd2, 33],
    ]);
  });

  it('kick-out and Restore release hardware-owned notes; Panic releases everything', async () => {
    const { lpIn, access, virtual, controller } = await owned();
    lpIn.receive([0x90, 11, 100]);
    virtual.press(12);
    lpIn.receive(LAYOUT_MSG(LAYOUT_SESSION)); // mode loss → hardware cleanup, virtual keeps sounding
    expect(controller.snapshot().heldNotes).toEqual([37]);
    expect(notesOut(access).at(-1)).toEqual([0x80, 36, 0]);
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    lpIn.receive([0x90, 11, 100]);
    controller.restoreLive();
    expect(controller.snapshot().heldNotes).toEqual([37]);
    controller.panic();
    expect(controller.snapshot().heldNotes).toEqual([]);
    expect(notesOut(access).at(-1)).toEqual([0x80, 37, 0]);
  });

  it('without a notes output nothing is owned; a missing output on send reports an error', async () => {
    const { lpIn, controller, access } = await owned();
    controller.selectPorts({ notesOut: undefined });
    lpIn.receive([0x90, 11, 100]);
    expect(controller.snapshot().pressedCount).toBe(0);
    controller.selectPorts({ notesOut: 'out-notes' });
    lpIn.receive([0x90, 11, 100]);
    access.unplug('out-notes');
    access.outputs.get('out-notes')!.failNextSend = true;
    lpIn.receive([0x90, 11, 0]);
    expect(controller.snapshot().lastError).toMatch(/could not be sent/);
  });
});
