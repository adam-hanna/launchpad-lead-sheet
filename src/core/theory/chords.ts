import {
  ALTERATIONS,
  QUALITIES,
  chordTones,
  type Alteration,
  type ChordQuality,
  type ChordTone,
} from './chordTones';
import { parseNoteName, type PitchClass } from './pitch';

/** A parsed chord symbol. `symbol`, `rootName` and `bassName` keep the user's spelling (plan §4.9). */
export interface Chord {
  readonly symbol: string;
  readonly root: PitchClass;
  readonly rootName: string;
  readonly quality: ChordQuality;
  readonly alterations: readonly Alteration[];
  readonly bass?: PitchClass;
  readonly bassName?: string;
  /** Chord tones excluding the slash bass; each pitch class once. */
  readonly tones: readonly ChordTone[];
}

export class ChordParseError extends Error {
  constructor(
    message: string,
    readonly symbol: string,
    /** 0-based index into `symbol` where parsing failed. */
    readonly position: number,
  ) {
    super(message);
    this.name = 'ChordParseError';
  }
}

/**
 * Quality aliases, exactly as they may appear after the root (after parentheses are stripped).
 * Case matters: `M7` is major seventh, `m7` is minor seventh. Longest alias wins.
 */
export const QUALITY_ALIASES: Readonly<Record<string, ChordQuality>> = {
  '': 'major',
  maj: 'major',
  M: 'major',
  major: 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  minor: 'minor',
  dim: 'diminished',
  '°': 'diminished',
  o: 'diminished',
  aug: 'augmented',
  '+': 'augmented',
  '5': 'power',
  sus2: 'sus2',
  sus4: 'sus4',
  sus: 'sus4',
  '6': 'six',
  maj6: 'six',
  M6: 'six',
  m6: 'minorSix',
  min6: 'minorSix',
  '-6': 'minorSix',
  '6/9': 'sixNine',
  '69': 'sixNine',
  '6add9': 'sixNine',
  add9: 'add9',
  add2: 'add9',
  madd9: 'minorAdd9',
  madd2: 'minorAdd9',
  '7': 'dominant7',
  dom7: 'dominant7',
  maj7: 'major7',
  M7: 'major7',
  Δ: 'major7',
  Δ7: 'major7',
  ma7: 'major7',
  major7: 'major7',
  m7: 'minor7',
  min7: 'minor7',
  '-7': 'minor7',
  minor7: 'minor7',
  mMaj7: 'minorMajor7',
  mmaj7: 'minorMajor7',
  mM7: 'minorMajor7',
  minMaj7: 'minorMajor7',
  mΔ7: 'minorMajor7',
  mΔ: 'minorMajor7',
  '-Δ7': 'minorMajor7',
  '-M7': 'minorMajor7',
  dim7: 'diminished7',
  '°7': 'diminished7',
  o7: 'diminished7',
  ø: 'halfDiminished7',
  ø7: 'halfDiminished7',
  m7b5: 'halfDiminished7',
  min7b5: 'halfDiminished7',
  '-7b5': 'halfDiminished7',
  aug7: 'augmented7',
  '+7': 'augmented7',
  '7#5': 'augmented7',
  '7+5': 'augmented7',
  '7+': 'augmented7',
  'maj7#5': 'augmentedMajor7',
  'M7#5': 'augmentedMajor7',
  'Δ7#5': 'augmentedMajor7',
  '+Δ7': 'augmentedMajor7',
  '+maj7': 'augmentedMajor7',
  augMaj7: 'augmentedMajor7',
  '7sus4': 'dominant7sus4',
  '7sus': 'dominant7sus4',
  '9': 'dominant9',
  maj9: 'major9',
  M9: 'major9',
  Δ9: 'major9',
  m9: 'minor9',
  min9: 'minor9',
  '-9': 'minor9',
  '9sus4': 'dominant9sus4',
  '9sus': 'dominant9sus4',
  '11': 'dominant11',
  m11: 'minor11',
  min11: 'minor11',
  '-11': 'minor11',
  '13': 'dominant13',
  maj13: 'major13',
  M13: 'major13',
  Δ13: 'major13',
  m13: 'minor13',
  min13: 'minor13',
  '-13': 'minor13',
};

const ROOT_RE = /^([A-G])(##|bb|x|#|b|♯|♭)?/u;
const ALTERATIONS_LONGEST_FIRST = [...ALTERATIONS].sort((a, b) => b.length - a.length);
const ALIASES_LONGEST_FIRST = Object.keys(QUALITY_ALIASES).sort((a, b) => b.length - a.length);

/** Parse a chord symbol. Throws `ChordParseError` with the failing position. */
export function parseChord(input: string): Chord {
  const symbol = input.trim();
  if (symbol === '') throw new ChordParseError('empty chord symbol', symbol, 0);

  const rootMatch = ROOT_RE.exec(symbol);
  if (!rootMatch)
    throw new ChordParseError(`expected a root note (A–G) at the start of "${symbol}"`, symbol, 0);
  const rootText = rootMatch[0];
  const root = parseNoteName(rootText);
  if (!root) throw new ChordParseError(`invalid root "${rootText}"`, symbol, 0);

  let rest = symbol.slice(rootText.length);
  let bass: ReturnType<typeof parseNoteName> = null;

  // Slash bass: only when the part after the LAST slash is a note name (so `6/9` stays a quality).
  const slash = rest.lastIndexOf('/');
  if (slash !== -1) {
    const candidate = parseNoteName(rest.slice(slash + 1));
    if (candidate) {
      bass = candidate;
      rest = rest.slice(0, slash);
    }
  }

  // Parentheses and commas only group; they carry no meaning. Error positions are reported against the
  // stripped quality text, so they are approximate when the symbol used parentheses.
  const qualityText = rest.replace(/[()\s,]/g, '');
  const qualityOffset = rootText.length;

  const alias = ALIASES_LONGEST_FIRST.find((a) => qualityText.startsWith(a));
  if (alias === undefined)
    throw new ChordParseError(`unknown chord quality "${qualityText}"`, symbol, qualityOffset);
  const quality = QUALITY_ALIASES[alias];
  if (quality === undefined)
    throw new ChordParseError(`unknown chord quality "${alias}"`, symbol, qualityOffset);

  const alterations: Alteration[] = [];
  let i = alias.length;
  while (i < qualityText.length) {
    const token = ALTERATIONS_LONGEST_FIRST.find((a) => qualityText.startsWith(a, i));
    if (!token) {
      throw new ChordParseError(
        `unknown token "${qualityText.slice(i)}" in "${symbol}"`,
        symbol,
        qualityOffset + i,
      );
    }
    alterations.push(token);
    i += token.length;
  }

  const chord: Chord = {
    symbol,
    root: root.pc,
    rootName: root.text,
    quality,
    alterations,
    tones: chordTones(root.pc, quality, alterations),
    ...(bass ? { bass: bass.pc, bassName: bass.text } : {}),
  };
  return chord;
}

/** All pitch classes the chord lights: tones plus slash bass. */
export function chordPitchClasses(chord: Chord): ReadonlySet<PitchClass> {
  const s = new Set(chord.tones.map((x) => x.pc));
  if (chord.bass !== undefined) s.add(chord.bass);
  return s;
}

/** Every canonical quality name, for UI pickers and the grammar document. */
export const CHORD_QUALITIES = Object.keys(QUALITIES) as ChordQuality[];
