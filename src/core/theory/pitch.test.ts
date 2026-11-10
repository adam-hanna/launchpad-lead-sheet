import { describe, expect, it } from 'vitest';
import {
  intervalUp,
  isMidiNote,
  midiNoteName,
  parseNoteName,
  pitchClassName,
  toPitchClass,
  transpose,
} from './pitch';

describe('toPitchClass', () => {
  it('wraps positive, negative and large values', () => {
    expect(toPitchClass(0)).toBe(0);
    expect(toPitchClass(12)).toBe(0);
    expect(toPitchClass(13)).toBe(1);
    expect(toPitchClass(-1)).toBe(11);
    expect(toPitchClass(-13)).toBe(11);
    expect(toPitchClass(60)).toBe(0);
    expect(toPitchClass(61.9)).toBe(1);
  });
});

describe('transpose / intervalUp', () => {
  it('transposes within the octave', () => {
    expect(transpose(11, 1)).toBe(0);
    expect(transpose(0, -1)).toBe(11);
    expect(transpose(4, 7)).toBe(11);
  });
  it('measures ascending intervals', () => {
    expect(intervalUp(0, 7)).toBe(7);
    expect(intervalUp(7, 0)).toBe(5);
    expect(intervalUp(3, 3)).toBe(0);
  });
});

describe('parseNoteName', () => {
  it.each([
    ['C', 0, 0],
    ['C#', 1, 1],
    ['Db', 1, -1],
    ['E', 4, 0],
    ['Fb', 4, -1],
    ['B#', 0, 1],
    ['Cb', 11, -1],
    ['F##', 7, 2],
    ['Fx', 7, 2],
    ['Bbb', 9, -2],
    ['E♭', 3, -1],
    ['a♯', 10, 1],
    [' G ', 7, 0],
  ])('parses %s', (text, pc, accidental) => {
    const n = parseNoteName(text);
    expect(n).not.toBeNull();
    expect(n!.pc).toBe(pc);
    expect(n!.accidental).toBe(accidental);
    expect(n!.text).toBe(text.trim());
  });

  it.each(['', 'H', 'C#b', 'Cmaj7', '9', 'Cb b', 'do'])('rejects %j', (text) => {
    expect(parseNoteName(text)).toBeNull();
  });
});

describe('names', () => {
  it('spells pitch classes with sharps or flats', () => {
    expect(pitchClassName(1)).toBe('C#');
    expect(pitchClassName(1, 'flat')).toBe('Db');
    expect(pitchClassName(0, 'flat')).toBe('C');
  });
  it('uses Live octave naming (60 = C3)', () => {
    expect(midiNoteName(60)).toBe('C3');
    expect(midiNoteName(36)).toBe('C1');
    expect(midiNoteName(0)).toBe('C-2');
    expect(midiNoteName(127)).toBe('G8');
    expect(midiNoteName(70, 'flat')).toBe('Bb3');
  });
  it('validates MIDI notes', () => {
    expect(isMidiNote(0)).toBe(true);
    expect(isMidiNote(127)).toBe(true);
    expect(isMidiNote(128)).toBe(false);
    expect(isMidiNote(-1)).toBe(false);
    expect(isMidiNote(60.5)).toBe(false);
  });
});
