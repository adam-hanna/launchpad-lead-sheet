import { useEffect, useState } from 'react';
import { padIndex, type PadIndex } from '@core/grid';
import { stateAt } from '@core/lighting';
import {
  flashPhaseA,
  ledToCss,
  type VirtualLaunchpad as VirtualDevice,
  type VirtualState,
} from '@adapters/virtual';
import { useVirtualState } from '@app/hooks/useVirtualState';
import { cn } from '@app/lib/utils';

export interface VirtualLaunchpadProps {
  readonly device: VirtualDevice;
  /** Pad size in px. */
  readonly size?: number;
  readonly className?: string;
}

/** Re-render on a 250 ms beat so free-running flash (no clock) animates like the hardware. */
function useFlashPhase(state: VirtualState): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.running) return undefined;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      clearInterval(id);
    };
  }, [state.running]);
  return flashPhaseA(state.clockTicks, state.running, now);
}

const TOP = [91, 92, 93, 94, 95, 96, 97, 98];
const BOTTOM = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * On-screen Launchpad Pro MK3: the 8x8 grid plus the surrounding buttons, lit from the device's frame
 * and pressable with a pointer. Pointer cancel, leave and blur release the pad (plan §4.2).
 */
export function VirtualLaunchpad({ device, size = 36, className }: VirtualLaunchpadProps) {
  const state = useVirtualState(device);
  const flashA = useFlashPhase(state);

  useEffect(() => {
    const releaseAll = () => {
      device.releaseAll();
    };
    window.addEventListener('blur', releaseAll);
    window.addEventListener('pointerup', releaseAll);
    return () => {
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('pointerup', releaseAll);
    };
  }, [device]);

  const cell = (index: PadIndex, kind: 'pad' | 'button') => {
    const css = ledToCss(stateAt(state.frame, index), flashA);
    const pressed = state.pressed.has(index);
    const isPad = kind === 'pad';
    return (
      <button
        key={index}
        type="button"
        data-testid={`${kind}-${String(index)}`}
        data-index={index}
        aria-label={`${kind} ${String(index)}`}
        aria-pressed={isPad ? pressed : undefined}
        className={cn(
          'select-none border border-black/40 transition-[filter] duration-75',
          isPad ? 'rounded-sm' : 'rounded-full scale-75',
          pressed && 'brightness-150 ring-2 ring-white/80',
          css.pulse && 'animate-pulse',
        )}
        style={{ width: size, height: size, background: css.background, touchAction: 'none' }}
        onPointerDown={(e) => {
          e.preventDefault();
          if (isPad) device.press(index, 100);
          else device.pressButton(index);
        }}
        onPointerUp={() => {
          if (isPad) device.release(index);
          else device.releaseButton(index);
        }}
        onPointerLeave={() => {
          if (isPad) device.release(index);
        }}
        onPointerCancel={() => {
          if (isPad) device.release(index);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      />
    );
  };

  const rows = [];
  for (let row = 8; row >= 1; row--) {
    rows.push(
      <div key={row} className="flex gap-1">
        {cell(padIndex(row, 0), 'button')}
        {Array.from({ length: 8 }, (_, c) => cell(padIndex(row, c + 1), 'pad'))}
        {cell(padIndex(row, 9), 'button')}
      </div>,
    );
  }

  return (
    <div
      className={cn('inline-flex flex-col gap-1 rounded-lg bg-neutral-900 p-3 shadow-inner', className)}
      data-testid="virtual-launchpad"
      data-layout={state.layout}
    >
      <div className="flex gap-1">
        <div style={{ width: size, height: size }} />
        {TOP.map((i) => cell(i, 'button'))}
        {cell(99, 'button')}
      </div>
      {rows}
      <div className="flex gap-1">
        <div style={{ width: size, height: size }} />
        {BOTTOM.map((i) => cell(i, 'button'))}
        <div style={{ width: size, height: size }} />
      </div>
    </div>
  );
}
