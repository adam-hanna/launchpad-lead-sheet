import { describe, expect, it, vi } from 'vitest';
import { led } from '@core/lighting';
import { WebMidi } from '@adapters/midi';
import { standardFakeAccess } from '@adapters/midi/fake';
import { ProMk3Port } from './proMk3';

async function setup() {
  const access = standardFakeAccess();
  const midi = new WebMidi(() => Promise.resolve(access));
  await midi.requestAccess();
  const port = new ProMk3Port(midi, 'in-lp', 'out-lp');
  const input = access.inputs.get('in-lp')!;
  const output = access.outputs.get('out-lp')!;
  return { access, midi, port, input, output };
}

describe('ProMk3Port input decoding', () => {
  it('grid pads: Note On with velocity, Note On velocity 0 and Note Off as releases; buttons ignored', async () => {
    const { port, input } = await setup();
    const pad = vi.fn();
    port.onPad(pad);
    input.receive([0x90, 11, 100], 1);
    input.receive([0x90, 11, 0], 2);
    input.receive([0x80, 88, 64], 3);
    input.receive([0x90, 91, 100], 4); // not a grid index
    expect(pad.mock.calls).toEqual([
      [11, 100, 1],
      [11, 0, 2],
      [88, 0, 3],
    ]);
  });
  it('buttons as CCs, poly pressure on grid pads, channel pressure', async () => {
    const { port, input } = await setup();
    const button = vi.fn();
    const poly = vi.fn();
    const chan = vi.fn();
    port.onButton(button);
    port.onPolyPressure(poly);
    port.onChannelPressure(chan);
    input.receive([0xb0, 80, 127], 1);
    input.receive([0xb0, 80, 0], 2);
    input.receive([0xa0, 45, 90], 3);
    input.receive([0xa0, 99, 90], 4); // logo is not a pad
    input.receive([0xd0, 77], 5);
    expect(button.mock.calls).toEqual([
      [80, 127, 1],
      [80, 0, 2],
    ]);
    expect(poly.mock.calls).toEqual([[45, 90, 3]]);
    expect(chan.mock.calls).toEqual([[77, 5]]);
  });
  it('layout notifications; other SysEx and unknown messages are ignored', async () => {
    const { port, input } = await setup();
    const layout = vi.fn();
    port.onLayoutChanged(layout);
    input.receive([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, 0x11, 0x00, 0x00, 0xf7]);
    input.receive([0xf0, 0x7e, 0x00, 0x06, 0x02, 0x00, 0x20, 0x29, 0x13, 0x01, 0x00, 0x00, 0, 1, 2, 2, 0xf7]);
    input.receive([0xe0, 0, 64]); // pitch bend
    input.receive([]);
    expect(layout.mock.calls).toEqual([[0x11, 0]]);
  });
  it('unsubscribe and dispose stop callbacks', async () => {
    const { port, input } = await setup();
    const pad = vi.fn();
    const off = port.onPad(pad);
    off();
    input.receive([0x90, 11, 1]);
    const pad2 = vi.fn();
    port.onPad(pad2);
    port.dispose();
    input.receive([0x90, 11, 1]);
    expect(pad).not.toHaveBeenCalled();
    expect(pad2).not.toHaveBeenCalled();
    expect(input.onmidimessage).toBeNull();
    expect(port.ids).toEqual({ inputId: 'in-lp', outputId: 'out-lp' });
  });
});

describe('ProMk3Port output', () => {
  it('sends LED specs as SysEx, mode commands and layout queries', async () => {
    const { port, output } = await setup();
    expect(port.send([{ pad: 11, state: led.palette(5) }])).toBe(true);
    expect(port.enterProgrammerMode()).toBe(true);
    expect(port.restoreLiveMode()).toBe(true);
    expect(port.requestLayout()).toBe(true);
    expect(output.sent.map((s) => s.data)).toEqual([
      [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x03, 0x00, 11, 5, 0xf7],
      [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x01, 0xf7],
      [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x00, 0xf7],
      [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, 0xf7],
    ]);
    expect(port.send([])).toBe(true);
  });
  it('forwards only realtime transport bytes', async () => {
    const { port, output } = await setup();
    port.forwardClock([0xf8]);
    port.forwardClock([0xfa]);
    port.forwardClock([0xf2, 0, 1]); // SPP: not forwarded
    port.forwardClock([0x90, 60, 1]);
    port.forwardClock([]);
    expect(output.sent.map((s) => s.data)).toEqual([[0xf8], [0xfa]]);
  });
  it('reports send failures (missing port or throwing output)', async () => {
    const { midi, output, port } = await setup();
    output.failNextSend = true;
    expect(port.send([{ pad: 11, state: led.palette(5) }])).toBe(false);
    const gone = new ProMk3Port(midi, 'in-lp', 'nope');
    expect(gone.enterProgrammerMode()).toBe(false);
    gone.dispose();
  });
});
