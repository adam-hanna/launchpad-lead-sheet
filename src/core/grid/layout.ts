import type { MidiNote } from '../theory';

/**
 * A chromatic grid layout (plan §4.7): each row starts `rowOffset` semitones above the row below, and
 * `baseNote` is the bottom-left pad at octave shift 0 in absolute mode.
 */
export interface Layout {
  readonly rowOffset: number;
  readonly baseNote: MidiNote;
}

export const LAYOUT_PRESETS = {
  /** Live's default: rows a fourth apart. */
  fourths: 5,
  thirds: 4,
  /** Rows continue chromatically (8 pads per row). */
  sequential: 8,
} as const;

export type LayoutPreset = keyof typeof LAYOUT_PRESETS;

/** Live's Note mode default bottom-left note is C1 (MIDI 36). */
export const DEFAULT_LAYOUT: Layout = { rowOffset: LAYOUT_PRESETS.fourths, baseNote: 36 };

export const MIN_ROW_OFFSET = 1;
export const MAX_ROW_OFFSET = 12;

/** One register rule for both modes: the octave buttons change `octaveShift`, never `baseNote`. */
export function effectiveBase(layout: Layout, octaveShift: number): number {
  return layout.baseNote + 12 * octaveShift;
}

export function presetName(layout: Layout): LayoutPreset | 'custom' {
  const found = (Object.keys(LAYOUT_PRESETS) as LayoutPreset[]).find(
    (k) => LAYOUT_PRESETS[k] === layout.rowOffset,
  );
  return found ?? 'custom';
}
