import { padIndex, type PadIndex } from '../grid';
import type { Frame } from './ledState';
import type { Role } from './roles';

/** Snapshot shape consumed by the `grid8x8` test serializer (src/test/gridSnapshot.ts). */
export interface GridSnapshot {
  readonly kind: 'grid8x8';
  readonly rows: readonly (readonly string[])[];
  readonly legend?: Readonly<Record<string, string>>;
}

export const ROLE_TOKENS: Record<Role, string> = {
  bass: 'B',
  chordRoot: 'R',
  third: '3',
  fifth: '5',
  seventh: '7',
  extension: 'x',
  keyRoot: 'k',
  scale: 's',
  off: '.',
};

const ROLE_LEGEND: Record<string, string> = {
  B: 'bass',
  R: 'chordRoot',
  '3': 'third',
  '5': 'fifth',
  '7': 'seventh',
  x: 'extension',
  k: 'keyRoot',
  s: 'scale',
  '.': 'off',
};

/** Roles as an 8x8 text grid, top row first. */
export function rolesSnapshot(roles: ReadonlyMap<PadIndex, Role>): GridSnapshot {
  const rows: string[][] = [];
  for (let row = 8; row >= 1; row--) {
    rows.push(Array.from({ length: 8 }, (_, c) => ROLE_TOKENS[roles.get(padIndex(row, c + 1)) ?? 'off']));
  }
  return { kind: 'grid8x8', rows, legend: ROLE_LEGEND };
}

/** LED state kinds as an 8x8 text grid: `.` off, `S` static (rgb/palette), `F` flash, `P` pulse. */
export function frameKindsSnapshot(frame: Frame): GridSnapshot {
  const rows: string[][] = [];
  for (let row = 8; row >= 1; row--) {
    rows.push(
      Array.from({ length: 8 }, (_, c) => {
        const s = frame.get(padIndex(row, c + 1));
        switch (s?.kind) {
          case 'rgb':
          case 'palette':
            return 'S';
          case 'flash':
            return 'F';
          case 'pulse':
            return 'P';
          default:
            return '.';
        }
      }),
    );
  }
  return { kind: 'grid8x8', rows, legend: { '.': 'off', S: 'static', F: 'flash', P: 'pulse' } };
}
