import { describe, expect, it, vi } from 'vitest';
import { LAYOUT_NOTE, LAYOUT_PROGRAMMER, LAYOUT_SESSION } from '@core/device';
import { led, stateAt } from '@core/lighting';
import { flashPhaseA, ledToCss, paletteToCss, rgbToCss } from './displayColours';
import { VirtualLaunchpad } from './virtualLaunchpad';

describe('VirtualLaunchpad as a LaunchpadPort', () => {
  it('applies LED specs to its frame and notifies subscribers', () => {
    const v = new VirtualLaunchpad(() => 7);
    const seen = vi.fn();
    v.subscribe(seen);
    expect(
      v.send([
        { pad: 11, state: led.rgb(127, 0, 64) },
        { pad: 0, state: led.palette(5) },
      ]),
    ).toBe(true);
    expect(stateAt(v.state().frame, 11)).toEqual(led.rgb(127, 0, 64));
    expect(v.state().frame.has(0)).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(v.send([])).toBe(true);
    v.failSends = true;
    expect(v.send([{ pad: 11, state: led.palette(0) }])).toBe(false);
  });

  it('mode switches emit layout notifications like the device does', () => {
    const v = new VirtualLaunchpad();
    const layout = vi.fn<(layout: number, page: number) => void>();
    v.onLayoutChanged(layout);
    expect(v.state().layout).toBe(LAYOUT_NOTE);
    expect(v.enterProgrammerMode()).toBe(true);
    expect(v.restoreLiveMode()).toBe(true);
    expect(v.requestLayout()).toBe(true);
    v.simulateLayout(LAYOUT_SESSION);
    expect(layout.mock.calls.map((c) => c[0])).toEqual([
      LAYOUT_PROGRAMMER,
      LAYOUT_NOTE,
      LAYOUT_NOTE,
      LAYOUT_SESSION,
    ]);
  });

  it('counts forwarded clock for flash phase; Start resets, Stop pauses', () => {
    const v = new VirtualLaunchpad();
    v.forwardClock([0xf8]); // ignored while not running
    v.forwardClock([0xfa]);
    for (let i = 0; i < 30; i++) v.forwardClock([0xf8]);
    expect(v.state()).toMatchObject({ clockTicks: 30, running: true });
    v.forwardClock([0xfc]);
    v.forwardClock([0xf8]);
    expect(v.state()).toMatchObject({ clockTicks: 30, running: false });
    v.forwardClock([0xfb]);
    v.forwardClock([0xf8]);
    expect(v.state().clockTicks).toBe(31);
    v.forwardClock([0x90, 60, 1]); // not realtime
    v.forwardClock([0xfa]);
    expect(v.state().clockTicks).toBe(0);
  });

  it('press/release drive pad callbacks with velocity and timestamps; duplicates are ignored', () => {
    const v = new VirtualLaunchpad(() => 1234);
    const pad = vi.fn();
    v.onPad(pad);
    v.press(11, 100);
    v.press(11, 100); // already down
    v.press(99); // not a grid pad
    v.press(12, 999); // clamped
    v.release(11);
    v.release(11); // not down
    expect(pad.mock.calls).toEqual([
      [11, 100, 1234],
      [12, 127, 1234],
      [11, 0, 1234],
    ]);
    expect([...v.state().pressed]).toEqual([12]);
    v.releaseAll();
    expect(v.state().pressed.size).toBe(0);
    expect(pad).toHaveBeenCalledTimes(4);
  });

  it('buttons, poly and channel pressure, unsubscribe', () => {
    const v = new VirtualLaunchpad(() => 1);
    const button = vi.fn();
    const poly = vi.fn();
    const chan = vi.fn();
    const offB = v.onButton(button);
    v.onPolyPressure(poly);
    v.onChannelPressure(chan);
    v.pressButton(80);
    v.releaseButton(80);
    v.polyPressure(11, 50);
    v.polyPressure(99, 50);
    v.channelPressure(60);
    offB();
    v.pressButton(80);
    expect(button.mock.calls).toEqual([
      [80, 127, 1],
      [80, 0, 1],
    ]);
    expect(poly.mock.calls).toEqual([[11, 50, 1]]);
    expect(chan.mock.calls).toEqual([[60, 1]]);
  });
});

describe('display colours', () => {
  it('maps device RGB and palette entries to CSS', () => {
    expect(rgbToCss([0, 0, 0])).toBe('rgb(0, 0, 0)');
    expect(rgbToCss([127, 127, 127])).toBe('rgb(255, 255, 255)');
    expect(rgbToCss([200, -5, 64])).toMatch(/^rgb\(255, 0, \d+\)$/);
    expect(paletteToCss(0)).toBe('#141414');
    expect(paletteToCss(3)).toBe('#fff');
    expect(paletteToCss(5)).toBe('hsl(0, 100%, 50%)'); // bright red
    expect(paletteToCss(45)).toMatch(/^hsl\(300, /); // group 10
    expect(paletteToCss(200)).toBe(paletteToCss(127));
  });
  it('ledToCss follows the state kind and the flash phase', () => {
    expect(ledToCss({ kind: 'off' }, true)).toEqual({ background: '#141414', pulse: false });
    expect(ledToCss(led.rgb(127, 0, 0), true).background).toBe('rgb(255, 0, 0)');
    expect(ledToCss(led.palette(5), true).background).toBe(paletteToCss(5));
    expect(ledToCss(led.flash(5, 7), true).background).toBe(paletteToCss(5));
    expect(ledToCss(led.flash(5, 7), false).background).toBe(paletteToCss(7));
    expect(ledToCss(led.pulse(9), true)).toEqual({ background: paletteToCss(9), pulse: true });
  });
  it('flash phase: clock-driven while running, 120 bpm wall-time fallback otherwise', () => {
    expect(flashPhaseA(0, true, 0)).toBe(true);
    expect(flashPhaseA(11, true, 0)).toBe(true);
    expect(flashPhaseA(12, true, 0)).toBe(false);
    expect(flashPhaseA(24, true, 0)).toBe(true);
    expect(flashPhaseA(0, false, 0)).toBe(true);
    expect(flashPhaseA(0, false, 250)).toBe(false);
    expect(flashPhaseA(0, false, 500)).toBe(true);
  });
});
