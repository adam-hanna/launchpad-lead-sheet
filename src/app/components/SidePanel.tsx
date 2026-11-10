import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { SettingsPanel } from '@app/components/SettingsPanel';
import { SetupPanel } from '@app/components/SetupPanel';
import { VirtualLaunchpad } from '@app/components/VirtualLaunchpad';
import type { SessionController, SessionSnapshot } from '@app/state/sessionController';
import type { VirtualLaunchpad as VirtualDevice } from '@adapters/virtual';

export interface SidePanelProps {
  readonly snap: SessionSnapshot;
  readonly controller: SessionController;
  readonly virtual: VirtualDevice;
  /** Extra tabs (the Sheet tab arrives with the editor). */
  readonly extraTabs?: readonly {
    readonly value: string;
    readonly label: string;
    readonly content: React.ReactNode;
  }[];
}

export function SidePanel({ snap, controller, virtual, extraTabs = [] }: SidePanelProps) {
  return (
    <aside className="flex w-96 flex-col gap-4 border-l p-4" data-testid="side-panel">
      <Tabs defaultValue="setup">
        <TabsList className="w-full">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          {extraTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="setup" className="pt-3">
          <SetupPanel snap={snap} controller={controller} />
        </TabsContent>
        {extraTabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-3">
            {t.content}
          </TabsContent>
        ))}
        <TabsContent value="settings" className="pt-3">
          <SettingsPanel snap={snap} controller={controller} />
        </TabsContent>
      </Tabs>
      <div className="mt-auto flex flex-col items-center gap-1">
        <VirtualLaunchpad device={virtual} size={28} />
        <p className="text-xs text-muted-foreground">Mirror of the Launchpad. Click pads to play.</p>
      </div>
    </aside>
  );
}
