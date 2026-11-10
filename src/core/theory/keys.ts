import { parseNoteName, pitchClassName, type PitchClass, type Spelling } from './pitch';
import { normaliseScaleName, scalePitchClasses, type ScaleType } from './scales';

/** A key as used by a bar: root plus scale type. `rootName` preserves the user's spelling when known. */
export interface Key {
  readonly root: PitchClass;
  readonly scale: ScaleType;
  readonly rootName?: string;
}

export function keyPitchClasses(key: Key): ReadonlySet<PitchClass> {
  return scalePitchClasses(key.root, key.scale);
}

export function isInKey(key: Key, pc: PitchClass): boolean {
  return keyPitchClasses(key).has(pc);
}

export class KeyParseError extends Error {
  constructor(
    message: string,
    readonly text: string,
  ) {
    super(message);
    this.name = 'KeyParseError';
  }
}

const KEY_RE = /^([A-Ga-g](?:##|bb|x|#|b|♯|♭)?)(m)?(?:\s+(.+?))?\s*$/u;

/**
 * Parse a key token as written in a text chart: `G`, `Gm`, `F#m`, `Bb major`, `E dorian`,
 * `A minor pentatonic`, `C harmonic minor`. A trailing `m` directly after the note means natural minor; a
 * spelled-out scale name after whitespace wins over it when both are present and agree in mode (`Gm
 * dorian` is rejected as contradictory).
 */
export function parseKeyToken(text: string): Key {
  const trimmed = text.trim();
  const m = KEY_RE.exec(trimmed);
  if (!m) throw new KeyParseError(`not a key: "${trimmed}"`, trimmed);
  const [, noteText = '', suffix, scaleText] = m;
  const note = parseNoteName(noteText);
  if (!note) throw new KeyParseError(`not a note name: "${noteText}"`, trimmed);
  const minorSuffix = suffix === 'm';
  let scale: ScaleType = minorSuffix ? 'naturalMinor' : 'major';
  if (scaleText !== undefined) {
    const named = normaliseScaleName(scaleText);
    if (!named) throw new KeyParseError(`unknown scale: "${scaleText}"`, trimmed);
    if (minorSuffix && named !== 'naturalMinor' && !named.toLowerCase().includes('minor')) {
      throw new KeyParseError(`"${noteText}m" contradicts scale "${scaleText}"`, trimmed);
    }
    scale = named;
  }
  return { root: note.pc, scale, rootName: note.text };
}

/** Canonical short form used by the text exporter: `G`, `Gm`, `G dorian`, `Bb harmonic minor`. */
export function formatKey(key: Key, spelling: Spelling = 'sharp'): string {
  const root = key.rootName ?? pitchClassName(key.root, spelling);
  switch (key.scale) {
    case 'major':
      return root;
    case 'naturalMinor':
      return `${root}m`;
    default:
      return `${root} ${SCALE_TEXT[key.scale]}`;
  }
}

const SCALE_TEXT: Record<ScaleType, string> = {
  major: 'major',
  naturalMinor: 'minor',
  harmonicMinor: 'harmonic minor',
  melodicMinor: 'melodic minor',
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  locrian: 'locrian',
  majorPentatonic: 'major pentatonic',
  minorPentatonic: 'minor pentatonic',
  blues: 'blues',
  wholeTone: 'whole tone',
  diminished: 'diminished',
  diminishedHalfWhole: 'half-whole',
  chromatic: 'chromatic',
};
