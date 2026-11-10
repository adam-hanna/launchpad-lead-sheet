import { createStore, useStore } from 'zustand';
import { WebMidi } from '@adapters/midi';
import { Autosave, SettingsStore, SheetStore, TabLock, defaultKv, type TabRole } from '@adapters/storage';
import { VirtualLaunchpad } from '@adapters/virtual';
import { SessionController, type SessionSnapshot } from './sessionController';

export interface SessionStoreState {
  readonly snapshot: SessionSnapshot;
  readonly tabRole: TabRole | null;
}

/** Bind a controller to a Zustand store; the store mirrors every snapshot the controller emits. */
export function createSessionStore(controller: SessionController, tabRole: TabRole | null = 'owner') {
  const store = createStore<SessionStoreState>(() => ({ snapshot: controller.snapshot(), tabRole }));
  controller.subscribe((snapshot) => {
    store.setState({ snapshot });
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
  const store = createSessionStore(controller, null);
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
