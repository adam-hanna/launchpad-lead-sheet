import {
  ChordParseError,
  KeyParseError,
  parseChord,
  parseKeyToken,
  type Chord,
  type Key,
} from '@core/theory';

/** Parse the chord field text: one or two symbols. Returns the chords or an error message. */
export function parseChordField(text: string): { chords: Chord[] } | { error: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: 'enter one or two chords, or choose N.C.' };
  if (tokens.length > 2) return { error: 'at most two chords per bar' };
  const chords: Chord[] = [];
  for (const t of tokens) {
    try {
      chords.push(parseChord(t));
    } catch (e) {
      return { error: e instanceof ChordParseError ? `${t}: ${e.message}` : String(e) };
    }
  }
  return { chords };
}

export function parseKeyField(text: string): { key: Key } | { error: string } {
  try {
    return { key: parseKeyToken(text) };
  } catch (e) {
    return { error: e instanceof KeyParseError ? e.message : String(e) };
  }
}
