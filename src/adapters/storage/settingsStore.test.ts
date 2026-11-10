import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@core/settings';
import { MemoryStorage, SettingsStore } from './settingsStore';

describe('SettingsStore', () => {
  it('round-trips settings and ports; unknown fields fall back to defaults', () => {
    const storage = new MemoryStorage();
    const s = new SettingsStore(storage);
    expect(s.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(s.saveSettings({ ...DEFAULT_SETTINGS, relative: true, octaveShift: 2 })).toBe(true);
    expect(s.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, relative: true, octaveShift: 2 });
    expect(s.loadPorts()).toEqual({});
    expect(s.savePorts({ lpIn: 'a', clockIn: 'c' })).toBe(true);
    expect(s.loadPorts()).toEqual({ lpIn: 'a', clockIn: 'c' });
    storage.setItem('launchpad-lead-sheet:ports', JSON.stringify({ lpIn: 1, notesOut: 'n', junk: true }));
    expect(s.loadPorts()).toEqual({ notesOut: 'n' });
    storage.setItem('launchpad-lead-sheet:settings', '{broken');
    expect(s.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('runs on defaults without storage and swallows write failures', () => {
    const none = new SettingsStore(null);
    expect(none.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(none.saveSettings(DEFAULT_SETTINGS)).toBe(false);
    expect(none.loadPorts()).toEqual({});
    const storage = new MemoryStorage();
    storage.throwOnSet = true;
    const s = new SettingsStore(storage);
    expect(s.saveSettings(DEFAULT_SETTINGS)).toBe(false);
    expect(new SettingsStore().loadSettings()).toEqual(DEFAULT_SETTINGS); // Node: no localStorage
  });
});
