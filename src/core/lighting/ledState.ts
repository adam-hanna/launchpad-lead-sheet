import { ALL_LEDS, type PadIndex } from '../grid';

/** Launchpad RGB, each channel 0–127 (never CSS colours). */
export type RGB = readonly [r: number, g: number, b: number];

/**
 * Semantic LED state (plan §4.3). A static pink and a flashing pink are different states even when
 * they look the same at an instant, so diffs compare this, not colours. Flash and pulse are palette-only
 * because the Pro MK3 flash command takes two palette entries.
 */
export type LedState =
  | { readonly kind: 'off' }
  | { readonly kind: 'rgb'; readonly rgb: RGB }
  | { readonly kind: 'palette'; readonly index: number }
  | { readonly kind: 'flash'; readonly a: number; readonly b: number }
  | { readonly kind: 'pulse'; readonly index: number };

export const OFF: LedState = { kind: 'off' };

export const led = {
  rgb: (r: number, g: number, b: number): LedState => ({
    kind: 'rgb',
    rgb: [clamp7(r), clamp7(g), clamp7(b)],
  }),
  palette: (index: number): LedState => ({ kind: 'palette', index: clamp7(index) }),
  flash: (a: number, b: number): LedState => ({ kind: 'flash', a: clamp7(a), b: clamp7(b) }),
  pulse: (index: number): LedState => ({ kind: 'pulse', index: clamp7(index) }),
};

function clamp7(v: number): number {
  return Math.max(0, Math.min(127, Math.round(v)));
}

export function ledEquals(a: LedState, b: LedState): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'off':
      return true;
    case 'rgb': {
      const o = (b as Extract<LedState, { kind: 'rgb' }>).rgb;
      return a.rgb[0] === o[0] && a.rgb[1] === o[1] && a.rgb[2] === o[2];
    }
    case 'palette':
      return a.index === (b as Extract<LedState, { kind: 'palette' }>).index;
    case 'pulse':
      return a.index === (b as Extract<LedState, { kind: 'pulse' }>).index;
    case 'flash': {
      const o = b as Extract<LedState, { kind: 'flash' }>;
      return a.a === o.a && a.b === o.b;
    }
  }
}

/** A complete surface: the state of every addressable LED (missing entries are `off`). */
export type Frame = ReadonlyMap<PadIndex, LedState>;

export function emptyFrame(): Frame {
  return new Map(ALL_LEDS.map((i) => [i, OFF] as const));
}

export function frameOf(entries: Iterable<readonly [PadIndex, LedState]>): Frame {
  const m = new Map<PadIndex, LedState>(ALL_LEDS.map((i) => [i, OFF] as const));
  for (const [pad, state] of entries) if (m.has(pad)) m.set(pad, state);
  return m;
}

export function stateAt(frame: Frame, pad: PadIndex): LedState {
  return frame.get(pad) ?? OFF;
}

export interface LedSpec {
  readonly pad: PadIndex;
  readonly state: LedState;
}

/**
 * Specs needed to turn `prev` into `next`. With `prev === null` (device state unknown) every LED is
 * included, `off` ones too, so the device ends in exactly `next` (plan §4.3 complete repaint).
 */
export function diffFrames(prev: Frame | null, next: Frame): LedSpec[] {
  const out: LedSpec[] = [];
  for (const pad of ALL_LEDS) {
    const n = stateAt(next, pad);
    if (prev === null || !ledEquals(stateAt(prev, pad), n)) out.push({ pad, state: n });
  }
  return out;
}

// ---- SysEx encoding (docs/launchpad-protocol.md) ---------------------------------------------------

/** F0 00 20 29 02 0E — Launchpad Pro MK3 SysEx header. */
export const LP_SYSEX_HEADER: readonly number[] = [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e];
/** 03 — LED lighting command. */
export const LP_LED_COMMAND = 0x03;
/** The device accepts at most this many colour specs per message. */
export const MAX_SPECS_PER_MESSAGE = 106;

export function encodeSpec(spec: LedSpec): number[] {
  const { pad, state } = spec;
  switch (state.kind) {
    case 'off':
      return [0x00, pad, 0x00]; // static palette 0 = off
    case 'palette':
      return [0x00, pad, state.index];
    case 'flash':
      return [0x01, pad, state.b, state.a]; // flash spec is (B, A)
    case 'pulse':
      return [0x02, pad, state.index];
    case 'rgb':
      return [0x03, pad, state.rgb[0], state.rgb[1], state.rgb[2]];
  }
}

/** One or more complete SysEx messages (≤ 106 specs each). Empty input → no messages. */
export function encodeLedSysEx(specs: readonly LedSpec[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < specs.length; i += MAX_SPECS_PER_MESSAGE) {
    const chunk = specs.slice(i, i + MAX_SPECS_PER_MESSAGE);
    out.push(Uint8Array.from([...LP_SYSEX_HEADER, LP_LED_COMMAND, ...chunk.flatMap(encodeSpec), 0xf7]));
  }
  return out;
}
