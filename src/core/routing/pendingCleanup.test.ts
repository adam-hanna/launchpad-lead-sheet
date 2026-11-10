import { describe, expect, it } from 'vitest';
import { PendingCleanup } from './pendingCleanup';

const d = (port: string, note: number, channel = 0) => ({ port, channel, note });

describe('PendingCleanup (plan §4.2 destination unavailable)', () => {
  it('records per port, blocks that port only, and produces Note Offs to retry', () => {
    const p = new PendingCleanup();
    expect(p.isBlocked('A')).toBe(false);
    p.add([d('A', 60), d('A', 62), d('B', 64)]);
    p.add([d('A', 60)]); // duplicate collapses
    expect(p.size()).toBe(3);
    expect(p.isBlocked('A')).toBe(true);
    expect(p.isBlocked('B')).toBe(true);
    expect(p.isBlocked('C')).toBe(false);
    expect(p.messagesFor('A')).toEqual([
      { type: 'noteOff', port: 'A', channel: 0, note: 60 },
      { type: 'noteOff', port: 'A', channel: 0, note: 62 },
    ]);
    expect(p.messagesFor('C')).toEqual([]);
    expect(p.ports().sort()).toEqual(['A', 'B']);
  });

  it('a failed send keeps the record; confirm removes only what was delivered', () => {
    const p = new PendingCleanup();
    p.add([d('A', 60), d('A', 62)]);
    p.confirm([d('A', 60)]);
    expect(p.isBlocked('A')).toBe(true);
    expect(p.stuck()).toEqual([{ port: 'A', notes: [d('A', 62)] }]);
    p.confirm([d('A', 62)]);
    expect(p.isBlocked('A')).toBe(false);
    expect(p.stuck()).toEqual([]);
    p.confirm([d('Z', 1)]); // unknown is harmless
  });
});
