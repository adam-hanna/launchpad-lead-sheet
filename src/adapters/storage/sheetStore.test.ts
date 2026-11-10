import { describe, expect, it } from 'vitest';
import { parseChart, type Sheet } from '@core/sheet';
import { MemoryKv } from './kv';
import { Autosave, SheetStore } from './sheetStore';

function sheet(id: string, title: string, chart = '| C | G |'): Sheet {
  const r = parseChart(`title: ${title}\n${chart}`, id);
  if (!r.ok) throw new Error('fixture');
  return r.sheet;
}

describe('SheetStore', () => {
  it('saves, loads, lists by recency, deletes and tracks the last opened sheet', async () => {
    const kv = new MemoryKv();
    let t = 0;
    const store = new SheetStore(kv, () => `2026-01-01T00:00:0${String(t++)}Z`);
    await store.save(sheet('a', 'Alpha'));
    await store.save(sheet('b', 'Beta', '| C | D | E |'));
    expect(await store.exists('a')).toBe(true);
    expect(await store.exists('zzz')).toBe(false);
    const loaded = await store.load('a');
    expect(loaded?.ok && loaded.sheet.title).toBe('Alpha');
    const { sheets, invalid } = await store.list();
    expect(sheets.map((s) => `${s.id}:${s.title}:${String(s.barCount)}`)).toEqual(['b:Beta:3', 'a:Alpha:2']);
    expect(invalid).toEqual([]);
    await store.setLastOpened('a');
    expect(await store.lastOpened()).toBe('a');
    await store.delete('a');
    expect(await store.load('a')).toBeNull();
    expect(await store.lastOpened()).toBeNull();
  });

  it('reports unreadable records instead of hiding them', async () => {
    const kv = new MemoryKv();
    const store = new SheetStore(kv);
    await kv.set('sheet:bad', '{not json');
    await kv.set('sheet:future', JSON.stringify({ updatedAt: 'x', doc: { schemaVersion: 9 } }));
    await store.save(sheet('ok', 'Fine'));
    const { sheets, invalid } = await store.list();
    expect(sheets.map((s) => s.id)).toEqual(['ok']);
    expect(invalid.sort()).toEqual(['bad', 'future']);
    const bad = await store.load('bad');
    expect(bad?.ok).toBe(false);
  });

  it('a failed write keeps the previous copy', async () => {
    const kv = new MemoryKv();
    const store = new SheetStore(kv);
    await store.save(sheet('a', 'v1'));
    kv.failNextSet = true;
    await expect(store.save(sheet('a', 'v2'))).rejects.toThrow();
    const r = await store.load('a');
    expect(r?.ok && r.sheet.title).toBe('v1');
  });
});

describe('Autosave', () => {
  function timers() {
    const queue: { fn: () => void; at: number }[] = [];
    let t = 0;
    return {
      setTimer: (fn: () => void, ms: number) => {
        const h = { fn, at: t + ms };
        queue.push(h);
        return h;
      },
      clearTimer: (h: unknown) => {
        const i = queue.indexOf(h as { fn: () => void; at: number });
        if (i >= 0) queue.splice(i, 1);
      },
      advance: async (ms: number) => {
        t += ms;
        for (const h of [...queue]) {
          if (h.at <= t) {
            queue.splice(queue.indexOf(h), 1);
            h.fn();
          }
        }
        await Promise.resolve();
        await Promise.resolve();
      },
      pending: () => queue.length,
    };
  }

  it('debounces: the newest version of a sheet wins, one write per sheet', async () => {
    const kv = new MemoryKv();
    const store = new SheetStore(kv);
    const tm = timers();
    const saved: string[] = [];
    const auto = new Autosave(store, {
      debounceMs: 100,
      setTimer: tm.setTimer,
      clearTimer: tm.clearTimer,
      onSaved: (id) => saved.push(id),
    });
    auto.schedule(sheet('a', 'v1'));
    auto.schedule(sheet('a', 'v2'));
    auto.schedule(sheet('b', 'other'));
    expect(auto.hasPending('a')).toBe(true);
    expect(tm.pending()).toBe(2);
    await tm.advance(100);
    await auto.settled();
    expect(saved.sort()).toEqual(['a', 'b']);
    const r = await store.load('a');
    expect(r?.ok && r.sheet.title).toBe('v2');
    expect(auto.hasPending()).toBe(false);
  });

  it('flush writes pending sheets immediately (sheet switch); failures are reported, not thrown', async () => {
    const kv = new MemoryKv();
    const store = new SheetStore(kv);
    const tm = timers();
    const errors: string[] = [];
    const auto = new Autosave(store, {
      debounceMs: 1000,
      setTimer: tm.setTimer,
      clearTimer: tm.clearTimer,
      onError: (id) => errors.push(id),
    });
    auto.schedule(sheet('a', 'v1'));
    await auto.flush();
    expect(tm.pending()).toBe(0);
    expect((await store.load('a'))?.ok).toBe(true);
    kv.failNextSet = true;
    auto.schedule(sheet('a', 'v2'));
    await auto.flush();
    expect(errors).toEqual(['a']);
    const r = await store.load('a');
    expect(r?.ok && r.sheet.title).toBe('v1'); // last good copy kept
    await auto.flush(); // nothing pending
  });
});
