import { describe, expect, it } from 'vitest';
import { ALL_LEDS } from '../grid';
import {
  OFF,
  diffFrames,
  emptyFrame,
  encodeLedSysEx,
  encodeSpec,
  frameOf,
  led,
  ledEquals,
  stateAt,
} from './ledState';

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

describe('LedState', () => {
  it('equality is semantic: static vs flash differ even with the same colour', () => {
    expect(ledEquals(led.rgb(1, 2, 3), led.rgb(1, 2, 3))).toBe(true);
    expect(ledEquals(led.rgb(1, 2, 3), led.rgb(1, 2, 4))).toBe(false);
    expect(ledEquals(led.palette(53), led.flash(53, 55))).toBe(false);
    expect(ledEquals(led.flash(53, 55), led.flash(53, 55))).toBe(true);
    expect(ledEquals(led.flash(53, 55), led.flash(55, 53))).toBe(false);
    expect(ledEquals(led.pulse(5), led.pulse(5))).toBe(true);
    expect(ledEquals(led.pulse(5), led.palette(5))).toBe(false);
    expect(ledEquals(OFF, OFF)).toBe(true);
  });
  it('clamps to 0–127', () => {
    expect(led.rgb(300, -5, 64.6)).toEqual({ kind: 'rgb', rgb: [127, 0, 65] });
    expect(led.palette(200)).toEqual({ kind: 'palette', index: 127 });
  });
});

describe('frames and diff', () => {
  it('empty frame covers every LED with off; unknown pads are ignored', () => {
    const f = emptyFrame();
    expect(f.size).toBe(ALL_LEDS.length);
    expect(stateAt(f, 11)).toEqual(OFF);
    const g = frameOf([
      [11, led.rgb(1, 1, 1)],
      [0, led.rgb(9, 9, 9)],
    ]);
    expect(g.has(0)).toBe(false);
    expect(stateAt(g, 11)).toEqual(led.rgb(1, 1, 1));
  });
  it('diff against a known frame lists only changes; against null lists everything incl. off', () => {
    const a = frameOf([[11, led.rgb(1, 1, 1)]]);
    const b = frameOf([
      [11, led.rgb(1, 1, 1)],
      [12, led.flash(53, 55)],
    ]);
    expect(diffFrames(a, b)).toEqual([{ pad: 12, state: led.flash(53, 55) }]);
    expect(diffFrames(b, a)).toEqual([{ pad: 12, state: OFF }]);
    expect(diffFrames(a, a)).toEqual([]);
    const full = diffFrames(null, a);
    expect(full).toHaveLength(ALL_LEDS.length);
    expect(full.filter((s) => s.state.kind === 'off')).toHaveLength(ALL_LEDS.length - 1);
  });
});

describe('SysEx encoding', () => {
  it('matches the programmer reference example', () => {
    // F0 00 20 29 02 0E 03 00 0B 0D 01 0C 15 17 02 0D 25 F7: pad 11 static yellow, pad 12 flashing
    // green (B=0x15 bright? no: B then A), pad 13 pulsing turquoise.
    const msgs = encodeLedSysEx([
      { pad: 11, state: led.palette(0x0d) },
      { pad: 12, state: led.flash(0x17, 0x15) },
      { pad: 13, state: led.pulse(0x25) },
    ]);
    expect(msgs).toHaveLength(1);
    expect(hex(msgs[0]!)).toBe('F0 00 20 29 02 0E 03 00 0B 0D 01 0C 15 17 02 0D 25 F7');
  });
  it('encodes rgb and off', () => {
    expect(encodeSpec({ pad: 88, state: led.rgb(127, 0, 64) })).toEqual([0x03, 88, 127, 0, 64]);
    expect(encodeSpec({ pad: 88, state: OFF })).toEqual([0x00, 88, 0]);
  });
  it('chunks at 106 specs and emits nothing for no specs', () => {
    const specs = Array.from({ length: 150 }, (_, i) => ({ pad: 11, state: led.palette(i % 128) }));
    const msgs = encodeLedSysEx(specs);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.length).toBe(7 + 106 * 3 + 1);
    expect(msgs[1]!.length).toBe(7 + 44 * 3 + 1);
    expect(encodeLedSysEx([])).toEqual([]);
  });
});
