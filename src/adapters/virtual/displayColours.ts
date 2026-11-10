import type { LedState, RGB } from '@core/lighting';

/**
 * On-screen rendering of device colours. This is a *display mapping*: the device gets Launchpad RGB
 * (0–127) or palette indices; the screen gets CSS. Nothing here is sent to hardware.
 */

/** 0–127 → CSS with a gamma lift so dim LED values stay visible on screen. */
export function rgbToCss(rgb: RGB): string {
  const ch = (v: number) => Math.round(255 * Math.pow(Math.max(0, Math.min(127, v)) / 127, 0.7));
  return `rgb(${String(ch(rgb[0]))}, ${String(ch(rgb[1]))}, ${String(ch(rgb[2]))})`;
}

/**
 * Approximation of the Launchpad palette. Entries 0–3 are greys; from 4 the palette runs in groups of
 * four (light, bright, dim, dimmer) around the hue circle. Good enough to tell roles apart on screen;
 * exact hardware colours are what gate G7 looks at.
 */
export function paletteToCss(index: number): string {
  const i = Math.max(0, Math.min(127, Math.round(index)));
  if (i === 0) return '#141414';
  if (i === 1) return '#555';
  if (i === 2) return '#aaa';
  if (i === 3) return '#fff';
  const group = Math.floor((i - 4) / 4);
  const tier = (i - 4) % 4;
  const hue = (group * 30) % 360;
  const [sat, light] = tier === 0 ? [90, 72] : tier === 1 ? [100, 50] : tier === 2 ? [100, 32] : [100, 20];
  return `hsl(${String(hue)}, ${String(sat)}%, ${String(light)}%)`;
}

export interface LedCss {
  readonly background: string;
  /** True for pulsing LEDs; the component animates opacity. */
  readonly pulse: boolean;
}

/** `flashA` selects which colour of a flashing LED shows right now (true = colour A). */
export function ledToCss(state: LedState, flashA: boolean): LedCss {
  switch (state.kind) {
    case 'off':
      return { background: '#141414', pulse: false };
    case 'rgb':
      return { background: rgbToCss(state.rgb), pulse: false };
    case 'palette':
      return { background: paletteToCss(state.index), pulse: false };
    case 'flash':
      return { background: paletteToCss(flashA ? state.a : state.b), pulse: false };
    case 'pulse':
      return { background: paletteToCss(state.index), pulse: true };
  }
}

/**
 * Flash phase from forwarded clock, matching the hardware: one period per quarter note (24 ticks), colour
 * A for the first half. Without a running clock the device free-runs at 120 bpm, which the caller
 * emulates with wall time.
 */
export function flashPhaseA(clockTicks: number, running: boolean, nowMs: number): boolean {
  if (running) return clockTicks % 24 < 12;
  return Math.floor(nowMs / 250) % 2 === 0;
}
