import { describe, expect, it } from 'vitest';
import { LAYOUT_PROGRAMMER, LAYOUT_SESSION } from '@core/device';
import { ALL_LEDS } from '@core/grid';
import { stateAt } from '@core/lighting';
import { WebMidi } from '@adapters/midi';
import { standardFakeAccess } from '@adapters/midi/fake';
import { VirtualLaunchpad } from '@adapters/virtual';
import { Autosave, MemoryKv, MemoryStorage, SettingsStore, SheetStore } from '@adapters/storage';
import { DEMO_CHART } from './demoSheet';
import { SessionController } from './sessionController';

const LAYOUT_MSG = (layout: number) => [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, layout, 0x00, 0x00, 0xf7];
const isLedSysEx = (d: number[]) => d[0] === 0xf0 && d[6] === 0x03;
const isMode = (d: number[], on: boolean) => d[0] === 0xf0 && d[6] === 0x0e && d[7] === (on ? 1 : 0);
const isLayoutQuery = (d: number[]) => d.length === 8 && d[0] === 0xf0 && d[6] === 0x00 && d[7] === 0xf7;

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

describe('SessionController: ports remembered from the last visit (#156)', () => {
  it('binds the Launchpad and the clock after access even when autodetect changes nothing', async () => {
    const storage = new MemoryStorage();
    new SettingsStore(storage).savePorts({
      lpIn: 'in-lp',
      lpOut: 'out-lp',
      clockIn: 'in-clock',
      notesOut: 'out-notes',
    });
    const access = standardFakeAccess();
    const midi = new WebMidi(() => Promise.resolve(access));
    const sheets = new SheetStore(new MemoryKv());
    const controller = new SessionController({
      midi,
      virtual: new VirtualLaunchpad(() => 0),
      setTimer: () => 0,
      clearTimer: () => undefined,
      persistence: {
        sheets,
        autosave: new Autosave(sheets, { onSaved: () => undefined, onError: () => undefined }),
        settings: new SettingsStore(storage),
      },
    });
    expect(controller.snapshot().selection.lpIn).toBe('in-lp'); // restored before access
    await controller.requestAccess();
    expect(controller.snapshot().ownership.status).toBe('released'); // connected, not 'disconnected'
    controller.enterProgrammer();
    expect(access.outputs.get('out-lp')!.sent.some((s) => isMode(s.data, true))).toBe(true);
    access.inputs.get('in-clock')!.receive([0xfa], 0);
    access.inputs.get('in-clock')!.receive([0xf8], 0);
    expect(controller.snapshot().transport.state).toBe('playing');
  });
});

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

  it('queries the layout after every mode command, because the device does not announce it (ADR-0004)', async () => {
    const { controller, access, lpIn, lpOut } = await setup();
    const queriesAfter = (from: number) => lpOut.sent.slice(from).filter((s) => isLayoutQuery(s.data));
    let mark = lpOut.sent.length;
    controller.enterProgrammer();
    const sent = lpOut.sent.slice(mark).map((s) => s.data);
    expect(sent.findIndex((d) => isMode(d, true))).toBeLessThan(sent.findIndex(isLayoutQuery));
    expect(queriesAfter(mark)).toHaveLength(1);
    // The reply to the query is what confirms ownership.
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    expect(controller.snapshot().ownership.status).toBe('owned');

    mark = lpOut.sent.length;
    controller.restoreLive();
    expect(queriesAfter(mark)).toHaveLength(1);

    controller.enterProgrammer();
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    access.unplug('in-lp');
    mark = lpOut.sent.length;
    access.replug('in-lp');
    expect(queriesAfter(mark)).toHaveLength(1);
  });

  it('treats missing MIDI timestamps (Chrome on macOS sends 0) as arrival time, so Start plays', async () => {
    const { controller, clockIn, advance } = await setup();
    advance(1_800_000); // half an hour into the session: event time 0 is now far in the past
    clockIn.receive([0xf2, 0, 0], 0);
    clockIn.receive([0xfa], 0);
    for (let i = 0; i < 30; i++) {
      advance(20);
      clockIn.receive([0xf8], 0);
    }
    expect(controller.snapshot().transport.state).toBe('playing');
    expect(controller.snapshot().transport.position).toMatchObject({ liveBar: 1, tickInBar: 29 });
    clockIn.receive([0xfc], 0);
    expect(controller.snapshot().transport.state).toBe('stopped');
    // A real stall is still detected from arrival times.
    clockIn.receive([0xfb], 0);
    advance(600);
    expect(controller.snapshot().transport.state).toBe('lostClock');
  });

  it('a connection open/close event is not a replug: no rebind, no second Programmer request', async () => {
    const { controller, access, lpIn, lpOut } = await setup();
    controller.enterProgrammer();
    const modeRequests = () => lpOut.sent.filter((s) => isMode(s.data, true)).length;
    expect(modeRequests()).toBe(1);
    access.touch('out-lp'); // Chrome opens the output on the first send and fires statechange
    access.touch('in-lp');
    expect(modeRequests()).toBe(1);
    // The reply to the first query still reaches the (unchanged) driver.
    lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    expect(controller.snapshot().ownership.status).toBe('owned');
    // A real replug is still handled.
    access.unplug('in-lp');
    expect(controller.snapshot().ownership.status).toBe('disconnected');
    access.replug('in-lp');
    expect(modeRequests()).toBe(2);
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
    expect(controller.snapshot().lastError).toMatch(/stuck/);
  });
});

