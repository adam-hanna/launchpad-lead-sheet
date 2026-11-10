import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Label } from '@app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/components/ui/select';
import type { SessionController, SessionSnapshot } from '@app/state/sessionController';
import type { PortSelection } from '@adapters/midi';

const NONE = '__none__';

const PORT_SLOTS: { key: keyof PortSelection; label: string; type: 'input' | 'output'; hint: string }[] = [
  { key: 'lpIn', label: 'Launchpad in', type: 'input', hint: 'LPProMK3 MIDI' },
  { key: 'lpOut', label: 'Launchpad out', type: 'output', hint: 'LPProMK3 MIDI' },
  { key: 'clockIn', label: 'Clock from Live', type: 'input', hint: 'IAC Driver LS Clock' },
  { key: 'notesOut', label: 'Notes to Live', type: 'output', hint: 'IAC Driver LS Notes' },
];

function Light({
  ok,
  label,
  detail,
}: {
  readonly ok: boolean | null;
  readonly label: string;
  readonly detail: string;
}) {
  const colour = ok === null ? 'bg-muted-foreground/40' : ok ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div
      className="flex items-center gap-2 text-sm"
      data-testid={`light-${label.toLowerCase()}`}
      data-ok={String(ok)}
    >
      <span className={`inline-block size-2.5 rounded-full ${colour}`} aria-hidden />
      <span className="w-16">{label}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

/** Setup panel (roadmap M6-T1): MIDI access, port pickers with auto-detect, device control, status lights. */
export function SetupPanel({
  snap,
  controller,
}: {
  readonly snap: SessionSnapshot;
  readonly controller: SessionController;
}) {
  const granted = snap.access.kind === 'granted';
  const o = snap.ownership;
  const deviceOk =
    o.status === 'owned' ? true : o.status === 'disconnected' || o.status === 'conflict' ? false : null;
  const clockOk = !snap.selection.clockIn
    ? null
    : snap.transport.clockInputConnected
      ? snap.transport.state !== 'unsynced' || true
      : false;
  const notesOk = !snap.selection.notesOut
    ? null
    : snap.ports.find((p) => p.id === snap.selection.notesOut)?.state === 'connected';

  return (
    <div className="grid gap-4" data-testid="setup-panel">
      <div className="grid gap-1">
        <Light ok={deviceOk} label="Device" detail={o.status} />
        <Light ok={clockOk} label="Clock" detail={snap.transport.state} />
        <Light ok={notesOk ?? null} label="Notes" detail={snap.selection.notesOut ? 'routed' : 'no output'} />
      </div>

      <div className="flex flex-wrap gap-2">
        {!granted && (
          <Button
            size="sm"
            onClick={() => {
              void controller.requestAccess();
            }}
            disabled={snap.access.kind === 'unsupported' || snap.access.kind === 'requesting'}
          >
            Connect MIDI
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={!granted}
          onClick={() => {
            controller.autodetect();
          }}
        >
          Auto-detect ports
        </Button>
      </div>

      <div className="grid gap-2">
        {PORT_SLOTS.map((slot) => (
          <div key={slot.key} className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{slot.label}</Label>
            <Select
              value={snap.selection[slot.key] ?? NONE}
              onValueChange={(v) => {
                controller.selectPorts({ [slot.key]: v === NONE ? undefined : v });
              }}
              disabled={!granted}
            >
              <SelectTrigger size="sm" aria-label={slot.label} data-testid={`port-${slot.key}`}>
                <SelectValue placeholder={slot.hint} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— none —</SelectItem>
                {snap.ports
                  .filter((p) => p.type === slot.type)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.state === 'disconnected' ? ' (disconnected)' : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!o.connected || o.status === 'owned'}
          onClick={() => {
            controller.enterProgrammer();
          }}
        >
          {o.status === 'conflict' ? 'Retry' : 'Take the Launchpad'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!o.connected || o.desired === 'released'}
          onClick={() => {
            controller.restoreLive();
          }}
        >
          Restore Launchpad
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
        <Button
          size="sm"
          variant="outline"
          disabled={o.status !== 'owned'}
          onClick={() => {
            controller.testPattern();
          }}
        >
          Test pattern
        </Button>
      </div>

      {snap.heldNotes.length > 0 && (
        <Badge variant="outline" data-testid="held-notes">
          Holding {snap.heldNotes.length} note{snap.heldNotes.length === 1 ? '' : 's'}
        </Badge>
      )}
      {snap.stuck.map((s) => (
        <Badge key={s.port} variant="destructive" data-testid="stuck-notes">
          Stuck on {snap.ports.find((p) => p.id === s.port)?.name ?? s.port}: {s.notes.join(' ')}. Silence
          them in Live or replug the output.
        </Badge>
      ))}
    </div>
  );
}
