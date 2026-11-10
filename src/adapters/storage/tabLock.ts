/**
 * Single-tab ownership (plan §4.2): one tab talks MIDI; others are passive. Web Locks give the mutual
 * exclusion; a BroadcastChannel lets passive tabs show who owns it. Both are injectable so this runs in
 * Node tests and degrades to "owner" when the APIs are missing (single-tab browsers, old Chromium).
 */

export type TabRole = 'owner' | 'passive';

export interface LockLike {
  readonly name: string;
}
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: LockLike | null) => Promise<unknown>,
  ): Promise<unknown>;
}
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export interface TabLockOptions {
  readonly name?: string;
  readonly locks?: LockManagerLike | null;
  readonly channel?: BroadcastChannelLike | null;
}

export const DEFAULT_LOCK_NAME = 'launchpad-lead-sheet:midi-owner';

export class TabLock {
  private role: TabRole | null = null;
  private releaseHeld: (() => void) | null = null;
  private waiting = false;
  private readonly listeners = new Set<(role: TabRole) => void>();
  private readonly name: string;
  private readonly locks: LockManagerLike | null;
  private readonly channel: BroadcastChannelLike | null;

  constructor(options: TabLockOptions = {}) {
    this.name = options.name ?? DEFAULT_LOCK_NAME;
    this.locks = options.locks === undefined ? defaultLocks() : options.locks;
    this.channel = options.channel === undefined ? defaultChannel(this.name) : options.channel;
    if (this.channel) {
      this.channel.onmessage = (e) => {
        if (e.data === 'owner-changed' && this.role === 'passive') this.notify('passive');
      };
    }
  }

  current(): TabRole | null {
    return this.role;
  }

  onChange(listener: (role: TabRole) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Try to become the owner without waiting. Resolves 'owner' or 'passive'. Without Web Locks this tab
   * is always the owner.
   */
  async acquire(): Promise<TabRole> {
    if (this.role === 'owner') return 'owner';
    const locks = this.locks;
    if (!locks) return this.setRole('owner');
    const got = await new Promise<boolean>((resolve) => {
      void locks.request(this.name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return Promise.resolve();
        }
        resolve(true);
        return new Promise<void>((release) => {
          this.releaseHeld = release;
        });
      });
    });
    return this.setRole(got ? 'owner' : 'passive');
  }

  /**
   * Passive tabs call this to take over when the owner goes away (tab closed, lock released). Resolves
   * when this tab becomes the owner. Idempotent.
   */
  waitForOwnership(): Promise<TabRole> {
    if (this.role === 'owner') return Promise.resolve('owner');
    const locks = this.locks;
    if (!locks) return Promise.resolve(this.setRole('owner'));
    if (this.waiting) return Promise.resolve('passive');
    this.waiting = true;
    return new Promise<TabRole>((resolve) => {
      void locks.request(this.name, {}, () => {
        this.waiting = false;
        resolve(this.setRole('owner'));
        return new Promise<void>((release) => {
          this.releaseHeld = release;
        });
      });
    });
  }

  /** Give the lock up (page hide / explicit hand-over). */
  release(): void {
    if (this.releaseHeld) {
      this.releaseHeld();
      this.releaseHeld = null;
    }
    if (this.role === 'owner') {
      this.role = 'passive';
      this.channel?.postMessage('owner-changed');
    }
  }

  dispose(): void {
    this.release();
    this.channel?.close();
    this.listeners.clear();
  }

  private setRole(role: TabRole): TabRole {
    const changed = this.role !== role;
    this.role = role;
    if (changed) {
      if (role === 'owner') this.channel?.postMessage('owner-changed');
      this.notify(role);
    }
    return role;
  }

  private notify(role: TabRole): void {
    for (const l of this.listeners) l(role);
  }
}

function defaultLocks(): LockManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return nav?.locks ?? null;
}

function defaultChannel(name: string): BroadcastChannelLike | null {
  const Ctor = (globalThis as { BroadcastChannel?: new (name: string) => BroadcastChannelLike })
    .BroadcastChannel;
  return Ctor ? new Ctor(name) : null;
}
