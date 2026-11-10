import { describe, expect, it, vi } from 'vitest';
import { standardFakeAccess } from './fake';
import type { PortInfo } from './types';
import { WebMidi } from './webMidi';

describe('WebMidi access states', () => {
  it('reports unsupported when the API is missing', async () => {
    const m = new WebMidi(null);
    expect(m.state()).toEqual({ kind: 'unsupported' });
    expect(await m.requestAccess()).toEqual({ kind: 'unsupported' });
    expect(m.ports()).toEqual([]);
    expect(WebMidi.fromNavigator(undefined).state().kind).toBe('unsupported');
    expect(WebMidi.fromNavigator({}).state().kind).toBe('unsupported');
    expect(WebMidi.fromNavigator().state().kind).toBe('unsupported'); // Node: no navigator
  });

  it('granted → lists ports with sysex flag; repeated requests are no-ops', async () => {
    const access = standardFakeAccess();
    const m = new WebMidi(() => Promise.resolve(access));
    const seen: string[] = [];
    m.onAccessChange((s) => seen.push(s.kind));
    expect(m.state()).toEqual({ kind: 'idle' });
    expect(await m.requestAccess()).toEqual({ kind: 'granted', sysex: true });
    expect(seen).toEqual(['requesting', 'granted']);
    expect(m.ports().map((p) => `${p.type}:${p.name}`)).toEqual([
      'input:LPProMK3 MIDI',
      'input:LPProMK3 DAW',
      'input:IAC Driver LS Clock',
      'output:LPProMK3 MIDI',
      'output:LPProMK3 DAW',
      'output:IAC Driver LS Notes',
    ]);
    await m.requestAccess();
    expect(seen).toHaveLength(2);
  });

  it('denied carries the reason and never throws', async () => {
    const m = new WebMidi(() => Promise.reject(new DOMException('nope', 'SecurityError')));
    expect(await m.requestAccess()).toEqual({ kind: 'denied', reason: 'SecurityError: nope' });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error reasons happen in the wild
    const m2 = new WebMidi(() => Promise.reject('weird'));
    expect((await m2.requestAccess()).kind).toBe('denied');
  });
});

describe('WebMidi input fan-out and sending', () => {
  async function setup() {
    const access = standardFakeAccess();
    const m = new WebMidi(() => Promise.resolve(access));
    await m.requestAccess();
    return { access, m };
  }

  it('fans out one port to several subscribers and unbinds when the last one leaves', async () => {
    const { access, m } = await setup();
    const a = vi.fn();
    const b = vi.fn();
    const offA = m.subscribeInput('in-lp', a);
    const offB = m.subscribeInput('in-lp', b);
    access.inputs.get('in-lp')!.receive([0x90, 11, 100], 42);
    expect(a).toHaveBeenCalledWith(Uint8Array.from([0x90, 11, 100]), 42);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    access.inputs.get('in-lp')!.receive([0x80, 11, 0]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
    expect(access.inputs.get('in-lp')!.onmidimessage).toBeNull();
    offB(); // idempotent
    expect(m.input('nope')).toBeNull();
  });

  it('ignores empty messages and subscribing to a missing port is harmless until it appears', async () => {
    const { access, m } = await setup();
    const h = vi.fn();
    m.subscribeInput('in-lp', h);
    access.inputs.get('in-lp')!.onmidimessage!({ data: null, timeStamp: 0 });
    expect(h).not.toHaveBeenCalled();
    const off = m.subscribeInput('later', h);
    expect(m.input('later')).toBeNull();
    off();
  });

  it('sends with and without timestamps; reports failures', async () => {
    const { access, m } = await setup();
    expect(m.send('out-lp', [0xf8])).toBe(true);
    expect(m.send('out-lp', Uint8Array.from([0xfa]), 123)).toBe(true);
    expect(access.outputs.get('out-lp')!.sent).toEqual([
      { data: [0xf8], timestamp: undefined },
      { data: [0xfa], timestamp: 123 },
    ]);
    expect(m.send('missing', [0xf8])).toBe(false);
    access.outputs.get('out-lp')!.failNextSend = true;
    expect(m.send('out-lp', [0xf8])).toBe(false);
  });

  it('hot-plug: statechange notifies and rebinding survives a replug', async () => {
    const { access, m } = await setup();
    const events: PortInfo[] = [];
    m.onStateChange((p) => events.push(p));
    const h = vi.fn();
    m.subscribeInput('in-lp', h);
    access.unplug('in-lp');
    access.replug('in-lp');
    expect(events.map((e) => e.state)).toEqual(['disconnected', 'connected']);
    access.inputs.get('in-lp')!.receive([0x90, 11, 1]);
    expect(h).toHaveBeenCalledTimes(1);
    access.onstatechange?.({ port: null }); // ignored
    expect(events).toHaveLength(2);
  });
});
