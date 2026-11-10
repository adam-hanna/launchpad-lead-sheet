import { describe, expect, it } from 'vitest';
import { ALL_LEDS, DEFAULT_LAYOUT, buildMapping } from '../grid';
import { createEmptySheet, resolve } from '../sheet';
import { parseChord, parseKeyToken } from '../theory';
import { frameKindsSnapshot } from './debug';
import { led, stateAt } from './ledState';
import { FrameRenderer, type RenderDeps } from './renderer';
import { PINK_RED_ORANGE_THEME, THEMES, WARM_THEME, colourToLed, render } from './theme';

const mapping = buildMapping(DEFAULT_LAYOUT, 0, { kind: 'absolute' });
const [cmaj7, ab] = resolve({
  ...createEmptySheet('t'),
  bars: [{ key: parseKeyToken('C'), chords: [parseChord('Cmaj7')] }, { chords: [parseChord('Ab')] }],
});
const base: RenderDeps = {
  harmony: cmaj7!,
  half: 0,
  mapping,
  transport: 'playing',
  displayMode: 'keyChord',
  offStyle: 'dark',
  theme: WARM_THEME,
  rootFlash: true,
  dark: false,
  pressed: new Set(),
};
const PAD_C1 = 11; // chord root C
const PAD_E1 = 15; // third
const PAD_CS1 = 12; // out of key

describe('render()', () => {
  it('flashes the chord root while playing with the theme palette pair, static otherwise', () => {
    const r = new FrameRenderer();
    const playing = r.render(base).frame;
    expect(stateAt(playing, PAD_C1)).toEqual(led.flash(WARM_THEME.rootFlash.a, WARM_THEME.rootFlash.b));
    expect(stateAt(playing, PAD_E1)).toEqual(colourToLed(WARM_THEME.colours.third));
    expect(stateAt(playing, PAD_CS1).kind).toBe('off');
    for (const t of ['stopped', 'unsynced', 'lostClock'] as const) {
      expect(stateAt(new FrameRenderer().render({ ...base, transport: t }).frame, PAD_C1)).toEqual(
        colourToLed(WARM_THEME.colours.chordRoot),
      );
    }
    expect(stateAt(new FrameRenderer().render({ ...base, rootFlash: false }).frame, PAD_C1).kind).toBe('rgb');
  });

  it('dim style lights out-of-mode pads with the dim colour; dark turns guidance off but keeps pressed', () => {
    expect(stateAt(render({ ...base, roles: new Map(), playing: true, offStyle: 'dim' }), PAD_CS1)).toEqual(
      colourToLed(WARM_THEME.colours.dim),
    );
    const dark = new FrameRenderer().render({ ...base, dark: true, pressed: new Set([PAD_E1]) }).frame;
    expect(stateAt(dark, PAD_C1).kind).toBe('off');
    expect(stateAt(dark, PAD_E1)).toEqual(colourToLed(WARM_THEME.colours.pressed));
  });

  it('button states pass through; themes are complete', () => {
    const f = new FrameRenderer().render({ ...base, buttons: new Map([[80, led.palette(3)]]) }).frame;
    expect(stateAt(f, 80)).toEqual(led.palette(3));
    expect(stateAt(f, 70).kind).toBe('off');
    expect(THEMES.map((t) => t.name)).toEqual(['warm', 'pinkRedOrange']);
    expect(PINK_RED_ORANGE_THEME.colours.third).toEqual({ rgb: [127, 0, 0] });
    expect(colourToLed({ palette: 5 })).toEqual(led.palette(5));
  });

  it('frame kinds snapshot: flashing root, static others, off out of key', () => {
    expect(frameKindsSnapshot(new FrameRenderer().render(base).frame)).toMatchInlineSnapshot(`
      # | 1 2 3 4 5 6 7 8
      8 | S F . S . S S .
      7 | . S . S . S F .
      6 | . S . S S . S .
      5 | . S . S F . S .
      4 | . S S . S . S .
      3 | . S F . S . S S
      2 | S . S . S . S F
      1 | F . S . S S . S

      . = off
      S = static
      F = flash
      P = pulse
    `);
  });
});

describe('FrameRenderer device cache (plan §4.3 acceptance)', () => {
  it('first render is a complete repaint including off; identical deps produce no specs', () => {
    const r = new FrameRenderer();
    const first = r.render(base);
    expect(first.fullRepaint).toBe(true);
    expect(first.specs).toHaveLength(ALL_LEDS.length);
    expect(first.specs.some((s) => s.state.kind === 'off')).toBe(true);
    const again = r.render(base);
    expect(again.fullRepaint).toBe(false);
    expect(again.specs).toEqual([]);
    expect(r.deviceKnown()).toBe(true);
  });

  it('flashing root → pressed white → chord changes during hold → release → new role state, minimal diffs', () => {
    const r = new FrameRenderer();
    r.render(base);
    const pressed = r.render({ ...base, pressed: new Set([PAD_C1]) });
    expect(pressed.specs).toEqual([{ pad: PAD_C1, state: colourToLed(WARM_THEME.colours.pressed) }]);
    // chord changes to Ab while C is held: C becomes the third, but the pad stays pressed
    const changed = r.render({ ...base, harmony: ab!, pressed: new Set([PAD_C1]) });
    expect(changed.specs.find((s) => s.pad === PAD_C1)).toBeUndefined();
    const released = r.render({ ...base, harmony: ab! });
    expect(released.specs).toEqual([{ pad: PAD_C1, state: colourToLed(WARM_THEME.colours.third) }]);
  });

  it('Start then Stop within one half-bar toggles flash to static with no bar change', () => {
    const r = new FrameRenderer();
    r.render({ ...base, transport: 'stopped' });
    const started = r.render({ ...base, transport: 'playing' });
    expect(started.specs.every((s) => s.state.kind === 'flash')).toBe(true);
    expect(started.specs.length).toBeGreaterThan(0);
    const stopped = r.render({ ...base, transport: 'stopped' });
    expect(stopped.specs.map((s) => s.pad)).toEqual(started.specs.map((s) => s.pad));
    expect(stopped.specs.every((s) => s.state.kind === 'rgb')).toBe(true);
  });

  it('reconnect with an unchanged sheet produces a complete repaint including off', () => {
    const r = new FrameRenderer();
    r.render(base);
    r.invalidateDevice();
    expect(r.deviceKnown()).toBe(false);
    const after = r.render(base);
    expect(after.fullRepaint).toBe(true);
    expect(after.specs).toHaveLength(ALL_LEDS.length);
    r.markSendFailed();
    expect(r.render(base).fullRepaint).toBe(true);
    expect(r.current()).not.toBeNull();
  });

  it('selecting another bar while stopped repaints (dependency change, no transport boundary)', () => {
    const r = new FrameRenderer();
    r.render({ ...base, transport: 'stopped' });
    const sel = r.render({ ...base, transport: 'stopped', harmony: ab! });
    expect(sel.specs.length).toBeGreaterThan(0);
  });
});
