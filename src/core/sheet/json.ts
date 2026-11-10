import { loadSheet, toDoc, type LoadResult } from './schema';
import type { Sheet } from './types';

/** Pretty JSON of the persisted form (plan §4.11: symbols authoritative, tones never stored). */
export function exportSheetJson(sheet: Sheet): string {
  return JSON.stringify(toDoc(sheet), null, 2) + '\n';
}

export interface ImportOptions {
  /** Ids already in the library; a collision imports as a copy with a fresh id. */
  readonly exists: (id: string) => boolean;
  readonly newId: () => string;
}

export type ImportResult = LoadResult & { readonly copied?: boolean };

/**
 * Validate JSON text before anything is replaced. A sheet whose id already exists is imported as a copy
 * with a new id and a "(copy)" title suffix (plan §4.11). Never throws.
 */
export function importSheetJson(text: string, options: ImportOptions): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [{ path: '', message: `not valid JSON: ${(e as Error).message}` }] };
  }
  const r = loadSheet(parsed);
  if (!r.ok) return r;
  if (options.exists(r.sheet.id)) {
    return {
      ok: true,
      copied: true,
      sheet: { ...r.sheet, id: options.newId(), title: `${r.sheet.title} (copy)` },
    };
  }
  return r;
}
