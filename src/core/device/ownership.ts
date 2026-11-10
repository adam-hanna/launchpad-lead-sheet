import { LAYOUT_PROGRAMMER } from './protocol';

/**
 * Device ownership state machine (plan §4.2). Pure: events in, effects out; the adapter layer performs
 * the effects in order. Time is injected so the bounded-recovery window is testable.
 */

export type Desired = 'ours' | 'released';

export type OwnershipStatus =
  /** No Launchpad connected. */
  | 'disconnected'
  /** Connected, we do not want control (after Restore or before the first Enter). */
  | 'released'
  /** We want control and have asked for Programmer mode; waiting for the device to confirm. */
  | 'acquiring'
  /** Programmer mode confirmed, complete frame sent, input enabled. */
  | 'owned'
  /** Kicked out repeatedly; automatic recovery suspended until manual retry. */
  | 'conflict';

export type OwnershipEffect =
  | { readonly type: 'send'; readonly command: 'enterProgrammer' | 'restoreLive' }
  /** Release every hardware-owned note through NoteOwnership (refcounts respected). */
  | { readonly type: 'cleanupHardwareOwners' }
  /** The device may show anything: the next render must be a complete frame. */
  | { readonly type: 'invalidateFrame' }
  /** Programmer mode is confirmed: send the complete frame now. */
  | { readonly type: 'repaint' }
  /** Gate hardware pad/pressure input. */
  | { readonly type: 'inputEnabled'; readonly enabled: boolean }
  | { readonly type: 'statusChanged'; readonly status: OwnershipStatus };

export interface OwnershipSnapshot {
  readonly desired: Desired;
  readonly connected: boolean;
  readonly observedLayout: number | null;
  readonly conflict: boolean;
  readonly status: OwnershipStatus;
  readonly inputEnabled: boolean;
  /** Automatic re-entries within the current window. */
  readonly reentries: number;
}

export interface OwnershipConfig {
  readonly maxReentries: number;
  readonly windowMs: number;
}

export const DEFAULT_OWNERSHIP_CONFIG: OwnershipConfig = { maxReentries: 3, windowMs: 10_000 };

export class DeviceOwnership {
  private desired: Desired = 'released';
  private connected = false;
  private observedLayout: number | null = null;
  private conflict = false;
  private inputEnabled = false;
  private reentryTimes: number[] = [];
  /** After a manual retry, a single further kick-out re-raises the conflict immediately. */
  private retryArmed = false;
  private lastStatus: OwnershipStatus = 'disconnected';

  constructor(
    private readonly now: () => number,
    private readonly config: OwnershipConfig = DEFAULT_OWNERSHIP_CONFIG,
  ) {}

  snapshot(): OwnershipSnapshot {
    return {
      desired: this.desired,
      connected: this.connected,
      observedLayout: this.observedLayout,
      conflict: this.conflict,
      status: this.status(),
      inputEnabled: this.inputEnabled,
      reentries: this.pruned().length,
    };
  }

  // ---- user actions ---------------------------------------------------------------------------------

  /** Enter Programmer mode. Also the manual retry out of `conflict`: clears the flag and tries once. */
  userEnter(): OwnershipEffect[] {
    const fx: OwnershipEffect[] = [];
    this.desired = 'ours';
    if (this.conflict) {
      this.conflict = false;
      this.retryArmed = true;
      this.reentryTimes = [];
    }
    fx.push({ type: 'invalidateFrame' });
    if (this.connected) fx.push({ type: 'send', command: 'enterProgrammer' });
    return this.finish(fx);
  }

  /** Explicit Restore: cleanup, relinquish, then Live mode. Nothing auto-reacquires afterwards. */
  userRestore(): OwnershipEffect[] {
    const fx: OwnershipEffect[] = [];
    fx.push(...this.gateInput());
    fx.push({ type: 'cleanupHardwareOwners' });
    this.desired = 'released';
    this.conflict = false;
    this.retryArmed = false;
    this.reentryTimes = [];
    if (this.connected) fx.push({ type: 'send', command: 'restoreLive' });
    return this.finish(fx);
  }

  // ---- device events --------------------------------------------------------------------------------

  deviceConnected(): OwnershipEffect[] {
    const fx: OwnershipEffect[] = [];
    this.connected = true;
    this.observedLayout = null;
    fx.push({ type: 'invalidateFrame' });
    if (this.desired === 'ours' && !this.conflict) fx.push({ type: 'send', command: 'enterProgrammer' });
    return this.finish(fx);
  }

  /** Desired ownership is preserved so a replug reacquires automatically. */
  deviceDisconnected(): OwnershipEffect[] {
    const fx: OwnershipEffect[] = [];
    fx.push(...this.gateInput());
    fx.push({ type: 'cleanupHardwareOwners' });
    this.connected = false;
    this.observedLayout = null;
    fx.push({ type: 'invalidateFrame' });
    return this.finish(fx);
  }

  /** The device reported its layout (on change, or in reply to a query). */
  layoutObserved(layout: number): OwnershipEffect[] {
    const fx: OwnershipEffect[] = [];
    const wasProgrammer = this.observedLayout === LAYOUT_PROGRAMMER;
    this.observedLayout = layout;
    if (layout === LAYOUT_PROGRAMMER) {
      if (this.desired === 'ours' && !this.conflict) {
        this.retryArmed = false;
        if (!wasProgrammer || !this.inputEnabled) {
          fx.push({ type: 'repaint' });
          if (!this.inputEnabled) {
            this.inputEnabled = true;
            fx.push({ type: 'inputEnabled', enabled: true });
          }
        }
      }
      return this.finish(fx);
    }
    // Not in Programmer mode. While released or in conflict there is nothing to do: input is already
    // gated and the frame cache already invalid; recovery waits for the user.
    if (this.desired !== 'ours' || this.conflict) return this.finish(fx);
    fx.push(...this.gateInput());
    if (wasProgrammer || this.inputEnabled) fx.push({ type: 'cleanupHardwareOwners' });
    fx.push({ type: 'invalidateFrame' });
    if (this.retryArmed) {
      this.retryArmed = false;
      this.conflict = true;
      return this.finish(fx);
    }
    const recent = this.pruned();
    if (recent.length < this.config.maxReentries) {
      recent.push(this.now());
      this.reentryTimes = recent;
      fx.push({ type: 'send', command: 'enterProgrammer' });
    } else {
      this.conflict = true;
    }
    return this.finish(fx);
  }

  // ---- internals ------------------------------------------------------------------------------------

  private status(): OwnershipStatus {
    if (!this.connected) return 'disconnected';
    if (this.conflict) return 'conflict';
    if (this.desired === 'released') return 'released';
    return this.observedLayout === LAYOUT_PROGRAMMER && this.inputEnabled ? 'owned' : 'acquiring';
  }

  private gateInput(): OwnershipEffect[] {
    if (!this.inputEnabled) return [];
    this.inputEnabled = false;
    return [{ type: 'inputEnabled', enabled: false }];
  }

  private pruned(): number[] {
    const cutoff = this.now() - this.config.windowMs;
    return this.reentryTimes.filter((t) => t > cutoff);
  }

  private finish(fx: OwnershipEffect[]): OwnershipEffect[] {
    const status = this.status();
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      fx.push({ type: 'statusChanged', status });
    }
    return fx;
  }
}
