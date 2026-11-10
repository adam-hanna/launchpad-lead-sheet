import { describe, expect, it } from 'vitest';
import { exportSheetJson, importSheetJson } from './json';
import { parseChart } from './text';

const sheet = (() => {
  const r = parseChart('title: T\n| {C} Cmaj7 | Am7 G7 |', 'id-1');
  if (!r.ok) throw new Error('fixture');
  return r.sheet;
})();
const opts = { exists: (id: string) => id === 'taken', newId: () => 'fresh' };

describe('sheet JSON', () => {
  it('round-trips through export and import', () => {
    const text = exportSheetJson(sheet);
    expect(text).toContain('"schemaVersion": 1');
    expect(text).toContain('"Am7"');
    expect(text).not.toContain('tones');
    const r = importSheetJson(text, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sheet.id).toBe('id-1');
      expect(exportSheetJson(r.sheet)).toBe(text);
      expect(r.copied).toBeUndefined();
    }
  });
  it('imports a colliding id as a copy', () => {
    const text = exportSheetJson({ ...sheet, id: 'taken' });
    const r = importSheetJson(text, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sheet.id).toBe('fresh');
      expect(r.sheet.title).toBe('T (copy)');
      expect(r.copied).toBe(true);
    }
  });
  it('rejects invalid JSON and invalid documents without throwing', () => {
    const bad = importSheetJson('{not json', opts);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]!.message).toMatch(/not valid JSON/);
    const future = importSheetJson(JSON.stringify({ schemaVersion: 7 }), opts);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.issues[0]!.path).toBe('schemaVersion');
  });
});
