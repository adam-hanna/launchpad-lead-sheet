import type { Chord, Key } from '../theory';

/** Supported meters (plan §4.8): numerator 1–16, denominator 2, 4, 8 or 16. */
export interface Meter {
  readonly numerator: number;
  readonly denominator: 2 | 4 | 8 | 16;
}

/** 1-based, inclusive loop range in sheet bars (plan §4.4). */
export interface Loop {
  readonly startBar: number;
  readonly endBar: number;
}

/**
 * Chords in a bar: absent on `Bar` means inherit; `[]` is N.C.; one chord fills the bar; two chords
 * split it at the half-bar boundary (plan §4.5).
 */
export type ChordField = readonly [] | readonly [Chord] | readonly [Chord, Chord];

/**
 * One bar as authored. Every field is independent: a missing `key` inherits the previous bar's resolved
 * key, `null` clears it; a missing `chords` inherits, `[]` is N.C.
 */
export interface Bar {
  readonly key?: Key | null;
  readonly chords?: ChordField;
  readonly section?: string;
}

/** The in-memory sheet with parsed keys and chords. Persisted via `SheetDoc` (`schema.ts`). */
export interface Sheet {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly meter: Meter;
  readonly tempoNote?: number;
  /** Live bar at which sheet bar 1 starts (default 1). */
  readonly originBar: number;
  readonly loop?: Loop;
  readonly bars: readonly Bar[];
}

/** A bar after inheritance: key is a Key or cleared; chords are explicit, `[]` for N.C. */
export interface ResolvedBar {
  readonly key: Key | null;
  readonly chords: ChordField;
  readonly section?: string;
}

export const DEFAULT_METER: Meter = { numerator: 4, denominator: 4 };

export function createEmptySheet(id: string, title = 'Untitled'): Sheet {
  return { schemaVersion: 1, id, title, meter: DEFAULT_METER, originBar: 1, bars: [] };
}
