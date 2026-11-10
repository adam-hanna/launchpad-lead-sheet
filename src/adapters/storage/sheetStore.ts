import { loadSheet, toDoc, type Sheet, type SheetIssue } from '@core/sheet';
import type { KeyValueStore } from './kv';

export interface SheetSummary {
  readonly id: string;
  readonly title: string;
  readonly barCount: number;
  readonly updatedAt: string;
}

interface StoredRecord {
  readonly updatedAt: string;
  readonly doc: unknown;
}

const PREFIX = 'sheet:';
const LAST_OPEN = 'ui:lastSheet';

/**
 * Sheet library over a key/value store (plan §4.11). Each sheet is one record written atomically, so a
 * failed write leaves the previous copy intact. Records that fail validation are listed as invalid rather
 * than hidden, so nothing silently disappears.
 */
export class SheetStore {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async save(sheet: Sheet): Promise<void> {
    const record: StoredRecord = { updatedAt: this.now(), doc: toDoc(sheet) };
    await this.kv.set(PREFIX + sheet.id, JSON.stringify(record));
  }

  async load(
    id: string,
  ): Promise<
    { ok: true; sheet: Sheet; updatedAt: string } | { ok: false; issues: readonly SheetIssue[] } | null
  > {
    const raw = await this.kv.get(PREFIX + id);
    if (raw === undefined) return null;
    let record: StoredRecord;
    try {
      record = JSON.parse(raw) as StoredRecord;
    } catch {
      return { ok: false, issues: [{ path: '', message: 'stored record is not valid JSON' }] };
    }
    const r = loadSheet(record.doc);
    return r.ok ? { ok: true, sheet: r.sheet, updatedAt: record.updatedAt } : r;
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(PREFIX + id);
    if ((await this.lastOpened()) === id) await this.kv.delete(LAST_OPEN);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.kv.get(PREFIX + id)) !== undefined;
  }

  /** Summaries sorted by most recently updated. Unreadable records are reported with an empty title. */
  async list(): Promise<{ sheets: SheetSummary[]; invalid: string[] }> {
    const keys = await this.kv.keys(PREFIX);
    const sheets: SheetSummary[] = [];
    const invalid: string[] = [];
    for (const key of keys) {
      const id = key.slice(PREFIX.length);
      const r = await this.load(id);
      if (r?.ok)
        sheets.push({ id, title: r.sheet.title, barCount: r.sheet.bars.length, updatedAt: r.updatedAt });
      else invalid.push(id);
    }
    sheets.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return { sheets, invalid };
  }

  async setLastOpened(id: string): Promise<void> {
    await this.kv.set(LAST_OPEN, id);
  }

  async lastOpened(): Promise<string | null> {
    return (await this.kv.get(LAST_OPEN)) ?? null;
  }
}

export interface AutosaveOptions {
  readonly debounceMs?: number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly onError?: (sheetId: string, error: unknown) => void;
  readonly onSaved?: (sheetId: string) => void;
}

/**
 * Debounced autosave with one pending write per sheet id (plan §4.11). `flush()` writes everything that
 * is pending (called when switching sheets or hiding the page). Failures are reported, never thrown, and
 * the in-memory sheet keeps editing.
 */
export class Autosave {
  private readonly pending = new Map<string, { sheet: Sheet; handle: unknown }>();
  private readonly debounceMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onError: (sheetId: string, error: unknown) => void;
  private readonly onSaved: (sheetId: string) => void;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: SheetStore,
    options: AutosaveOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 500;
    this.setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimer =
      options.clearTimer ??
      ((h) => {
        globalThis.clearTimeout(h as ReturnType<typeof setTimeout>);
      });
    this.onError = options.onError ?? (() => undefined);
    this.onSaved = options.onSaved ?? (() => undefined);
  }

  /** Schedule a write; a newer version of the same sheet replaces the pending one. */
  schedule(sheet: Sheet): void {
    const existing = this.pending.get(sheet.id);
    if (existing) this.clearTimer(existing.handle);
    // Register before arming the timer: a synchronous timer (tests) must find the entry.
    const entry: { sheet: Sheet; handle: unknown } = { sheet, handle: null };
    this.pending.set(sheet.id, entry);
    entry.handle = this.setTimer(() => {
      void this.write(sheet.id);
    }, this.debounceMs);
  }

  /** Write every pending sheet now. Resolves after the writes settle. */
  async flush(): Promise<void> {
    const ids = [...this.pending.keys()];
    for (const id of ids) {
      const p = this.pending.get(id);
      if (p) this.clearTimer(p.handle);
      await this.write(id);
    }
  }

  /** Resolves once every write started so far has settled (tests and page-hide handlers). */
  settled(): Promise<void> {
    return this.inFlight;
  }

  hasPending(id?: string): boolean {
    return id === undefined ? this.pending.size > 0 : this.pending.has(id);
  }

  private write(id: string): Promise<void> {
    const p = this.pending.get(id);
    if (!p) return Promise.resolve();
    this.pending.delete(id);
    // Serialise writes so a slow store never reorders two saves of the same sheet.
    this.inFlight = this.inFlight.then(async () => {
      try {
        await this.store.save(p.sheet);
        this.onSaved(id);
      } catch (e) {
        this.onError(id, e);
      }
    });
    return this.inFlight;
  }
}
