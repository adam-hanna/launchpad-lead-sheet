import { z } from 'zod';
import { DEFAULT_LAYOUT, MAX_ROW_OFFSET, MIN_ROW_OFFSET, type AnchorSetting, type Layout } from '../grid';
import { MAX_OCTAVE_SHIFT, MIN_OCTAVE_SHIFT, WARM_THEME, type DisplayMode, type OffStyle } from '../lighting';
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
}

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
};

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
