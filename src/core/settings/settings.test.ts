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

describe('M7 settings fields', () => {
  it('defaults and validation for clock offset, look-ahead, beat indicator and custom theme', () => {
    expect(DEFAULT_SETTINGS.clockOffsetTicks).toBe(0);
    expect(DEFAULT_SETTINGS.lookAhead).toBe(false);
    expect(DEFAULT_SETTINGS.beatIndicator).toBe(true);
    expect(DEFAULT_SETTINGS.customTheme.colours.chordRoot).toEqual([127, 0, 64]);
    expect(parseSettings({ clockOffsetTicks: 99 }).clockOffsetTicks).toBe(0);
    expect(parseSettings({ clockOffsetTicks: -12 }).clockOffsetTicks).toBe(-12);
    expect(parseSettings({ customTheme: { colours: {}, rootFlash: { a: 1, b: 2 } } }).customTheme).toEqual(
      DEFAULT_SETTINGS.customTheme,
    );
    const ok = parseSettings({ customTheme: { ...DEFAULT_SETTINGS.customTheme, rootFlash: { a: 5, b: 7 } } });
    expect(ok.customTheme.rootFlash).toEqual({ a: 5, b: 7 });
  });
});
