/** Pitch classes, spelled note names and MIDI note helpers. Pure functions, no state. */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const PITCH_CLASSES: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Wrap any integer (semitones, MIDI notes, negative offsets) into 0–11. */
export function toPitchClass(n: number): PitchClass {
  return (((Math.trunc(n) % 12) + 12) % 12) as PitchClass;
}

export function transpose(pc: PitchClass, semitones: number): PitchClass {
  return toPitchClass(pc + semitones);
}

/** Semitones from `from` up to `to`, 0–11. */
export function intervalUp(from: PitchClass, to: PitchClass): number {
  return (to - from + 12) % 12;
}

export type NoteLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

const LETTER_PC: Record<NoteLetter, PitchClass> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface SpelledNote {
  readonly letter: NoteLetter;
  /** +1 per sharp, −1 per flat. */
  readonly accidental: number;
  readonly pc: PitchClass;
  /** The spelling exactly as the user wrote it (ASCII or Unicode accidentals). */
  readonly text: string;
}

const NOTE_RE = /^([A-Ga-g])(##|bb|x|#|b|♯|♭|𝄪|𝄫)?$/u;

/**
 * Parse a spelled note name such as `C`, `F#`, `Bb`, `C##`, `E♭`. Lower-case letters are accepted and
 * normalised. Returns null when the text is not a note name (so callers can fall through to other
 * grammar, e.g. `6/9` is not a slash chord).
 */
export function parseNoteName(text: string): SpelledNote | null {
  const m = NOTE_RE.exec(text.trim());
  if (!m) return null;
  const [, letterRaw = '', acc = ''] = m;
  const letter = letterRaw.toUpperCase() as NoteLetter;
  const accidental =
    acc === ''
      ? 0
      : acc === '#' || acc === '♯'
        ? 1
        : acc === 'b' || acc === '♭'
          ? -1
          : acc === '##' || acc === 'x' || acc === '𝄪'
            ? 2
            : -2;
  return { letter, accidental, pc: toPitchClass(LETTER_PC[letter] + accidental), text: text.trim() };
}

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export type Spelling = 'sharp' | 'flat';

export function pitchClassName(pc: PitchClass, spelling: Spelling = 'sharp'): string {
  return spelling === 'flat' ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}

/** A MIDI note number 0–127. Kept as `number` for arithmetic; validate with `isMidiNote`. */
export type MidiNote = number;

export function isMidiNote(n: number): n is MidiNote {
  return Number.isInteger(n) && n >= 0 && n <= 127;
}

/** Live's octave naming: MIDI 60 is C3. */
export function midiNoteName(note: MidiNote, spelling: Spelling = 'sharp'): string {
  return `${pitchClassName(toPitchClass(note), spelling)}${String(Math.floor(note / 12) - 2)}`;
}