describe('SessionController: cleanup rules, held-note safety and buttons (M5-T5..T7)', () => {
  const notesOut = (access: ReturnType<typeof standardFakeAccess>, id = 'out-notes') =>
    access.outputs.get(id)!.sent.map((s) => s.data);

  async function owned() {
    const ctx = await setup();
    ctx.controller.enterProgrammer();
    ctx.lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    return ctx;
  }

  it('output disconnect while holding → note becomes stuck; replug flushes the Note Off before new notes', async () => {
    const { controller, lpIn, access } = await owned();
    lpIn.receive([0x90, 11, 100]);
    access.unplug('out-notes');
    const snap = controller.snapshot();
    expect(snap.heldNotes).toEqual([]);
    expect(snap.stuck).toEqual([{ port: 'out-notes', notes: [36] }]);
    expect(snap.lastError).toMatch(/stuck/);
    // while blocked, presses are refused (the fake still accepts sends, so flush would succeed; block it)
    access.outputs.get('out-notes')!.failNextSend = true;
    lpIn.receive([0x90, 12, 100]);
    expect(controller.snapshot().pressedCount).toBe(0);
    expect(controller.snapshot().stuck).toHaveLength(1);
    // the port returns: pending Note Off is delivered first, then new notes flow
    access.replug('out-notes');
    expect(controller.snapshot().stuck).toEqual([]);
    expect(notesOut(access).at(-1)).toEqual([0x80, 36, 0]);
    lpIn.receive([0x90, 12, 100]);
    expect(controller.snapshot().heldNotes).toEqual([37]);
  });

  it('a different output never clears the stuck record', async () => {
    const { controller, lpIn, access } = await owned();
    lpIn.receive([0x90, 11, 100]);
    access.unplug('out-notes');
    controller.selectPorts({ notesOut: 'out-daw' });
    expect(controller.snapshot().stuck).toEqual([{ port: 'out-notes', notes: [36] }]);
    lpIn.receive([0x90, 12, 100]);
    expect(notesOut(access, 'out-daw')).toEqual([[0x90, 37, 100]]);
  });

  it('changing the notes output releases held notes to the old port first', async () => {
    const { controller, lpIn, access } = await owned();
    lpIn.receive([0x90, 11, 100]);
    controller.selectPorts({ notesOut: 'out-daw' });
    expect(notesOut(access)).toEqual([
      [0x90, 36, 100],
      [0x80, 36, 0],
    ]);
    expect(controller.snapshot().heldNotes).toEqual([]);
    lpIn.receive([0x90, 11, 100]);
    expect(notesOut(access, 'out-daw')).toEqual([[0x90, 36, 100]]);
  });

  it('Panic with an unreachable output records the stuck notes', async () => {
    const { controller, lpIn, access } = await owned();
    lpIn.receive([0x90, 11, 100]);
    access.outputs.get('out-notes')!.state = 'disconnected'; // gone without a statechange
    controller.panic();
    expect(controller.snapshot().stuck).toEqual([{ port: 'out-notes', notes: [36] }]);
    expect(controller.snapshot().lastError).toMatch(/could not be silenced/);
  });

  it('octave buttons shift the register with LED feedback; a held note keeps its original pitch', async () => {
    const { controller, lpIn, access, virtual } = await owned();
    expect(stateAt(virtual.state().frame, 80)).toEqual({ kind: 'rgb', rgb: [20, 20, 20] });
    lpIn.receive([0x90, 11, 100]); // C1 = 36
    lpIn.receive([0xb0, 80, 127]); // ↑
    lpIn.receive([0xb0, 80, 0]);
    expect(controller.snapshot().settings.octaveShift).toBe(1);
    expect(stateAt(virtual.state().frame, 80)).toEqual({ kind: 'rgb', rgb: [45, 45, 45] });
    lpIn.receive([0x90, 12, 100]); // C#2 = 49 after the shift
    lpIn.receive([0x90, 11, 0]); // releases the ORIGINAL 36
    expect(notesOut(access)).toEqual([
      [0x90, 36, 100],
      [0x90, 49, 100],
      [0x80, 36, 0],
    ]);
    virtual.pressButton(70);
    virtual.pressButton(70);
    expect(controller.snapshot().settings.octaveShift).toBe(-1);
    for (let i = 0; i < 20; i++) virtual.pressButton(70);
    expect(controller.snapshot().settings.octaveShift).toBe(-4);
    expect(stateAt(virtual.state().frame, 70)).toEqual({ kind: 'off' });
    controller.updateSettings({ octaveShift: 99 });
    expect(controller.snapshot().settings.octaveShift).toBe(6);
  });
});

