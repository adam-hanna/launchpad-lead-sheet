import { describe, expect, it, vi } from 'vitest';
import { TabLock, type BroadcastChannelLike, type LockLike, type LockManagerLike } from './tabLock';

/** Minimal Web Locks: one holder per name, FIFO waiters, `ifAvailable` returns null when held. */
class FakeLockManager implements LockManagerLike {
  private held = new Map<string, true>();
  private waiters = new Map<string, (() => void)[]>();

  request(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: LockLike | null) => Promise<unknown>,
  ): Promise<unknown> {
    if (this.held.has(name)) {
      if (options.ifAvailable) return callback(null);
      return new Promise((resolve) => {
        const list = this.waiters.get(name) ?? [];
        list.push(() => {
          resolve(this.grant(name, callback));
        });
        this.waiters.set(name, list);
      });
    }
    return this.grant(name, callback);
  }

  private grant(name: string, callback: (lock: LockLike | null) => Promise<unknown>): Promise<unknown> {
    this.held.set(name, true);
    return callback({ name }).finally(() => {
      this.held.delete(name);
      const next = this.waiters.get(name)?.shift();
      if (next) next();
    });
  }

  isHeld(name: string): boolean {
    return this.held.has(name);
  }
}

class FakeChannel implements BroadcastChannelLike {
  static all: FakeChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly posted: unknown[] = [];
  constructor() {
    FakeChannel.all.push(this);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
    for (const c of FakeChannel.all) if (c !== this) c.onmessage?.({ data: message });
  }
  close(): void {
    FakeChannel.all = FakeChannel.all.filter((c) => c !== this);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('TabLock', () => {
  it('first tab becomes owner, second is passive, and takes over when the owner releases', async () => {
    const locks = new FakeLockManager();
    const a = new TabLock({ locks, channel: new FakeChannel() });
    const b = new TabLock({ locks, channel: new FakeChannel() });
    const bRoles: string[] = [];
    b.onChange((r) => bRoles.push(r));
    expect(await a.acquire()).toBe('owner');
    expect(await b.acquire()).toBe('passive');
    expect(await a.acquire()).toBe('owner'); // idempotent
    const takeover = b.waitForOwnership();
    expect(await b.waitForOwnership()).toBe('passive'); // already waiting
    a.release();
    expect(await takeover).toBe('owner');
    await tick();
    expect(a.current()).toBe('passive');
    expect(locks.isHeld('launchpad-lead-sheet:midi-owner')).toBe(true);
    expect(bRoles).toContain('owner');
    b.dispose();
    await tick();
    expect(locks.isHeld('launchpad-lead-sheet:midi-owner')).toBe(false);
  });

  it('passive tabs are notified when ownership changes via the channel', async () => {
    const locks = new FakeLockManager();
    const a = new TabLock({ locks, channel: new FakeChannel() });
    const b = new TabLock({ locks, channel: new FakeChannel() });
    await a.acquire();
    await b.acquire();
    const seen = vi.fn();
    b.onChange(seen);
    a.release();
    expect(seen).toHaveBeenCalledWith('passive');
    a.dispose();
    b.dispose();
  });

  it('without Web Locks this tab is always the owner; waitForOwnership resolves immediately', async () => {
    const t = new TabLock({ locks: null, channel: null });
    expect(t.current()).toBeNull();
    expect(await t.acquire()).toBe('owner');
    const u = new TabLock({ locks: null, channel: null });
    expect(await u.waitForOwnership()).toBe('owner');
    t.release();
    expect(t.current()).toBe('passive');
    t.release(); // idempotent
  });

  it('uses navigator.locks and BroadcastChannel from the environment when present', () => {
    const t = new TabLock();
    expect(t.current()).toBeNull();
    t.dispose();
  });
});
