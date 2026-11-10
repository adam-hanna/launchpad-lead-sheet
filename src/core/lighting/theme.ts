import { GRID_PADS, type PadIndex } from '../grid';
import { OFF, frameOf, led, type Frame, type LedState, type RGB } from './ledState';
import type { Role } from './roles';

/** A colour slot: static RGB, or a palette entry (required for roles that flash). */
export type ThemeColour = { readonly rgb: RGB } | { readonly palette: number };

export type ColourRole = Exclude<Role, 'off'> | 'pressed' | 'dim';

export interface Theme {
  readonly name: string;
  readonly label: string;
  readonly colours: Readonly<Record<ColourRole, ThemeColour>>;
  /** Palette pair for the beat flash of the chord root: bright (a) and dim (b). Chosen in gate G7. */
  readonly rootFlash: { readonly a: number; readonly b: number };
}

/** Default theme (brainstorm §5.4): warm chord tones over a cool scale; root pink like the stock Launchpad. */
export const WARM_THEME: Theme = {
  name: 'warm',
  label: 'Warm chord over cool scale',
  colours: {
    bass: { rgb: [127, 0, 90] },
    chordRoot: { rgb: [127, 0, 64] },
    third: { rgb: [127, 40, 0] },
    fifth: { rgb: [127, 110, 0] },
    seventh: { rgb: [90, 90, 90] },
    extension: { rgb: [0, 110, 127] },
    scale: { rgb: [0, 0, 40] },
    keyRoot: { rgb: [40, 0, 20] },
    pressed: { rgb: [127, 127, 127] },
    dim: { rgb: [6, 6, 6] },
  },
  // Placeholder palette pinks until G7 records the chosen pair (docs/spikes/README.md).
  rootFlash: { a: 53, b: 55 },
};

/** The user's alternative: pink / red / orange for root / 3rd / 5th. */
export const PINK_RED_ORANGE_THEME: Theme = {
  ...WARM_THEME,
  name: 'pinkRedOrange',
  label: 'Pink, red, orange',
  colours: {
    ...WARM_THEME.colours,
    third: { rgb: [127, 0, 0] },
    fifth: { rgb: [127, 50, 0] },
    seventh: { rgb: [127, 110, 0] },
  },
};

export const THEMES: readonly Theme[] = [WARM_THEME, PINK_RED_ORANGE_THEME];

export const CUSTOM_THEME_NAME = 'custom';

/** Build a Theme from user-edited colours (roadmap M7-T1). Flashing roles stay palette-based. */
export function themeFromCustom(custom: {
  readonly colours: Readonly<Record<ColourRole, RGB>>;
  readonly rootFlash: { readonly a: number; readonly b: number };
}): Theme {
  const colours = Object.fromEntries(
    Object.entries(custom.colours).map(([k, rgb]) => [k, { rgb }]),
  ) as Record<ColourRole, ThemeColour>;
  return { name: CUSTOM_THEME_NAME, label: 'Custom', colours, rootFlash: custom.rootFlash };
}

export type OffStyle = 'dark' | 'dim';

export interface RenderInput {
  readonly roles: ReadonlyMap<PadIndex, Role>;
  readonly theme: Theme;
  /** Pads currently showing press feedback (all pads mapped to owned notes, plan §4.1). */
  readonly pressed: ReadonlySet<PadIndex>;
  /** Flash is emitted only while the transport is `playing` (plan §4.3). */
  readonly playing: boolean;
  /** Setting: flash the chord root on the beat (default on). */
  readonly rootFlash: boolean;
  readonly offStyle: OffStyle;
  /** Guidance lighting off (past end with the `dark` policy); pressed feedback still shows. */
  readonly dark: boolean;
  /** States for the surrounding buttons, supplied by whoever owns them (octave indicators etc.). */
  readonly buttons?: ReadonlyMap<PadIndex, LedState>;
  /** Pads that change at the next boundary; pulsed white during the last beat (roadmap M7-T2). */
  readonly lookAhead?: ReadonlySet<PadIndex>;
}

/** Palette entry used for the look-ahead pulse (white). */
export const LOOK_AHEAD_PALETTE = 3;

export function colourToLed(c: ThemeColour): LedState {
  return 'rgb' in c ? led.rgb(...c.rgb) : led.palette(c.palette);
}

/** Pure: roles + theme + transport → a complete Frame. */
export function render(input: RenderInput): Frame {
  const entries: (readonly [PadIndex, LedState])[] = [];
  const dimState = input.offStyle === 'dim' ? colourToLed(input.theme.colours.dim) : OFF;
  for (const pad of GRID_PADS) {
    if (input.pressed.has(pad)) {
      entries.push([pad, colourToLed(input.theme.colours.pressed)]);
      continue;
    }
    if (input.dark) {
      entries.push([pad, OFF]);
      continue;
    }
    if (input.lookAhead?.has(pad)) {
      entries.push([pad, led.pulse(LOOK_AHEAD_PALETTE)]);
      continue;
    }
    const role = input.roles.get(pad) ?? 'off';
    if (role === 'off') {
      entries.push([pad, dimState]);
    } else if (role === 'chordRoot' && input.rootFlash && input.playing) {
      entries.push([pad, led.flash(input.theme.rootFlash.a, input.theme.rootFlash.b)]);
    } else {
      entries.push([pad, colourToLed(input.theme.colours[role])]);
    }
  }
  if (input.buttons) for (const [pad, state] of input.buttons) entries.push([pad, state]);
  return frameOf(entries);
}