describe('SessionController: persistence (E6.4)', () => {
  it('loads stored settings and ports, saves settings and ports, autosaves sheets and remembers the last one', async () => {
    const { MemoryKv, SheetStore, Autosave, SettingsStore, MemoryStorage } =
      await import('@adapters/storage');
    const kv = new MemoryKv();
    const sheets = new SheetStore(kv);
    const storage = new MemoryStorage();
    const settings = new SettingsStore(storage);
    settings.saveSettings({ ...(await import('@core/settings')).DEFAULT_SETTINGS, relative: true });
    settings.savePorts({ clockIn: 'in-clock' });
    const saved: string[] = [];
    let ctl: SessionController | null = null;
    const autosave = new Autosave(sheets, {
      debounceMs: 0,
      setTimer: (fn) => {
        fn();
        return 0;
      },
      clearTimer: () => undefined,
      onSaved: (id) => {
        saved.push(id);
        ctl?.onSaved(id);
      },
      onError: (id, e) => ctl?.onSaveError(id, e),
    });
    const access = standardFakeAccess();
    const midi = new WebMidi(() => Promise.resolve(access));
    const controller = new SessionController({
      midi,
      virtual: new VirtualLaunchpad(),
      persistence: { sheets, autosave, settings },
    });
    ctl = controller;
    expect(controller.snapshot().settings.relative).toBe(true);
    expect(controller.snapshot().selection).toEqual({ clockIn: 'in-clock' });

    await controller.openLastOrDemo();
    expect(controller.snapshot().sheet.title).toBe('Demo changes');
    await autosave.settled();
    expect(saved).toEqual(['demo']);
    expect(await sheets.lastOpened()).toBe('demo');
    expect(controller.snapshot().save).toBe('saved');

    controller.updateSettings({ displayMode: 'chord' });
    expect(settings.loadSettings().displayMode).toBe('chord');
    await controller.requestAccess();
    expect(settings.loadPorts().lpIn).toBe('in-lp');

    controller.loadChart('title: Mine\n| D |', 'mine');
    await autosave.settled();
    expect((await sheets.list()).sheets.map((s) => s.id).sort()).toEqual(['demo', 'mine']);

    // a second controller reopens the last sheet instead of the demo
    const again = new SessionController({
      midi,
      virtual: new VirtualLaunchpad(),
      persistence: { sheets, autosave, settings },
    });
    await again.openLastOrDemo();
    expect(again.snapshot().sheet.title).toBe('Mine');
    expect(again.snapshot().save).toBe('saved');

    kv.failSet = (key) => key === 'sheet:broken';
    controller.loadChart('title: Broken save\n| E |', 'broken');
    await autosave.settled();
    expect(controller.snapshot().save).toBe('error');
    expect(controller.snapshot().lastError).toMatch(/Export JSON/);
  });
});

