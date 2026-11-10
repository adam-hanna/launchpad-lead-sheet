import { Button } from '@app/components/ui/button';
import type { SessionSnapshot } from '@app/state/sessionController';
import type { TabRole } from '@adapters/storage';

export interface DegradedStatesProps {
  readonly snap: SessionSnapshot;
  readonly tabRole: TabRole | null;
  readonly onTakeOver: () => void;
  readonly onRetryDevice: () => void;
}

function Banner({
  tone,
  children,
  testId,
}: {
  readonly tone: 'warn' | 'error';
  readonly children: React.ReactNode;
  readonly testId: string;
}) {
  const cls = tone === 'error' ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/50 bg-amber-500/10';
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm ${cls}`}
      role="status"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * Setup and degraded states (plan §4.12, §4.2): unsupported browser, permission denied, missing ports,
 * device conflict, another tab owning MIDI, save errors.
 */
export function DegradedStates({ snap, tabRole, onTakeOver, onRetryDevice }: DegradedStatesProps) {
  const banners: React.ReactNode[] = [];

  if (tabRole === 'passive') {
    banners.push(
      <Banner key="tab" tone="warn" testId="banner-other-tab">
        Another tab is controlling MIDI. This tab is read-only.
        <Button size="sm" variant="outline" onClick={onTakeOver}>
          Take over here
        </Button>
      </Banner>,
    );
  }
  if (snap.access.kind === 'unsupported') {
    banners.push(
      <Banner key="unsupported" tone="error" testId="banner-unsupported">
        This browser has no Web MIDI. Use Chrome or Edge on macOS.
      </Banner>,
    );
  }
  if (snap.access.kind === 'denied') {
    banners.push(
      <Banner key="denied" tone="error" testId="banner-denied">
        MIDI access was denied ({snap.access.reason}). Allow MIDI and SysEx for this site in the browser's
        site settings, then reload.
      </Banner>,
    );
  }
  if (snap.access.kind === 'granted') {
    const missing = (['lpIn', 'lpOut', 'clockIn', 'notesOut'] as const).filter((k) => !snap.selection[k]);
    if (missing.length) {
      banners.push(
        <Banner key="ports" tone="warn" testId="banner-ports">
          Ports missing: {missing.join(', ')}. Plug in the Launchpad and enable the IAC buses "LS Clock" and
          "LS Notes" (see the setup guide), then auto-detect.
        </Banner>,
      );
    }
  }
  if (snap.ownership.status === 'conflict') {
    banners.push(
      <Banner key="conflict" tone="error" testId="banner-conflict">
        Something else keeps taking the Launchpad out of Programmer mode (Live's control surface?). Automatic
        recovery is paused.
        <Button size="sm" variant="outline" onClick={onRetryDevice}>
          Retry
        </Button>
      </Banner>,
    );
  }
  if (snap.save === 'error') {
    banners.push(
      <Banner key="save" tone="error" testId="banner-save">
        {snap.lastError ?? 'Saving failed.'}
      </Banner>,
    );
  }

  if (banners.length === 0) return null;
  return <div className="grid gap-2">{banners}</div>;
}
