import { lastSoundingChord } from './resolve';
import type { Loop, ResolvedBar } from './types';

/** Where the transport is relative to the sheet (plan §4.4). */
export type TimelineStatus = 'inSheet' | 'beforeStart' | 'pastEnd' | 'empty';

/** What to show once the transport runs past the last bar with no loop. */
export type PastEndPolicy = 'sustain' | 'repeat' | 'dark';

export interface ActiveHarmony {
  readonly status: TimelineStatus;
  /** 0-based index into the resolved bars that the harmony comes from, or null when empty. */
  readonly barIndex: number | null;
  /** The harmony to light and to anchor relative mapping on; null only when the sheet is empty. */
  readonly harmony: ResolvedBar | null;
  /** True when guidance lighting should be off (past end with the `dark` policy). Pads stay playable. */
  readonly dark: boolean;
}

/**
 * Pure loop mapping on a 1-based sheet bar (plan §4.4): bars after `endBar` fold back into the loop.
 * Bars before `startBar` are unaffected. Transport position is never modified.
 */
export function mapLoop(sheetBar: number, loop?: Loop): number {
  if (!loop || sheetBar <= loop.endBar) return sheetBar;
  const len = loop.endBar - loop.startBar + 1;
  return loop.startBar + ((sheetBar - loop.startBar) % len);
}

/** Convert a Live bar to a sheet bar given the origin; null before the origin. */
export function toSheetBar(liveBar: number, originBar: number): number | null {
  const sheetBar = liveBar - originBar + 1;
  return sheetBar >= 1 ? sheetBar : null;
}

/**
 * Select the harmony for a sheet position (plan §4.4 "outside the timeline"). Identical whether the
 * position was reached sequentially or by SPP, because it depends only on the inputs.
 *
 * - `sheetBar === null` (before the origin while playing): bar 1's harmony, status `beforeStart`.
 * - Past the end with no loop: `sustain` → final sounding chord plus final key as a single-chord bar;
 *   `repeat` → the last resolved bar as is; `dark` → same as sustain for anchoring but `dark: true`.
 */
export function activeHarmony(
  resolved: readonly ResolvedBar[],
  sheetBar: number | null,
  loop: Loop | undefined,
  pastEnd: PastEndPolicy = 'sustain',
): ActiveHarmony {
  const first = resolved[0];
  if (first === undefined) return { status: 'empty', barIndex: null, harmony: null, dark: false };
  if (sheetBar === null) return { status: 'beforeStart', barIndex: 0, harmony: first, dark: false };

  const mapped = mapLoop(sheetBar, loop);
  const inSheet = resolved[mapped - 1];
  if (inSheet !== undefined)
    return { status: 'inSheet', barIndex: mapped - 1, harmony: inSheet, dark: false };

  const lastIndex = resolved.length - 1;
  const last = resolved[lastIndex] ?? first;
  if (pastEnd === 'repeat') return { status: 'pastEnd', barIndex: lastIndex, harmony: last, dark: false };
  const chord = lastSoundingChord(last);
  const sustained: ResolvedBar = { key: last.key, chords: chord ? [chord] : [] };
  return { status: 'pastEnd', barIndex: lastIndex, harmony: sustained, dark: pastEnd === 'dark' };
}
