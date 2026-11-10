import { useSyncExternalStore } from 'react';
import type { VirtualLaunchpad, VirtualState } from '@adapters/virtual';

/** Subscribe a component to a virtual device's state (the device caches its snapshot per change). */
export function useVirtualState(device: VirtualLaunchpad): VirtualState {
  return useSyncExternalStore(
    (onChange) =>
      device.subscribe(() => {
        onChange();
      }),
    () => device.state(),
    () => device.state(),
  );
}
