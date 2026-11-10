import { parseSettings, type Settings } from '@core/settings';
import type { PortSelection } from '@adapters/midi';

/** `localStorage`'s shape, injectable so this runs in Node and survives blocked storage. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SETTINGS_KEY = 'launchpad-lead-sheet:settings';
const PORTS_KEY = 'launchpad-lead-sheet:ports';

/**
 * Settings and remembered ports in localStorage (plan §2 persistence: settings separate from sheets).
 * Every access is wrapped: in a private window or with storage blocked the app runs on defaults.
 */
export class SettingsStore {
  private readonly storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? defaultStorage() : storage;
  }

  loadSettings(): Settings {
    return parseSettings(this.read(SETTINGS_KEY));
  }

  saveSettings(settings: Settings): boolean {
    return this.write(SETTINGS_KEY, settings);
  }

  loadPorts(): PortSelection {
    const raw = this.read(PORTS_KEY);
    if (typeof raw !== 'object' || raw === null) return {};
    const out: { lpIn?: string; lpOut?: string; clockIn?: string; notesOut?: string } = {};
    for (const key of ['lpIn', 'lpOut', 'clockIn', 'notesOut'] as const) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'string' && v) out[key] = v;
    }
    return out;
  }

  savePorts(ports: PortSelection): boolean {
    return this.write(PORTS_KEY, ports);
  }

  private read(key: string): unknown {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): boolean {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
      return this.storage !== null;
    } catch {
      return false;
    }
  }
}

function defaultStorage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  throwOnSet = false;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
