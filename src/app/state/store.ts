import { createStore, useStore } from 'zustand';
import { WebMidi } from '@adapters/midi';
import { VirtualLaunchpad } from '@adapters/virtual';
import { SessionController, type SessionSnapshot } from './sessionController';

export interface SessionStoreState {
  readonly snapshot: SessionSnapshot;
}

/** Bind a controller to a Zustand store; the store mirrors every snapshot the controller emits. */
export function createSessionStore(controller: SessionController) {
  const store = createStore<SessionStoreState>(() => ({ snapshot: controller.snapshot() }));
  controller.subscribe((snapshot) => {
    store.setState({ snapshot });
  });
  return store;
}

export interface Session {
  readonly controller: SessionController;
  readonly virtual: VirtualLaunchpad;
  readonly store: ReturnType<typeof createSessionStore>;
}

let singleton: Session | null = null;

/** The browser session: created once per page from the real Web MIDI API. */
export function getSession(): Session {
  if (!singleton) {
    const virtual = new VirtualLaunchpad();
    const controller = new SessionController({ midi: WebMidi.fromNavigator(), virtual });
    singleton = { controller, virtual, store: createSessionStore(controller) };
  }
  return singleton;
}

export function useSessionSnapshot(session: Session): SessionSnapshot {
  return useStore(session.store, (s) => s.snapshot);
}
