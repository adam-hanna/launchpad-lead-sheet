import { useState } from 'react';
import { LAYOUT_PRESETS, type LayoutPreset } from '@core/grid';
import { THEMES } from '@core/lighting';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { VirtualLaunchpad } from '@app/components/VirtualLaunchpad';
import { DEMO_CHART } from '@app/state/demoSheet';
import { useSessionSnapshot, type Session } from '@app/state/store';

/**
 * Developer page (`?dev`): the first end-to-end light-up (roadmap M4-T7). Everything here moves into the
 * real setup panel, editor and settings in M6; the wiring underneath is the production controller.
 */
export function DevPage({ session }: { readonly session: Session }) {
  const snap = useSessionSnapshot(session);
  const { controller } = session;
  const [chart, setChart] = useState(DEMO_CHART);
  const sel = (key: 'lpIn' | 'lpOut' | 'clockIn' | 'notesOut', type: 'input' | 'output') => (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">{key}</span>
      <select
        className="rounded border bg-background px-1 py-0.5"
        value={snap.selection[key] ?? ''}
        onChange={(e) => {
          controller.selectPorts({ [key]: e.target.value || undefined });
        }}
      >
        <option value="">—</option>
        {snap.ports
          .filter((p) => p.type === type)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.state === 'disconnected' ? '(disconnected)' : ''}
            </option>
          ))}
      </select>
    </label>
  );

  const s = snap.settings;
  const pos = snap.transport.position;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              MIDI <Badge variant="outline">{snap.access.kind}</Badge>
              <Badge variant="outline">device: {snap.ownership.status}</Badge>
              <Badge variant="outline">transport: {snap.transport.state}</Badge>
              {snap.lastError && <Badge variant="destructive">{snap.lastError}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void controller.requestAccess();
                }}
              >
                Request MIDI access
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  controller.autodetect();
                }}
              >
                Auto-detect ports
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  controller.enterProgrammer();
                }}
              >
                Enter Programmer
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  controller.restoreLive();
                }}
              >
                Restore Live mode
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  controller.panic();
                }}
              >
                Panic
              </Button>
              <Badge variant="outline">held: {snap.heldNotes.length ? snap.heldNotes.join(' ') : '—'}</Badge>
              {snap.stuck.map((s) => (
                <Badge key={s.port} variant="destructive">
                  stuck on {s.port}: {s.notes.join(' ')}
                </Badge>
              ))}
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {sel('lpIn', 'input')}
              {sel('lpOut', 'output')}
              {sel('clockIn', 'input')}
              {sel('notesOut', 'output')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Transport{' '}
              <span className="font-mono text-muted-foreground">
                {pos
                  ? `${String(pos.liveBar)}.${String(pos.beat)}.${String(pos.tickInBar).padStart(2, '0')}`
                  : '—'}
                {snap.tempo ? ` · ${snap.tempo.toFixed(1)} bpm` : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">{snap.sheet.title}</span> · bar{' '}
              {snap.active.barIndex === null ? '—' : String(snap.active.barIndex + 1)} ({snap.active.status})
              · <b>{snap.active.chordSymbol ?? 'N.C.'}</b>{' '}
              {snap.active.keyText ? `in ${snap.active.keyText}` : ''}
            </div>
            <div className="flex flex-wrap gap-1">
              {snap.sheet.bars.map((_, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={snap.active.barIndex === i ? 'default' : 'outline'}
                  onClick={() => {
                    controller.selectBar(i + 1);
                  }}
                >
                  {String(i + 1)}
                </Button>
              ))}
            </div>
            <textarea
              className="h-32 w-full rounded border bg-background p-2 font-mono text-xs"
              value={chart}
              onChange={(e) => {
                setChart(e.target.value);
              }}
            />
            <div>
              <Button
                size="sm"
                onClick={() => {
                  controller.loadChart(chart);
                }}
              >
                Load chart
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {(['key', 'chord', 'keyChord'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={s.displayMode === m ? 'default' : 'outline'}
                onClick={() => {
                  controller.updateSettings({ displayMode: m });
                }}
              >
                {m}
              </Button>
            ))}
            <Button
              size="sm"
              variant={s.offStyle === 'dim' ? 'default' : 'outline'}
              onClick={() => {
                controller.updateSettings({ offStyle: s.offStyle === 'dim' ? 'dark' : 'dim' });
              }}
            >
              dim off-key
            </Button>
            <Button
              size="sm"
              variant={s.rootFlash ? 'default' : 'outline'}
              onClick={() => {
                controller.updateSettings({ rootFlash: !s.rootFlash });
              }}
            >
              root flash
            </Button>
            <Button
              size="sm"
              variant={s.relative ? 'default' : 'outline'}
              onClick={() => {
                controller.updateSettings({ relative: !s.relative });
              }}
            >
              relative grid
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                controller.updateSettings({ anchor: s.anchor === 'chordRoot' ? 'keyRoot' : 'chordRoot' });
              }}
            >
              anchor: {s.anchor}
            </Button>
            {(Object.keys(LAYOUT_PRESETS) as LayoutPreset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={s.layout.rowOffset === LAYOUT_PRESETS[p] ? 'default' : 'outline'}
                onClick={() => {
                  controller.updateSettings({ layout: { ...s.layout, rowOffset: LAYOUT_PRESETS[p] } });
                }}
              >
                {p}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                controller.updateSettings({ octaveShift: s.octaveShift - 1 });
              }}
            >
              octave −
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                controller.updateSettings({ octaveShift: s.octaveShift + 1 });
              }}
            >
              octave + ({String(s.octaveShift)})
            </Button>
            {THEMES.map((t) => (
              <Button
                key={t.name}
                size="sm"
                variant={s.themeName === t.name ? 'default' : 'outline'}
                onClick={() => {
                  controller.updateSettings({ themeName: t.name });
                }}
              >
                {t.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
      <div>
        <VirtualLaunchpad device={session.virtual} />
        <p className="mt-2 max-w-xs text-xs text-muted-foreground">
          The virtual Launchpad mirrors the hardware frame. Click pads to see press feedback.
        </p>
      </div>
    </div>
  );
}
