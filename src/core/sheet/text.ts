import { ChordParseError, KeyParseError, parseChord, parseKeyToken, type Chord, type Key } from '../theory';
import { type Bar, type ChordField, type Loop, type Meter, type Sheet } from './types';

/**
 * Human-editable text chart (plan §4.9).
 *
 * ```
 * title: Autumn Leaves
 * time: 4/4
 * tempo: 132
 * origin: 1
 * loop: 1-8
 *
 * [A]
 * | {Bb} Cm7 F7 | Bbmaj7 | Ebmaj7 | Am7b5 D7 |
 * | Gm | N.C. | % |  |
 * ```
 *
 * - Header lines `key: value` before the first bar line. `title` and `time` are written on export;
 *   `tempo`, `origin` (when ≠ 1) and `loop` when present.
 * - `[Section]` on its own line labels the next bar.
 * - Bars sit between `|`; a line may hold several. A cell is: optional `{key}` token (`{G}`, `{Em}`,
 *   `{E dorian}`, `{-}` clears), then up to two chord symbols, or `N.C.`, or `%` (explicit copy of the
 *   previous bar's resolved chords), or nothing (inherit).
 * - Carries every musical field of a Sheet except `id` and `schemaVersion`.
 */

export interface ChartError {
  /** 1-based line in the input. */
  readonly line: number;
  /** 1-based bar number in the sheet, when the error is inside a bar. */
  readonly bar?: number;
  readonly token?: string;
  readonly message: string;
}

export type ChartParseResult =
  | { readonly ok: true; readonly sheet: Sheet }
  | { readonly ok: false; readonly errors: readonly ChartError[] };

const NC_RE = /^(n\.?c\.?)$/i;
const KEY_TOKEN_RE = /^\{([^}]*)\}\s*/u;
const HEADER_RE = /^([a-z]+)\s*:\s*(.*)$/i;
const SECTION_RE = /^\[([^\]]+)\]$/;

/** Parse a text chart into a Sheet. `id` is assigned by the caller (text never carries identity). */
export function parseChart(text: string, id: string): ChartParseResult {
  const errors: ChartError[] = [];
  const lines = text.split(/\r?\n/);

  let title = 'Untitled';
  let meter: Meter = { numerator: 4, denominator: 4 };
  let tempoNote: number | undefined;
  let originBar = 1;
  let loop: Loop | undefined;
  let loopLine = 0;

  const bars: Bar[] = [];
  let pendingSection: string | undefined;
  let resolvedChords: ChordField = []; // for `%`
  let seenBars = false;

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (line === '') return;

    const section = SECTION_RE.exec(line);
    if (section) {
      pendingSection = (section[1] ?? '').trim();
      return;
    }

    if (!line.startsWith('|')) {
      const header = HEADER_RE.exec(line);
      if (!header || seenBars) {
        errors.push({
          line: lineNo,
          token: line,
          message: seenBars
            ? 'expected a bar line starting with "|"'
            : 'expected "key: value", "[section]" or a bar line',
        });
        return;
      }
      const [, nameRaw = '', valueRaw = ''] = header;
      const name = nameRaw.toLowerCase();
      const value = valueRaw.trim();
      switch (name) {
        case 'title':
          title = value;
          break;
        case 'time': {
          const m = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
          const num = m ? Number(m[1]) : NaN;
          const den = m ? Number(m[2]) : NaN;
          if (!m || num < 1 || num > 16 || ![2, 4, 8, 16].includes(den)) {
            errors.push({
              line: lineNo,
              token: value,
              message: 'time must be n/d with n 1–16 and d one of 2, 4, 8, 16',
            });
          } else meter = { numerator: num, denominator: den as Meter['denominator'] };
          break;
        }
        case 'tempo': {
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0)
            errors.push({ line: lineNo, token: value, message: 'tempo must be a positive number' });
          else tempoNote = n;
          break;
        }
        case 'origin': {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 1)
            errors.push({ line: lineNo, token: value, message: 'origin must be an integer ≥ 1' });
          else originBar = n;
          break;
        }
        case 'loop': {
          const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(value);
          const a = m ? Number(m[1]) : NaN;
          const b = m ? Number(m[2]) : NaN;
          if (!m || a < 1 || b < a)
            errors.push({
              line: lineNo,
              token: value,
              message: 'loop must be "start-end" with 1 ≤ start ≤ end',
            });
          else {
            loop = { startBar: a, endBar: b };
            loopLine = lineNo;
          }
          break;
        }
        default:
          errors.push({
            line: lineNo,
            token: name,
            message: `unknown header "${name}" (title, time, tempo, origin, loop)`,
          });
      }
      return;
    }

    seenBars = true;
    const cells = line.split('|').slice(1); // drop text before the first pipe (empty)
    if (cells.length && (cells[cells.length - 1] ?? '').trim() === '') cells.pop(); // trailing pipe
    if (!line.endsWith('|')) {
      errors.push({ line: lineNo, message: 'bar line must end with "|"' });
    }
    for (const rawCell of cells) {
      const barNo = bars.length + 1;
      const bar: { key?: Key | null; chords?: ChordField; section?: string } = {};
      if (pendingSection !== undefined) {
        bar.section = pendingSection;
        pendingSection = undefined;
      }
      let cell = rawCell.trim();

      const keyTok = KEY_TOKEN_RE.exec(cell);
      if (keyTok) {
        const inner = (keyTok[1] ?? '').trim();
        if (inner === '-' || inner === '') bar.key = null;
        else {
          try {
            bar.key = parseKeyToken(inner);
          } catch (e) {
            errors.push({
              line: lineNo,
              bar: barNo,
              token: `{${inner}}`,
              message: (e as KeyParseError).message,
            });
          }
        }
        cell = cell.slice(keyTok[0].length).trim();
      }

      if (cell === '') {
        // inherit chords
      } else if (NC_RE.test(cell)) {
        bar.chords = [];
      } else if (cell === '%') {
        bar.chords = resolvedChords;
      } else {
        const tokens = cell.split(/\s+/);
        if (tokens.length > 2) {
          errors.push({ line: lineNo, bar: barNo, token: cell, message: 'at most two chords per bar' });
        } else {
          const chords: Chord[] = [];
          for (const tok of tokens) {
            try {
              chords.push(parseChord(tok));
            } catch (e) {
              errors.push({ line: lineNo, bar: barNo, token: tok, message: (e as ChordParseError).message });
            }
          }
          if (chords.length === tokens.length) bar.chords = chords as unknown as ChordField;
        }
      }

      // Track resolution for `%`.
      if (bar.chords !== undefined) resolvedChords = bar.chords;
      else if (resolvedChords.length === 2) resolvedChords = [resolvedChords[1]];

      bars.push(bar);
    }
  });

  if (pendingSection !== undefined) {
    errors.push({
      line: lines.length,
      token: `[${pendingSection}]`,
      message: 'section label with no bar after it',
    });
  }
  if (loop && loop.endBar > bars.length) {
    errors.push({
      line: loopLine,
      token: `${String(loop.startBar)}-${String(loop.endBar)}`,
      message: `loop end ${String(loop.endBar)} is past the last bar (${String(bars.length)})`,
    });
  }
  if (errors.length) return { ok: false, errors };

  const sheet: Sheet = {
    schemaVersion: 1,
    id,
    title,
    meter,
    originBar,
    bars,
    ...(tempoNote !== undefined ? { tempoNote } : {}),
    ...(loop ? { loop } : {}),
  };
  return { ok: true, sheet };
}
