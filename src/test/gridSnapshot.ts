import type { SnapshotSerializer } from 'vitest';

/**
 * An 8x8 grid for snapshotting. `rows[0]` is the TOP row of the Launchpad (pads 81–88) so the snapshot
 * reads the way the device looks; cells are short tokens (a role name, a palette index, a colour code).
 */
export interface GridSnapshot {
  readonly kind: 'grid8x8';
  readonly rows: readonly (readonly string[])[];
  readonly legend?: Readonly<Record<string, string>>;
}

export function isGridSnapshot(value: unknown): value is GridSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'grid8x8' &&
    Array.isArray((value as { rows?: unknown }).rows)
  );
}

/** Render the grid as an aligned text block with pad-index row labels (8 → 1, top to bottom). */
export function renderGrid(grid: GridSnapshot): string {
  const width = Math.max(1, ...grid.rows.flat().map((c) => c.length));
  const lines = grid.rows.map((row, i) => {
    const rowIndex = 8 - i;
    return `${String(rowIndex)} | ${row.map((c) => c.padEnd(width)).join(' ')}`.trimEnd();
  });
  const header =
    `# | ${Array.from({ length: 8 }, (_, c) => String(c + 1).padEnd(width)).join(' ')}`.trimEnd();
  const legend = grid.legend ? ['', ...Object.entries(grid.legend).map(([k, v]) => `${k} = ${v}`)] : [];
  return [header, ...lines, ...legend].join('\n');
}

export const gridSnapshotSerializer: SnapshotSerializer = {
  test: isGridSnapshot,
  serialize: (value) => renderGrid(value as GridSnapshot),
};