describe('SessionController: editing API (E6.2)', () => {
  it('updates, inserts and removes bars; edits metadata with validation; duplicates and exports', async () => {
    const { controller } = await setup();
    const { parseChord, parseKeyToken } = await import('@core/theory');
    controller.updateBar(1, { key: parseKeyToken('G'), chords: [parseChord('Em7')], section: 'Verse' });
    let bar = controller.snapshot().sheet.bars[1]!;
    expect(bar.key).toMatchObject({ root: 7 });
    expect(bar.chords?.map((c) => c.symbol)).toEqual(['Em7']);
    expect(bar.section).toBe('Verse');
    controller.updateBar(1, { key: 'inherit', chords: 'inherit', section: null });
    bar = controller.snapshot().sheet.bars[1]!;
    expect(bar).toEqual({});
    controller.updateBar(1, { key: null, chords: [] });
    expect(controller.snapshot().sheet.bars[1]).toEqual({ key: null, chords: [] });

    controller.insertBar(0);
    expect(controller.snapshot().sheet.bars).toHaveLength(9);
    expect(controller.snapshot().sheet.bars[0]).toEqual({});
    expect(controller.snapshot().selectedBar).toBe(1);
    controller.insertBar(99);
    expect(controller.snapshot().sheet.bars).toHaveLength(10);
    controller.removeBar(0);
    controller.removeBar(8);
    expect(controller.snapshot().sheet.bars).toHaveLength(8);
    controller.removeBar(42); // no-op

    expect(
      controller.updateMeta({ title: 'Edited', tempoNote: 100, loop: { startBar: 1, endBar: 8 } }),
    ).toEqual([]);
    expect(controller.snapshot().sheet).toMatchObject({
      title: 'Edited',
      tempoNote: 100,
      loop: { startBar: 1, endBar: 8 },
    });
    expect(controller.updateMeta({ loop: { startBar: 1, endBar: 9 } }).length).toBeGreaterThan(0);
    expect(controller.snapshot().sheet.loop).toEqual({ startBar: 1, endBar: 8 });
    expect(controller.updateMeta({ meter: { numerator: 0, denominator: 4 } }).length).toBeGreaterThan(0);
    controller.removeBar(7); // loop end beyond the bars → loop dropped
    expect(controller.snapshot().sheet.loop).toBeUndefined();
    expect(controller.updateMeta({ tempoNote: null, loop: null })).toEqual([]);
    expect(controller.snapshot().sheet.tempoNote).toBeUndefined();

    const before = controller.snapshot().sheet.id;
    controller.duplicateSheet();
    expect(controller.snapshot().sheet.id).not.toBe(before);
    expect(controller.snapshot().sheet.title).toBe('Edited (copy)');
    expect(controller.exportText()).toContain('title: Edited (copy)');
    expect(controller.exportJson()).toContain('"schemaVersion": 1');

    controller.newSheet('Fresh');
    expect(controller.snapshot().sheet).toMatchObject({ title: 'Fresh' });
    expect(controller.snapshot().sheet.bars).toHaveLength(4);

    const r = await controller.importJson(controller.exportJson());
    expect(r.ok && r.copied).toBe(true); // same id as the current sheet → copy
    const bad = await controller.importJson('nope');
    expect(bad.ok).toBe(false);
    expect(controller.snapshot().lastError).toMatch(/not valid JSON/);
    expect(await controller.library()).toEqual([]); // no persistence configured
    expect(await controller.openSheet('x')).toBe(false);
    await controller.deleteSheet('x');
  });
});

describe('SessionController: should-haves (M7-T1..T4)', () => {
  it('custom theme colours reach the frame; clock offset shifts the displayed position', async () => {
    const { controller, virtual, clockIn, clocks } = await setup();
    controller.updateSettings({
      themeName: 'custom',
      customTheme: {
        ...controller.snapshot().settings.customTheme,
        colours: { ...controller.snapshot().settings.customTheme.colours, third: [1, 2, 3] },
      },
    });
    expect(stateAt(virtual.state().frame, 15)).toEqual({ kind: 'rgb', rgb: [1, 2, 3] }); // E1 = third of Cmaj7
    clockIn.receive([0xfa], 0);
    clocks(10);
    expect(controller.snapshot().transport.position?.tickInBar).toBe(9);
    controller.updateSettings({ clockOffsetTicks: 5 });
    expect(controller.snapshot().transport.position?.tickInBar).toBe(14);
    controller.updateSettings({ clockOffsetTicks: -20 });
    expect(controller.snapshot().transport.position?.tickInBar).toBe(0); // clamped at 1.1.1
  });

  it('beat indicator lights the current beat on the top row while playing; look-ahead pulses changing pads in the last beat', async () => {
    const { controller, virtual, clockIn, clocks } = await setup();
    expect(stateAt(virtual.state().frame, 91).kind).toBe('off');
    clockIn.receive([0xfa], 0);
    clocks(1);
    expect(stateAt(virtual.state().frame, 91)).toEqual({ kind: 'rgb', rgb: [110, 110, 110] });
    expect(stateAt(virtual.state().frame, 92)).toEqual({ kind: 'rgb', rgb: [10, 10, 10] });
    clocks(24);
    expect(stateAt(virtual.state().frame, 92)).toEqual({ kind: 'rgb', rgb: [110, 110, 110] });
    controller.updateSettings({ beatIndicator: false });
    expect(stateAt(virtual.state().frame, 92).kind).toBe('off');
    // look-ahead: bar 1 Cmaj7 → bar 2 Am7; during beat 4 the pads whose role changes pulse
    controller.updateSettings({ lookAhead: true });
    const noPulseYet = [...virtual.state().frame.values()].filter((st) => st.kind === 'pulse').length;
    expect(noPulseYet).toBe(0);
    clocks(48); // tick 24 + 48 = 72 = beat 4
    const pulsing = [...virtual.state().frame.values()].filter((st) => st.kind === 'pulse').length;
    expect(pulsing).toBeGreaterThan(0);
    clocks(24); // bar 2 beat 1: back to normal
    expect([...virtual.state().frame.values()].filter((st) => st.kind === 'pulse').length).toBe(0);
  });
});
