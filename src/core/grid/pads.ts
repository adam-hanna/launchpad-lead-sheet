/**
 * Launchpad Pro MK3 Programmer-mode surface indices (docs/launchpad-protocol.md). Grid pads are
 * `row * 10 + col` with row 1 at the bottom and col 1 at the left; surrounding buttons are CCs.
 */

/** A Programmer-mode LED/button index (1–99). */
export type PadIndex = number;

export const GRID_ROWS = 8;
export const GRID_COLS = 8;

export function padIndex(row: number, col: number): PadIndex {
  return row * 10 + col;
}

export function isGridPad(index: PadIndex): boolean {
  const row = Math.floor(index / 10);
  const col = index % 10;
  return row >= 1 && row <= GRID_ROWS && col >= 1 && col <= GRID_COLS;
}

/** 1-based row (bottom = 1) and column (left = 1) of a grid pad, or null for buttons. */
export function padRowCol(index: PadIndex): { row: number; col: number } | null {
  if (!isGridPad(index)) return null;
  return { row: Math.floor(index / 10), col: index % 10 };
}

/** All 64 grid pads, bottom-left (11) to top-right (88), row by row. */
export const GRID_PADS: readonly PadIndex[] = Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) =>
  padIndex(Math.floor(i / GRID_COLS) + 1, (i % GRID_COLS) + 1),
);

/** Surrounding buttons (CCs in Programmer mode). */
export const TOP_BUTTONS: readonly PadIndex[] = [91, 92, 93, 94, 95, 96, 97, 98];
export const BOTTOM_BUTTONS: readonly PadIndex[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const LEFT_BUTTONS: readonly PadIndex[] = [10, 20, 30, 40, 50, 60, 70, 80];
export const RIGHT_BUTTONS: readonly PadIndex[] = [19, 29, 39, 49, 59, 69, 79, 89];
export const LOGO: PadIndex = 99;

/** Every addressable LED: 64 pads + 32 buttons + logo = 97 (the device accepts up to 106 specs). */
export const ALL_LEDS: readonly PadIndex[] = [
  ...BOTTOM_BUTTONS,
  ...GRID_PADS,
  ...LEFT_BUTTONS,
  ...RIGHT_BUTTONS,
  ...TOP_BUTTONS,
  LOGO,
];

export function isButton(index: PadIndex): boolean {
  return ALL_LEDS.includes(index) && !isGridPad(index);
}
