import { toPitchClass, type PitchClass } from './pitch';

/** Scale types supported in v1 (brainstorm §5.1). Modes with a common alias map to one canonical name. */
export const SCALE_TYPES = [
  'major',
  'naturalMinor',
  'harmonicMinor',
  'melodicMinor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'majorPentatonic',
  'minorPentatonic',
  'blues',
  'wholeTone',
  'diminished',
  'diminishedHalfWhole',
  'chromatic',
] as const;

export type ScaleType = (typeof SCALE_TYPES)[number];

/** Semitone offsets from the root, ascending, within one octave. */
export const SCALE_INTERVALS: Record<ScaleType, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  diminishedHalfWhole: [0, 1, 3, 4, 6, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_LABELS: Record<ScaleType, string> = {
  major: 'Major',
  naturalMinor: 'Natural minor',
  harmonicMinor: 'Harmonic minor',
  melodicMinor: 'Melodic minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  locrian: 'Locrian',
  majorPentatonic: 'Major pentatonic',
  minorPentatonic: 'Minor pentatonic',
  blues: 'Blues',
  wholeTone: 'Whole tone',
  diminished: 'Diminished (whole–half)',
  diminishedHalfWhole: 'Diminished (half–whole)',
  chromatic: 'Chromatic',
};

/**
 * Text aliases accepted when a scale is named in a key token (`{G dorian}`, `{A min pent}`). Keys are
 * lower-case with spaces and hyphens removed; see `normaliseScaleName`.
 */
const SCALE_ALIASES: Record<string, ScaleType> = {
  major: 'major',
  maj: 'major',
  ionian: 'major',
  minor: 'naturalMinor',
  min: 'naturalMinor',
  m: 'naturalMinor',
  naturalminor: 'naturalMinor',
  aeolian: 'naturalMinor',
  harmonicminor: 'harmonicMinor',
  harmminor: 'harmonicMinor',
  melodicminor: 'melodicMinor',
  melminor: 'melodicMinor',
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  mixo: 'mixolydian',
  locrian: 'locrian',
  majorpentatonic: 'majorPentatonic',
  majpent: 'majorPentatonic',
  majorpent: 'majorPentatonic',
  pentatonic: 'majorPentatonic',
  pent: 'majorPentatonic',
  minorpentatonic: 'minorPentatonic',
  minpent: 'minorPentatonic',
  minorpent: 'minorPentatonic',
  blues: 'blues',
  wholetone: 'wholeTone',
  diminished: 'diminished',
  dim: 'diminished',
  wholehalf: 'diminished',
  halfwhole: 'diminishedHalfWhole',
  diminishedhalfwhole: 'diminishedHalfWhole',
  dimhalfwhole: 'diminishedHalfWhole',
  chromatic: 'chromatic',
};

export function normaliseScaleName(text: string): ScaleType | null {
  const key = text.toLowerCase().replace(/[\s_-]+/g, '');
  return SCALE_ALIASES[key] ?? null;
}

export function scalePitchClasses(root: PitchClass, scale: ScaleType): ReadonlySet<PitchClass> {
  return new Set(SCALE_INTERVALS[scale].map((i) => toPitchClass(root + i)));
}

/** 1-based degree of `pc` in the scale, or null when it is not a scale tone. */
export function scaleDegree(root: PitchClass, scale: ScaleType, pc: PitchClass): number | null {
  const idx = SCALE_INTERVALS[scale].indexOf((pc - root + 12) % 12);
  return idx === -1 ? null : idx + 1;
}
