import { useEffect, useRef } from 'react';
import { resolve, type Bar, type ResolvedBar } from '@core/sheet';
import { ticksPerBar } from '@core/sync';
import { formatKey } from '@core/theory';
import { Button } from '@app/components/ui/button';
import { cn } from '@app/lib/utils';
import type { SessionSnapshot } from '@app/state/sessionController';

export interface ChartGridProps {
  readonly snap: SessionSnapshot;
  readonly onSelect: (index: number) => void;
  readonly onEdit: (index: number) => void;
  readonly onInsert: (index: number) => void;
  readonly onLoadDemo?: () => void;
}

function cellText(
  bar: Bar,
  resolved: ResolvedBar,
): { key: string | null; chords: string; inherited: boolean } {
  const key = bar.key === null ? '{–}' : bar.key !== undefined ? `{${formatKey(bar.key)}}` : null;
  const explicit = bar.chords !== undefined;
  const chords = resolved.chords.length ? resolved.chords.map((c) => c.symbol).join('  ') : 'N.C.';
  return { key, chords, inherited: !explicit };
}

/**
 * The chart (roadmap M6-T4, M6-T6): bars four per row like paper, section labels, inherited values greyed,
 * split cells, the playing bar highlighted with a beat-progress sweep, the editor selection outlined, and
 * auto-scroll to the playing bar. The chart doubles as the performance view (brainstorm §14).
 */
export function ChartGrid({ snap, onSelect, onEdit, onInsert, onLoadDemo }: ChartGridProps) {
  const { sheet, active, transport, selectedBar } = snap;
  const resolved = resolve(sheet);
  const playing = transport.state === 'playing';
  const activeIndex = active.barIndex;
  const progress =
    playing && transport.position ? transport.position.tickInBar / ticksPerBar(sheet.meter) : 0;
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (playing && activeRef.current && typeof activeRef.current.scrollIntoView === 'function') {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex, playing]);

  if (sheet.bars.length === 0) {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
        data-testid="chart-empty"
      >
        <p>This sheet has no bars yet.</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              onInsert(0);
            }}
          >
            Add a bar
          </Button>
          {onLoadDemo && (
            <Button size="sm" variant="secondary" onClick={onLoadDemo}>
              Load the demo chart
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Group into rows of four, starting a new row at every section label.
  const rows: { section?: string; items: number[] }[] = [];
  sheet.bars.forEach((bar, i) => {
    const last = rows[rows.length - 1];
    if (bar.section !== undefined || !last || last.items.length === 4)
      rows.push({ ...(bar.section !== undefined ? { section: bar.section } : {}), items: [i] });
    else last.items.push(i);
  });

  return (
    <div className="grid gap-3" data-testid="chart-grid">
      {rows.map((row, r) => (
        <div key={r} className="grid gap-1">
          {row.section !== undefined && (
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {row.section}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {row.items.map((i) => {
              const bar = sheet.bars[i];
              const res = resolved[i];
              if (!bar || !res) return null;
              const text = cellText(bar, res);
              const isActive = activeIndex === i;
              const isSelected = !playing && selectedBar === i + 1;
              const split = res.chords.length === 2;
              return (
                <button
                  key={i}
                  type="button"
                  ref={isActive ? activeRef : undefined}
                  data-testid={`bar-${String(i + 1)}`}
                  data-active={isActive}
                  data-selected={isSelected}
                  className={cn(
                    'relative flex min-h-16 flex-col items-start justify-between overflow-hidden rounded-md border px-2 py-1 text-left transition-colors',
                    isActive ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                    isSelected && 'ring-2 ring-ring',
                  )}
                  onClick={() => {
                    onSelect(i);
                  }}
                  onDoubleClick={() => {
                    onEdit(i);
                  }}
                >
                  {isActive && playing && (
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20"
                      style={{ width: `${String(Math.round(progress * 100))}%` }}
                      aria-hidden
                    />
                  )}
                  <span className="relative flex w-full items-center justify-between text-[10px] text-muted-foreground">
                    <span>{i + 1}</span>
                    {text.key && <span className="font-mono">{text.key}</span>}
                  </span>
                  <span
                    className={cn(
                      'relative font-mono text-sm',
                      text.inherited && 'text-muted-foreground/70',
                      split && 'tracking-wide',
                    )}
                    data-inherited={text.inherited}
                  >
                    {text.chords}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onInsert(sheet.bars.length);
          }}
        >
          Add bar
        </Button>
        <span className="self-center text-xs text-muted-foreground">
          Click a bar to select it, double-click to edit.
        </span>
      </div>
    </div>
  );
}
