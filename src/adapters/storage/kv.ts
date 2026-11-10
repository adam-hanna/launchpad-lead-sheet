/**
 * Minimal async key/value store used by the sheet library. IndexedDB in the browser, memory in tests
 * and as the fallback when IndexedDB is unavailable (private windows, blocked storage).
 */
export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export class MemoryKv implements KeyValueStore {
  private readonly map = new Map<string, string>();
  /** Test hook: make the next write fail. */
  failNextSet = false;
  /** Test hook: make writes to matching keys fail persistently. */
  failSet: ((key: string) => boolean) | null = null;

  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.map.get(key));
  }
  set(key: string, value: string): Promise<void> {
    if (this.failNextSet || this.failSet?.(key)) {
      this.failNextSet = false;
      return Promise.reject(new Error('storage write failed'));
    }
    this.map.set(key, value);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
  keys(prefix = ''): Promise<string[]> {
    return Promise.resolve([...this.map.keys()].filter((k) => k.startsWith(prefix)).sort());
  }
  size(): number {
    return this.map.size;
  }
}

const DB_NAME = 'launchpad-lead-sheet';
const STORE = 'kv';

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** IndexedDB-backed store: one object store, string keys and values. */
export class IndexedDbKv implements KeyValueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('indexedDB.open failed'));
      };
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('indexedDB request failed'));
      };
    });
  }

  async get(key: string): Promise<string | undefined> {
    const v = await this.tx<unknown>('readonly', (s) => s.get(key));
    return typeof v === 'string' ? v : undefined;
  }
  async set(key: string, value: string): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
  async keys(prefix = ''): Promise<string[]> {
    const all = await this.tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return all
      .map(String)
      .filter((k) => k.startsWith(prefix))
      .sort();
  }
}

/** The browser's store, or memory when IndexedDB is missing. */
export function defaultKv(): KeyValueStore {
  return isIndexedDbAvailable() ? new IndexedDbKv() : new MemoryKv();
}
