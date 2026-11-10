import { createStore, useStore } from 'zustand';
import { WebMidi } from '@adapters/midi';
import { Autosave, SettingsStore, SheetStore, TabLock, defaultKv, type TabRole } from '@adapters/storage';
import { VirtualLaunchpad } from '@adapters/virtual';
import { SessionController, type SessionSnapshot } from './sessionController';

export interface SessionStoreState {
  readonly snapshot: SessionSnapshot;
  readonly tabRole: TabRole | null;
}

/** Decides when a queued UI update runs. The default runs it immediately (tests, passive tabs). */
export type UpdateScheduler = (run: () => void) => void;

export const immediateScheduler: UpdateScheduler = (run) => {
  run();
};

/**
 * Coalesce UI updates to one per animation frame (roadmap M7-T10). The controller emits a snapshot on
 * every MIDI clock tick (48/s at 120 bpm in 4/4); the LEDs are driven synchronously from those, but the
 * React tree only needs the latest snapshot once per frame. In a hidden tab `requestAnimationFrame` does
 * not fire, so the UI simply pauses at no CPU cost while MIDI keeps flowing; the pending update runs when
 * the tab becomes visible again.
 */
export function animationFrameScheduler(
  raf: (cb: () => void) => void = (cb) => {
    requestAnimationFrame(cb);
  },
  onVisible?: (flush: () => void) => void,
): UpdateScheduler {
  let pending: (() => void) | null = null;
  const flush = () => {
    const run = pending;
    pending = null;
    run?.();
  };
  onVisible?.(flush);
  return (run) => {
    const first = pending === null;
    pending = run;
    if (first) raf(flush);
  };
}

/** Bind a controller to a Zustand store; the store mirrors the latest snapshot the controller emitted. */
export function createSessionStore(
  controller: SessionController,
  tabRole: TabRole | null = 'owner',
  schedule: UpdateScheduler = immediateScheduler,
) {
  const store = createStore<SessionStoreState>(() => ({ snapshot: controller.snapshot(), tabRole }));
  controller.subscribe((snapshot) => {
    schedule(() => {
      store.setState({ snapshot });
    });
  });
  return store;
}

export interface Session {
  readonly controller: SessionController;
  readonly virtual: VirtualLaunchpad;
  readonly store: ReturnType<typeof createSessionStore>;
  /** Passive tab: wait for the owner to leave, then take over MIDI (plan §4.2 single tab). */
  takeOver(): Promise<void>;
}

let singleton: Session | null = null;

/** The browser session: created once per page from the real Web MIDI API and browser storage. */
export function getSession(): Session {
  if (singleton) return singleton;
  const virtual = new VirtualLaunchpad();
  const sheets = new SheetStore(defaultKv());
  let controllerRef: SessionController | null = null;
  const autosave = new Autosave(sheets, {
    onSaved: (id) => controllerRef?.onSaved(id),
    onError: (id, e) => controllerRef?.onSaveError(id, e),
  });
  const controller = new SessionController({
    midi: WebMidi.fromNavigator(),
    virtual,
    persistence: { sheets, autosave, settings: new SettingsStore() },
  });
  controllerRef = controller;
  const store = createSessionStore(
    controller,
    null,
    animationFrameScheduler(undefined, (flush) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') flush();
      });
    }),
  );
  const lock = new TabLock();

  const becomeOwner = () => {
    store.setState({ tabRole: 'owner' });
    void controller.openLastOrDemo();
  };
  void lock.acquire().then((role) => {
    if (role === 'owner') becomeOwner();
    else store.setState({ tabRole: 'passive' });
  });
  lock.onChange((role) => {
    store.setState({ tabRole: role });
  });

  window.addEventListener('pagehide', () => {
    void autosave.flush();
    lock.release();
  });

  singleton = {
    controller,
    virtual,
    store,
    takeOver: async () => {
      const role = await lock.waitForOwnership();
      if (role === 'owner') becomeOwner();
    },
  };
  return singleton;
}

export function useSessionSnapshot(session: Session): SessionSnapshot {
  return useStore(session.store, (s) => s.snapshot);
}

export function useTabRole(session: Session): TabRole | null {
  return useStore(session.store, (s) => s.tabRole);
}
