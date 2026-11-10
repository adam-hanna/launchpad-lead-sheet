import { chordAt, type ResolvedBar } from '../sheet';
import { isMidiNote, toPitchClass, type MidiNote, type PitchClass } from '../theory';
import { effectiveBase, type Layout } from './layout';
import { GRID_PADS, padRowCol, type PadIndex } from './pads';

/** Absolute: pads are fixed pitches. Relative: the anchor pitch class sits at the bottom-left pad. */
export type MappingMode =
  { readonly kind: 'absolute' } | { readonly kind: 'relative'; readonly anchor: PitchClass };

export interface GridMapping {
  readonly mode: MappingMode;
  /** MIDI note of the bottom-left pad (may be outside 0–127 in extreme settings; pads then unmap). */
  readonly bottomLeftNote: number;
  noteAt(pad: PadIndex): MidiNote | null;
  padsFor(note: MidiNote): readonly PadIndex[];
}

/**
 * Build a mapping (plan §4.7).
 *
 * - Absolute: `noteAt(pad) = effectiveBase + row*rowOffset + col` (rows/cols 0-based).
 * - Relative: the bottom-left pad is the **lowest note ≥ effectiveBase with the anchor pitch class**;
 *   the grid follows the layout from there. Deterministic and not path-dependent.
 * - Notes outside 0–127 are unmapped (dark, silent).
 */
export function buildMapping(layout: Layout, octaveShift: number, mode: MappingMode): GridMapping {
  const base = effectiveBase(layout, octaveShift);
  const bottomLeftNote =
    mode.kind === 'absolute' ? base : base + ((mode.anchor - toPitchClass(base) + 12) % 12);

  const table = new Map<PadIndex, MidiNote>();
  const reverse = new Map<MidiNote, PadIndex[]>();
  for (const pad of GRID_PADS) {
    const rc = padRowCol(pad);
    if (!rc) continue;
    const note = bottomLeftNote + (rc.row - 1) * layout.rowOffset + (rc.col - 1);
    if (!isMidiNote(note)) continue;
    table.set(pad, note);
    const list = reverse.get(note);
    if (list) list.push(pad);
    else reverse.set(note, [pad]);
  }

  return {
    mode,
    bottomLeftNote,
    noteAt: (pad) => table.get(pad) ?? null,
    padsFor: (note) => reverse.get(note) ?? [],
  };
}

export type AnchorSetting = 'chordRoot' | 'keyRoot';

/**
 * Choose the relative-mode anchor for a bar half (plan §4.7). `chordRoot` uses the chord root and falls
 * back to the key root; `keyRoot` uses the key root and falls back to the chord root; with neither, the
 * pitch class of the effective base (the grid then equals absolute mode).
 */
export function anchorFor(
  setting: AnchorSetting,
  harmony: ResolvedBar | null,
  half: 0 | 1,
  layout: Layout,
  octaveShift: number,
): PitchClass {
  const chordRoot = harmony ? chordAt(harmony, half)?.root : undefined;
  const keyRoot = harmony?.key?.root;
  const fallback = toPitchClass(effectiveBase(layout, octaveShift));
  if (setting === 'chordRoot') return chordRoot ?? keyRoot ?? fallback;
  return keyRoot ?? chordRoot ?? fallback;
}

/** Convenience: mapping for the current settings and harmony. */
export function mappingFor(
  layout: Layout,
  octaveShift: number,
  relative: boolean,
  anchorSetting: AnchorSetting,
  harmony: ResolvedBar | null,
  half: 0 | 1,
): GridMapping {
  if (!relative) return buildMapping(layout, octaveShift, { kind: 'absolute' });
  return buildMapping(layout, octaveShift, {
    kind: 'relative',
    anchor: anchorFor(anchorSetting, harmony, half, layout, octaveShift),
  });
}
