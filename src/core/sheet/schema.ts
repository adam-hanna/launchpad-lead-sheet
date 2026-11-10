import { z } from 'zod';
import { ChordParseError, KeyParseError, formatKey, parseChord, parseKeyToken } from '../theory';
import type { Key } from '../theory';
import type { Bar, ChordField, Sheet } from './types';

/**
 * The persisted form (plan §4.11). Chord symbols and key tokens are stored as the user wrote them; tones
 * are derived on load and never stored. This is also the JSON import/export format.
 */
export const SUPPORTED_SCHEMA_VERSION = 1;

const barDocSchema = z
  .object({
    key: z.string().nullable().optional(),
    chords: z.array(z.string()).max(2, 'at most two chords per bar').optional(),
    section: z.string().optional(),
  })
  .strict();

export const sheetDocSchema = z
  .object({
    schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string(),
    meter: z
      .object({
        numerator: z.number().int().min(1).max(16),
        denominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
      })
      .strict(),
    tempoNote: z.number().positive().optional(),
    originBar: z.number().int().min(1),
    loop: z
      .object({ startBar: z.number().int().min(1), endBar: z.number().int().min(1) })
      .strict()
      .optional(),
    bars: z.array(barDocSchema),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (doc.loop) {
      if (doc.loop.startBar > doc.loop.endBar) {
        ctx.addIssue({ code: 'custom', path: ['loop'], message: 'loop startBar must be ≤ endBar' });
      }
      if (doc.loop.endBar > doc.bars.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['loop', 'endBar'],
          message: `loop endBar ${String(doc.loop.endBar)} is past the last bar (${String(doc.bars.length)})`,
        });
      }
    }
  });

export type SheetDoc = z.infer<typeof sheetDocSchema>;
export type BarDoc = z.infer<typeof barDocSchema>;

export interface SheetIssue {
  /** JSON-pointer-like path, e.g. `bars[3].chords[1]`. */
  readonly path: string;
  readonly message: string;
}

export type LoadResult =
  | { readonly ok: true; readonly sheet: Sheet }
  | { readonly ok: false; readonly issues: readonly SheetIssue[] };

/**
 * Validate unknown JSON and parse it into a Sheet. Never throws. All problems are collected so the UI
 * can list them; nothing is replaced on failure (the caller keeps the previous sheet).
 */
export function loadSheet(input: unknown): LoadResult {
  const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          path: 'schemaVersion',
          message: `this file uses schema version ${String(version)}; this app supports up to ${String(SUPPORTED_SCHEMA_VERSION)}. Update the app to open it.`,
        },
      ],
    };
  }
  const parsed = sheetDocSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
    };
  }
  return fromDoc(parsed.data);
}

/** Convert a validated document into a Sheet, parsing keys and chords. */
export function fromDoc(doc: SheetDoc): LoadResult {
  const issues: SheetIssue[] = [];
  const bars: Bar[] = doc.bars.map((b, i) => {
    const bar: { key?: Key | null; chords?: ChordField; section?: string } = {};
    if (b.key === null) bar.key = null;
    else if (b.key !== undefined) {
      try {
        bar.key = parseKeyToken(b.key);
      } catch (e) {
        issues.push({ path: `bars[${String(i)}].key`, message: (e as KeyParseError).message });
      }
    }
    if (b.chords !== undefined) {
      const chords = b.chords.flatMap((symbol, j) => {
        try {
          return [parseChord(symbol)];
        } catch (e) {
          issues.push({
            path: `bars[${String(i)}].chords[${String(j)}]`,
            message: (e as ChordParseError).message,
          });
          return [];
        }
      });
      bar.chords = chords as unknown as ChordField;
    }
    if (b.section !== undefined) bar.section = b.section;
    return bar;
  });
  if (issues.length) return { ok: false, issues };
  const sheet: Sheet = {
    schemaVersion: 1,
    id: doc.id,
    title: doc.title,
    meter: doc.meter,
    originBar: doc.originBar,
    bars,
    ...(doc.tempoNote !== undefined ? { tempoNote: doc.tempoNote } : {}),
    ...(doc.loop ? { loop: doc.loop } : {}),
  };
  return { ok: true, sheet };
}

/** Serialise for storage/export. Symbols and key spellings are the user's. */
export function toDoc(sheet: Sheet): SheetDoc {
  return {
    schemaVersion: 1,
    id: sheet.id,
    title: sheet.title,
    meter: { ...sheet.meter },
    originBar: sheet.originBar,
    ...(sheet.tempoNote !== undefined ? { tempoNote: sheet.tempoNote } : {}),
    ...(sheet.loop ? { loop: { ...sheet.loop } } : {}),
    bars: sheet.bars.map((b) => ({
      ...(b.key === null ? { key: null } : b.key !== undefined ? { key: formatKey(b.key) } : {}),
      ...(b.chords !== undefined ? { chords: b.chords.map((c) => c.symbol) } : {}),
      ...(b.section !== undefined ? { section: b.section } : {}),
    })),
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (acc, seg) =>
      typeof seg === 'number' ? `${acc}[${String(seg)}]` : acc ? `${acc}.${String(seg)}` : String(seg),
    '',
  );
}
