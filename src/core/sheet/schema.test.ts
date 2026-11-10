import { describe, expect, it } from 'vitest';
import { fromDoc, loadSheet, sheetDocSchema, toDoc, type SheetDoc } from './schema';

const base: SheetDoc = {
  schemaVersion: 1,
  id: 'abc',
  title: 'Autumn',
  meter: { numerator: 4, denominator: 4 },
  originBar: 1,
  bars: [{ key: 'G', chords: ['Cmaj7'] }, { chords: ['Am7', 'D7'] }, {}, { key: null, chords: [] }],
};

describe('loadSheet', () => {
  it('loads a valid document into a sheet with parsed keys and chords', () => {
    const r = loadSheet(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sheet.bars).toHaveLength(4);
    expect(r.sheet.bars[0]!.key).toMatchObject({ root: 7, scale: 'major' });
    expect(r.sheet.bars[0]!.chords![0]!.symbol).toBe('Cmaj7');
    expect(r.sheet.bars[1]!.chords).toHaveLength(2);
    expect(r.sheet.bars[2]).toEqual({});
    expect(r.sheet.bars[3]).toEqual({ key: null, chords: [] });
    expect(r.sheet.tempoNote).toBeUndefined();
    expect(r.sheet.loop).toBeUndefined();
  });

  it('accepts an empty sheet', () => {
    const r = loadSheet({ ...base, bars: [] });
    expect(r.ok).toBe(true);
  });

  it('rejects a future schema version with an actionable message', () => {
    const r = loadSheet({ ...base, schemaVersion: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]!.path).toBe('schemaVersion');
    expect(r.issues[0]!.message).toMatch(/schema version 2.*supports up to 1/);
  });

  it.each<[string, Partial<SheetDoc> | Record<string, unknown>]>([
    ['meter numerator 0', { meter: { numerator: 0, denominator: 4 } }],
    ['meter numerator 17', { meter: { numerator: 17, denominator: 4 } }],
    ['meter denominator 3', { meter: { numerator: 4, denominator: 3 as unknown as 4 } }],
    ['meter numerator fractional', { meter: { numerator: 4.5, denominator: 4 } }],
    ['originBar 0', { originBar: 0 }],
    ['originBar fractional', { originBar: 1.5 }],
    ['loop reversed', { loop: { startBar: 3, endBar: 2 } }],
    ['loop past end', { loop: { startBar: 1, endBar: 5 } }],
    ['loop on empty sheet', { bars: [], loop: { startBar: 1, endBar: 1 } }],
    ['three chords', { bars: [{ chords: ['C', 'F', 'G'] }] }],
    ['empty id', { id: '' }],
    ['unknown field', { extra: true }],
    ['tempo zero', { tempoNote: 0 }],
    ['not an object', 'nope' as unknown as Partial<SheetDoc>],
  ])('rejects %s', (_name, patch) => {
    const r = loadSheet(typeof patch === 'string' ? patch : { ...base, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it('reports bad chord symbols and key tokens with their bar path', () => {
    const r = loadSheet({ ...base, bars: [{ key: 'G bebop', chords: ['Cmaj7', 'Hm7'] }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.path)).toEqual(['bars[0].key', 'bars[0].chords[1]']);
  });

  it('formats nested zod paths', () => {
    const r = loadSheet({ ...base, loop: { startBar: 1, endBar: 9 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.path).toBe('loop.endBar');
  });
});

describe('toDoc / fromDoc round trip', () => {
  it('preserves symbols, key spelling, inherit/explicit/clear and metadata', () => {
    const doc: SheetDoc = {
      ...base,
      tempoNote: 132,
      loop: { startBar: 2, endBar: 3 },
      bars: [
        { key: 'Bb', chords: ['Bbmaj7', 'Gm7'], section: 'A' },
        {},
        { key: null },
        { chords: [] },
        { key: 'F# dorian', chords: ['F#m7'] },
      ],
    };
    const r = fromDoc(sheetDocSchema.parse(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(toDoc(r.sheet)).toEqual(doc);
  });
});
