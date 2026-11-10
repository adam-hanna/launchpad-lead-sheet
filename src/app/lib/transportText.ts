import { chordAt, mapLoop, resolve } from '@core/sheet';
import type { SessionSnapshot } from '@app/state/sessionController';

/** Human text per transport state (plan §4.4). */
export function transportLabel(snap: SessionSnapshot): string {
  switch (snap.transport.state) {
    case 'playing':
      return 'Playing';
    case 'stopped':
      return 'Stopped';
    case 'lostClock':
      return 'Clock lost';
    case 'unsynced':
      return snap.transport.clockInputConnected ? 'Waiting for position' : 'Clock input lost';
  }
}

/** Secondary message for the current position (plan §4.4 outside-timeline statuses). */
export function positionMessage(snap: SessionSnapshot): string | null {
  if (snap.sheet.bars.length === 0) return 'Empty sheet';
  if (snap.transport.state === 'unsynced' && snap.transport.clockInputConnected) {
    return 'Press Play or click in the Arrangement to pick up the position';
  }
  switch (snap.active.status) {
    case 'beforeStart':
      return 'Before start';
    case 'pastEnd':
      return 'Past end';
    default:
      return null;
  }
}

/** The chord of the bar after the active one (following the sheet loop), for the "next" readout. */
export function nextChord(snap: SessionSnapshot): string | null {
  const { sheet, active } = snap;
  if (active.barIndex === null || sheet.bars.length === 0) return null;
  const resolved = resolve(sheet);
  const current = resolved[active.barIndex];
  if (active.half === 0 && current?.chords.length === 2) {
    return chordAt(current, 1)?.symbol ?? null;
  }
  const nextBar = mapLoop(active.barIndex + 2, sheet.loop);
  const bar = resolved[nextBar - 1];
  if (!bar) return null;
  return chordAt(bar, 0)?.symbol ?? 'N.C.';
}
