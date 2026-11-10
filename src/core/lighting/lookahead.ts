import type { PadIndex } from '../grid';
import type { Role } from './roles';

/**
 * Look-ahead (roadmap M7-T2): pads whose role will change at the next half-bar or bar boundary. The
 * renderer pulses them during the last beat so the player sees the change coming.
 */
export function changedPads(
  current: ReadonlyMap<PadIndex, Role>,
  next: ReadonlyMap<PadIndex, Role>,
): ReadonlySet<PadIndex> {
  const out = new Set<PadIndex>();
  for (const [pad, role] of next) {
    const now = current.get(pad) ?? 'off';
    if (now !== role && !(now === 'off' && role === 'off')) out.add(pad);
  }
  for (const [pad, role] of current) {
    if (!next.has(pad) && role !== 'off') out.add(pad);
  }
  return out;
}
