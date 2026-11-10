import { toPitchClass, type PitchClass } from './pitch';

/**
 * Chord-tone functions used by lighting (plan §4.6). `bass` is produced by the parser for slash chords,
 * never by the quality tables.
 */
export type ChordFunction = 'root' | 'third' | 'fifth' | 'seventh' | 'extension' | 'bass';

/** Priority when one pitch class carries several functions (plan §4.6, highest first). */
export const FUNCTION_PRIORITY: readonly ChordFunction[] = [
  'bass',
  'root',
  'third',
  'fifth',
  'seventh',
  'extension',
];

export interface IntervalTone {
  /** Semitones above the root; extensions may exceed 11 (9th = 14, 11th = 17, 13th = 21). */
  readonly interval: number;
  readonly fn: ChordFunction;
}

export interface ChordTone {
  readonly pc: PitchClass;
  readonly interval: number;
  readonly fn: ChordFunction;
}

const t = (interval: number, fn: ChordFunction): IntervalTone => ({ interval, fn });
const R = t(0, 'root');
const m3 = t(3, 'third');
const M3 = t(4, 'third');
const sus2 = t(2, 'third');
const sus4 = t(5, 'third');
const d5 = t(6, 'fifth');
const P5 = t(7, 'fifth');
const A5 = t(8, 'fifth');
const dim7 = t(9, 'seventh');
const m7 = t(10, 'seventh');
const M7 = t(11, 'seventh');
const ext = (i: number) => t(i, 'extension');

/** Canonical chord qualities. Grammar aliases map onto these names (see `chords.ts`). */
export const QUALITIES = {
  major: [R, M3, P5],
  minor: [R, m3, P5],
  diminished: [R, m3, d5],
  augmented: [R, M3, A5],
  power: [R, P5],
  sus2: [R, sus2, P5],
  sus4: [R, sus4, P5],
  six: [R, M3, P5, ext(9)],
  minorSix: [R, m3, P5, ext(9)],
  sixNine: [R, M3, P5, ext(9), ext(14)],
  add9: [R, M3, P5, ext(14)],
  minorAdd9: [R, m3, P5, ext(14)],
  dominant7: [R, M3, P5, m7],
  major7: [R, M3, P5, M7],
  minor7: [R, m3, P5, m7],
  minorMajor7: [R, m3, P5, M7],
  diminished7: [R, m3, d5, dim7],
  halfDiminished7: [R, m3, d5, m7],
  augmented7: [R, M3, A5, m7],
  augmentedMajor7: [R, M3, A5, M7],
  dominant7sus4: [R, sus4, P5, m7],
  dominant9: [R, M3, P5, m7, ext(14)],
  major9: [R, M3, P5, M7, ext(14)],
  minor9: [R, m3, P5, m7, ext(14)],
  dominant9sus4: [R, sus4, P5, m7, ext(14)],
  dominant11: [R, M3, P5, m7, ext(14), ext(17)],
  minor11: [R, m3, P5, m7, ext(14), ext(17)],
  dominant13: [R, M3, P5, m7, ext(14), ext(21)],
  major13: [R, M3, P5, M7, ext(14), ext(21)],
  minor13: [R, m3, P5, m7, ext(14), ext(21)],
} as const satisfies Record<string, readonly IntervalTone[]>;

export type ChordQuality = keyof typeof QUALITIES;

/** Alteration tokens accepted after the quality (plan §4.9). Parentheses are stripped before matching. */
export const ALTERATIONS = [
  'b5',
  '#5',
  'b9',
  '#9',
  '#11',
  'b13',
  'add2',
  'add4',
  'add6',
  'add9',
  'add11',
  'add13',
  'no3',
  'no5',
  'omit3',
  'omit5',
  'sus2',
  'sus4',
] as const;

export type Alteration = (typeof ALTERATIONS)[number];

/** Apply alterations to a quality's interval set, in order. Pure. */
export function applyAlterations(
  base: readonly IntervalTone[],
  alterations: readonly Alteration[],
): IntervalTone[] {
  let tones = [...base];
  const replace = (fn: ChordFunction, next: IntervalTone) => {
    tones = tones.filter((x) => x.fn !== fn);
    tones.push(next);
  };
  const add = (next: IntervalTone) => {
    if (!tones.some((x) => x.interval === next.interval)) tones.push(next);
  };
  for (const a of alterations) {
    switch (a) {
      case 'b5':
        replace('fifth', d5);
        break;
      case '#5':
        replace('fifth', A5);
        break;
      case 'b9':
        add(ext(13));
        break;
      case '#9':
        add(ext(15));
        break;
      case '#11':
        add(ext(18));
        break;
      case 'b13':
        add(ext(20));
        break;
      case 'add2':
      case 'add9':
        add(ext(14));
        break;
      case 'add4':
      case 'add11':
        add(ext(17));
        break;
      case 'add6':
      case 'add13':
        add(ext(21));
        break;
      case 'no3':
      case 'omit3':
        tones = tones.filter((x) => x.fn !== 'third');
        break;
      case 'no5':
      case 'omit5':
        tones = tones.filter((x) => x.fn !== 'fifth');
        break;
      case 'sus2':
        replace('third', sus2);
        break;
      case 'sus4':
        replace('third', sus4);
        break;
    }
  }
  return tones;
}

/**
 * Resolve interval tones to pitch classes for a root. When two intervals land on the same pitch class
 * (e.g. `add9` on a chord that already has a 9th, or `b13` against a `#5`), the higher-priority function
 * wins and the duplicate is dropped, so each pitch class appears once.
 */
export function resolveTones(root: PitchClass, tones: readonly IntervalTone[]): ChordTone[] {
  const byPc = new Map<PitchClass, ChordTone>();
  for (const tone of tones) {
    const pc = toPitchClass(root + tone.interval);
    const existing = byPc.get(pc);
    if (!existing || FUNCTION_PRIORITY.indexOf(tone.fn) < FUNCTION_PRIORITY.indexOf(existing.fn)) {
      byPc.set(pc, { pc, interval: tone.interval, fn: tone.fn });
    }
  }
  return [...byPc.values()].sort((a, b) => a.interval - b.interval);
}

/** Convenience: tones for a quality and alteration list on a root. */
export function chordTones(
  root: PitchClass,
  quality: ChordQuality,
  alterations: readonly Alteration[] = [],
): ChordTone[] {
  return resolveTones(root, applyAlterations(QUALITIES[quality], alterations));
}
