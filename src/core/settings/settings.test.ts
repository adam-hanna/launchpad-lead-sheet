import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, settingsSchema } from './index';

describe('parseSettings', () => {
  it('returns defaults for garbage and keeps valid fields from partial input', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ displayMode: 'key', octaveShift: 2 })).toEqual({
      ...DEFAULT_SETTINGS,
      displayMode: 'key',
      octaveShift: 2,
    });
  });
  it('one invalid field falls back alone', () => {
    const s = parseSettings({
      displayMode: 'nope',
      relative: true,
      layout: { rowOffset: 99, baseNote: 36 },
      notesChannel: 3,
    });
    expect(s.displayMode).toBe('keyChord');
    expect(s.relative).toBe(true);
    expect(s.layout).toEqual(DEFAULT_SETTINGS.layout);
    expect(s.notesChannel).toBe(3);
  });
  it('defaults satisfy the schema', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });
});
