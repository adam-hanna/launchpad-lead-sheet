import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/components/ui/card';
import { Separator } from '@app/components/ui/separator';
import { DevPage } from '@app/dev/DevPage';
import { getSession } from '@app/state/store';
import { Grid3x3, Settings2, Usb } from 'lucide-react';

/**
 * Application shell. Three regions: a header with transport/status, the chart area, and a side panel
 * for setup and settings. Real content arrives in M6; `?dev` shows the end-to-end developer page.
 */
export function App() {
  const dev = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev');
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <Grid3x3 className="size-5" aria-hidden />
        <h1 className="text-base font-semibold tracking-tight">Launchpad Lead Sheet</h1>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Badge variant="outline" data-testid="status-device">
          <Usb className="size-3" aria-hidden /> No device
        </Badge>
        <Badge variant="outline" data-testid="status-transport">
          Unsynced
        </Badge>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" aria-label="Settings">
            <Settings2 className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      {dev ? (
        <DevPage session={getSession()} />
      ) : (
        <div className="flex flex-1">
          <main className="flex-1 p-4" data-testid="chart-area">
            <Card>
              <CardHeader>
                <CardTitle>Chart</CardTitle>
                <CardDescription>The lead sheet editor renders here.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Empty sheet. Add <code>?dev</code> to the URL for the developer page.
              </CardContent>
            </Card>
          </main>
          <aside className="w-80 border-l p-4" data-testid="side-panel">
            <Card>
              <CardHeader>
                <CardTitle>Setup</CardTitle>
                <CardDescription>MIDI ports, device and Live sync.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" disabled>
                  Connect
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
