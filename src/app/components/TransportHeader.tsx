import { ticksPerBar } from '@core/sync';
import { Badge } from '@app/components/ui/badge';
import { nextChord, positionMessage, transportLabel } from '@app/lib/transportText';
import type { SessionSnapshot } from '@app/state/sessionController';

export function TransportHeader({ snap }: { readonly snap: SessionSnapshot }) {
  const pos = snap.transport.position;
  const perBar = ticksPerBar(snap.sheet.meter);
  const progress = pos ? pos.tickInBar / perBar : 0;
  const message = positionMessage(snap);
  const next = nextChord(snap);
  const state = snap.transport.state;
  const variant = state === 'playing' ? 'default' : state === 'stopped' ? 'secondary' : 'destructive';

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="transport-header">
      <Badge variant={variant} data-testid="status-transport">
        {transportLabel(snap)}
      </Badge>
      <span className="font-mono text-sm tabular-nums" data-testid="position">
        {pos ? `${String(pos.liveBar)}.${String(pos.beat)}` : '—'}
      </span>
      <span className="font-mono text-xs text-muted-foreground" data-testid="tempo">
        {snap.tempo ? `${snap.tempo.toFixed(1)} bpm` : '— bpm'}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-xs uppercase text-muted-foreground">Now</span>
        <span className="text-lg font-semibold" data-testid="now-chord">
          {snap.active.chordSymbol ?? (snap.active.barIndex === null ? '—' : 'N.C.')}
        </span>
        {snap.active.keyText && (
          <span className="text-xs text-muted-foreground">in {snap.active.keyText}</span>
        )}
        <span className="ml-2 text-xs uppercase text-muted-foreground">Next</span>
        <span className="text-sm" data-testid="next-chord">
          {next ?? '—'}
        </span>
      </div>
      {message && (
        <Badge variant="outline" data-testid="position-message">
          {message}
        </Badge>
      )}
      {state === 'playing' && (
        <div className="h-1 w-24 overflow-hidden rounded bg-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-75"
            style={{ width: `${String(Math.round(progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}
