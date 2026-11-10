import { Badge } from '@app/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/components/ui/card';
import { Separator } from '@app/components/ui/separator';
import { DegradedStates } from '@app/components/DegradedStates';
import { SidePanel } from '@app/components/SidePanel';
import { TransportHeader } from '@app/components/TransportHeader';
import { DevPage } from '@app/dev/DevPage';
import { getSession, useSessionSnapshot, useTabRole, type Session } from '@app/state/store';
import { Grid3x3, Usb } from 'lucide-react';

function deviceLabel(status: string): string {
  switch (status) {
    case 'owned':
      return 'Launchpad ready';
    case 'acquiring':
      return 'Taking the Launchpad…';
    case 'released':
      return 'Launchpad in Live mode';
    case 'conflict':
      return 'Launchpad conflict';
    default:
      return 'No Launchpad';
  }
}

export function App() {
  const dev = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev');
  const session = getSession();
  return dev ? (
    <div className="min-h-screen bg-background text-foreground">
      <DevPage session={session} />
    </div>
  ) : (
    <Shell session={session} />
  );
}

function Shell({ session }: { readonly session: Session }) {
  const snap = useSessionSnapshot(session);
  const tabRole = useTabRole(session);
  const { controller } = session;
  const saveText =
    snap.save === 'pending'
      ? 'Saving…'
      : snap.save === 'saved'
        ? 'Saved'
        : snap.save === 'error'
          ? 'Save failed'
          : '';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <Grid3x3 className="size-5" aria-hidden />
        <h1 className="text-base font-semibold tracking-tight">Launchpad Lead Sheet</h1>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Badge
          variant={snap.ownership.status === 'owned' ? 'default' : 'outline'}
          data-testid="status-device"
        >
          <Usb className="size-3" aria-hidden /> {deviceLabel(snap.ownership.status)}
        </Badge>
        <TransportHeader snap={snap} />
        <span className="ml-auto text-xs text-muted-foreground" data-testid="save-state">
          {saveText}
        </span>
      </header>

      <div className="flex flex-1">
        <main className="flex flex-1 flex-col gap-4 p-4" data-testid="chart-area">
          <DegradedStates
            snap={snap}
            tabRole={tabRole}
            onTakeOver={() => {
              void session.takeOver();
            }}
            onRetryDevice={() => {
              controller.enterProgrammer();
            }}
          />
          <Card>
            <CardHeader>
              <CardTitle>{snap.sheet.title}</CardTitle>
              <CardDescription>
                {snap.sheet.bars.length} bars · {snap.sheet.meter.numerator}/{snap.sheet.meter.denominator}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The chart editor arrives with the next epic.
            </CardContent>
          </Card>
        </main>
        <SidePanel snap={snap} controller={controller} virtual={session.virtual} />
      </div>
    </div>
  );
}
