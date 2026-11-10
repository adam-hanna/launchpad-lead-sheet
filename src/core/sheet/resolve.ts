import type { Chord } from '../theory';
import type { ChordField, ResolvedBar, Sheet } from './types';

/**
 * Resolve inheritance over the whole flat sheet (plan §4.5).
 *
 * - `key` and `chords` inherit independently from the previous bar's *resolved* value.
 * - `key: null` clears; `chords: []` is N.C.
 * - A bar inheriting after a split bar `[a, b]` resolves to `[b]`: the last sounding chord sustains.
 * - The first bar with an inheriting field resolves to cleared / N.C.
 * - Loop ranges never influence resolution; it is done before any loop mapping.
 */
export function resolve(sheet: Sheet): ResolvedBar[] {
  const out: ResolvedBar[] = [];
  let key: ResolvedBar['key'] = null;
  let chords: ChordField = [];
  for (const bar of sheet.bars) {
    if (bar.key !== undefined) key = bar.key;
    if (bar.chords !== undefined) chords = bar.chords;
    else if (chords.length === 2) chords = [chords[1]];
    out.push({ key, chords, ...(bar.section !== undefined ? { section: bar.section } : {}) });
  }
  return out;
}

/** Indices of bars whose resolved value depends on an inherited field (for editor warnings). */
export function inheritingBars(sheet: Sheet): number[] {
  return sheet.bars.flatMap((b, i) => (b.key === undefined || b.chords === undefined ? [i] : []));
}

/** The chord sounding in a given half of a resolved bar (0 = first half, 1 = second), or null for N.C. */
export function chordAt(bar: ResolvedBar, half: 0 | 1): Chord | null {
  if (bar.chords.length === 0) return null;
  if (bar.chords.length === 1) return bar.chords[0];
  return bar.chords[half];
}

/** The last chord that sounds in the bar (second of a split, or the only one), or null for N.C. */
export function lastSoundingChord(bar: ResolvedBar): Chord | null {
  return chordAt(bar, 1);
}
