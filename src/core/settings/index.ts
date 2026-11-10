import { z } from 'zod';
import { DEFAULT_LAYOUT, MAX_ROW_OFFSET, MIN_ROW_OFFSET, type AnchorSetting, type Layout } from '../grid';
import {
  MAX_OCTAVE_SHIFT,
  MIN_OCTAVE_SHIFT,
  WARM_THEME,
  type ColourRole,
  type DisplayMode,
  type OffStyle,
  type RGB,
} from '../lighting';
import type { PastEndPolicy } from '../sheet';

/** User settings that affect lighting and mapping (plan §2, §4.3, §4.7). Persisted separately from sheets. */
export interface Settings {
  readonly displayMode: DisplayMode;
  readonly offStyle: OffStyle;
  readonly themeName: string;
  readonly rootFlash: boolean;
  readonly relative: boolean;
  readonly anchor: AnchorSetting;
  readonly layout: Layout;
  readonly octaveShift: number;
  readonly pastEnd: PastEndPolicy;
  /** 0-based MIDI channel for notes sent to Live. */
  readonly notesChannel: number;
  /** Compensation for perceived LED lag, in clock ticks (plan §4.4 should-have). */
  readonly clockOffsetTicks: number;
  /** Pulse the pads that change at the next boundary during the last beat (roadmap M7-T2). */
  readonly lookAhead: boolean;
  /** Show the beat on the top button row while playing (roadmap M7-T3). */
  readonly beatIndicator: boolean;
  /** User-edited theme, selected with themeName = 'custom' (roadmap M7-T1). */
  readonly customTheme: CustomTheme;
}

export interface CustomTheme {
  readonly colours: Readonly<Record<ColourRole, RGB>>;
  readonly rootFlash: { readonly a: number; readonly b: number };
}

export const MAX_CLOCK_OFFSET_TICKS = 48;

const WARM_CUSTOM: CustomTheme = {
  colours: Object.fromEntries(
    Object.entries(WARM_THEME.colours).map(([k, c]) => [k, 'rgb' in c ? c.rgb : [127, 127, 127]]),
  ) as Record<ColourRole, RGB>,
  rootFlash: WARM_THEME.rootFlash,
};

export const DEFAULT_SETTINGS: Settings = {
  displayMode: 'keyChord',
  offStyle: 'dark',
  themeName: WARM_THEME.name,
  rootFlash: true,
  relative: false,
  anchor: 'chordRoot',
  layout: DEFAULT_LAYOUT,
  octaveShift: 0,
  pastEnd: 'sustain',
  notesChannel: 0,
  clockOffsetTicks: 0,
  lookAhead: false,
  beatIndicator: true,
  customTheme: WARM_CUSTOM,
};

const rgbSchema = z.tuple([
  z.number().int().min(0).max(127),
  z.number().int().min(0).max(127),
  z.number().int().min(0).max(127),
]);
const colourRoles = [
  'bass',
  'chordRoot',
  'third',
  'fifth',
  'seventh',
  'extension',
  'keyRoot',
  'scale',
  'pressed',
  'dim',
] as const;
export const customThemeSchema = z.object({
  colours: z.object(
    Object.fromEntries(colourRoles.map((r) => [r, rgbSchema])) as Record<ColourRole, typeof rgbSchema>,
  ),
  rootFlash: z.object({ a: z.number().int().min(0).max(127), b: z.number().int().min(0).max(127) }),
});

export const settingsSchema = z.object({
  displayMode: z.enum(['key', 'chord', 'keyChord']),
  offStyle: z.enum(['dark', 'dim']),
  themeName: z.string().min(1),
  rootFlash: z.boolean(),
  relative: z.boolean(),
  anchor: z.enum(['chordRoot', 'keyRoot']),
  layout: z.object({
    rowOffset: z.number().int().min(MIN_ROW_OFFSET).max(MAX_ROW_OFFSET),
    baseNote: z.number().int().min(0).max(127),
  }),
  octaveShift: z.number().int().min(MIN_OCTAVE_SHIFT).max(MAX_OCTAVE_SHIFT),
  pastEnd: z.enum(['sustain', 'repeat', 'dark']),
  notesChannel: z.number().int().min(0).max(15),
  clockOffsetTicks: z.number().int().min(-MAX_CLOCK_OFFSET_TICKS).max(MAX_CLOCK_OFFSET_TICKS),
  lookAhead: z.boolean(),
  beatIndicator: z.boolean(),
  customTheme: customThemeSchema,
});

/**
 * Parse stored settings leniently: each valid field is kept, every invalid or missing field falls back
 * to its default, so one bad value never resets everything (plan §4.11 spirit).
 */
export function parseSettings(input: unknown): Settings {
  if (typeof input !== 'object' || input === null) return DEFAULT_SETTINGS;
  const partial = settingsSchema.partial().safeParse(input);
  const base: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (partial.success) {
    for (const [k, v] of Object.entries(partial.data)) if (v !== undefined) base[k] = v;
    return base as unknown as Settings;
  }
  // Some fields failed: keep the ones that parse individually.
  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(settingsSchema.shape) as (keyof Settings)[]) {
    const field = settingsSchema.shape[key].safeParse(obj[key]);
    if (field.success) base[key] = field.data;
  }
  return base as unknown as Settings;
}
