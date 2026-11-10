import { useEffect, useState } from 'react';
import type { Meter } from '@core/sheet';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { downloadText, readFileText, safeFilename } from '@app/lib/download';
import type { SessionController, SessionSnapshot } from '@app/state/sessionController';
import type { SheetSummary } from '@adapters/storage';

/** Sheet metadata (roadmap M6-T8): title, meter, tempo, origin bar, loop range, validated by the controller. */
export function SheetMetaEditor({
  snap,
  controller,
}: {
  readonly snap: SessionSnapshot;
  readonly controller: SessionController;
}) {
  const { sheet } = snap;
  const [issues, setIssues] = useState<string[]>([]);
  const apply = (patch: Parameters<SessionController['updateMeta']>[0]) => {
    setIssues(controller.updateMeta(patch));
  };
  const num = (v: string, fallback: number) => (v.trim() === '' ? fallback : Number(v));
  return (
    <div className="grid gap-2" data-testid="sheet-meta">
      <div className="grid gap-1">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={sheet.title}
          onChange={(e) => {
            apply({ title: e.target.value });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="meter">Time signature</Label>
          <div className="flex items-center gap-1">
            <Input
              id="meter"
              aria-label="Beats per bar"
              type="number"
              className="w-16"
              min={1}
              max={16}
              value={sheet.meter.numerator}
              onChange={(e) => {
                apply({ meter: { ...sheet.meter, numerator: num(e.target.value, sheet.meter.numerator) } });
              }}
            />
            <span>/</span>
            <select
              aria-label="Beat unit"
              className="rounded border bg-background px-2 py-1 text-sm"
              value={sheet.meter.denominator}
              onChange={(e) => {
                apply({
                  meter: { ...sheet.meter, denominator: Number(e.target.value) as Meter['denominator'] },
                });
              }}
            >
              {[2, 4, 8, 16].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tempo">Tempo note (bpm)</Label>
          <Input
            id="tempo"
            type="number"
            min={1}
            value={sheet.tempoNote ?? ''}
            onChange={(e) => {
              apply({ tempoNote: e.target.value.trim() === '' ? null : Number(e.target.value) });
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="origin">Starts at Live bar</Label>
          <Input
            id="origin"
            type="number"
            min={1}
            value={sheet.originBar}
            onChange={(e) => {
              apply({ originBar: num(e.target.value, sheet.originBar) });
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="loopStart">Loop bars</Label>
          <div className="flex items-center gap-1">
            <Input
              id="loopStart"
              aria-label="Loop start bar"
              type="number"
              className="w-16"
              min={1}
              value={sheet.loop?.startBar ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                apply({
                  loop: v === '' ? null : { startBar: Number(v), endBar: sheet.loop?.endBar ?? Number(v) },
                });
              }}
            />
            <span>–</span>
            <Input
              aria-label="Loop end bar"
              type="number"
              className="w-16"
              min={1}
              value={sheet.loop?.endBar ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                apply({ loop: v === '' ? null : { startBar: sheet.loop?.startBar ?? 1, endBar: Number(v) } });
              }}
            />
          </div>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="text-xs text-red-500" data-testid="meta-issues">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text chart import / export (roadmap M6-T7). */
export function TextChartDialog({
  open,
  onClose,
  controller,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly controller: SessionController;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="text-dialog">
        {open && <TextChartBody controller={controller} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function TextChartBody({
  controller,
  onClose,
}: {
  readonly controller: SessionController;
  readonly onClose: () => void;
}) {
  const [text, setText] = useState(() => controller.exportText());
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Text chart</DialogTitle>
        <DialogDescription>
          Bars between pipes, up to two chords each, <code>{'{G}'}</code> sets a key, <code>N.C.</code> and{' '}
          <code>%</code> as usual. Importing creates a new sheet.
        </DialogDescription>
      </DialogHeader>
      <Textarea
        aria-label="Chart text"
        className="h-64 font-mono text-xs"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      {errors.length > 0 && (
        <ul className="max-h-24 overflow-auto text-xs text-red-500" data-testid="text-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            const r = controller.loadChart(text);
            if (r.ok) onClose();
            else
              setErrors(
                r.errors.map(
                  (e) =>
                    `line ${String(e.line)}${e.bar ? `, bar ${String(e.bar)}` : ''}${e.token ? ` "${e.token}"` : ''}: ${e.message}`,
                ),
              );
          }}
        >
          Import as new sheet
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(text);
          }}
        >
          Copy
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            downloadText(safeFilename(controller.snapshot().sheet.title, 'chart.txt'), text, 'text/plain');
          }}
        >
          Download .txt
        </Button>
      </div>
    </>
  );
}

/** Library (roadmap M6-T12): list, open, new, duplicate, delete, JSON export/import, text chart dialog. */
export function LibraryPanel({
  snap,
  controller,
}: {
  readonly snap: SessionSnapshot;
  readonly controller: SessionController;
}) {
  const [items, setItems] = useState<readonly SheetSummary[]>([]);
  const [textOpen, setTextOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    let alive = true;
    void controller.library().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [controller, snap.sheet, snap.save]);

  return (
    <div className="grid gap-3" data-testid="library-panel">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            controller.newSheet();
          }}
        >
          New
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            controller.duplicateSheet();
          }}
        >
          Duplicate
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setTextOpen(true);
          }}
        >
          Text chart…
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            downloadText(safeFilename(snap.sheet.title, 'json'), controller.exportJson());
          }}
        >
          Export JSON
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs hover:bg-accent">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void readFileText(file).then((text) => controller.importJson(text));
              e.target.value = '';
            }}
          />
        </label>
        {!confirmDelete ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            Delete
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-xs">
            Delete "{snap.sheet.title}"?
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                void controller.deleteSheet(snap.sheet.id);
              }}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirmDelete(false);
              }}
            >
              No
            </Button>
          </span>
        )}
      </div>
      <ul className="grid gap-1" data-testid="library-list">
        {items.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded border px-2 py-1 text-left text-sm hover:bg-accent ${s.id === snap.sheet.id ? 'border-primary' : ''}`}
              aria-current={s.id === snap.sheet.id}
              onClick={() => {
                void controller.openSheet(s.id);
              }}
            >
              <span>{s.title}</span>
              <span className="text-xs text-muted-foreground">
                {s.barCount} bars · {new Date(s.updatedAt).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground">No saved sheets yet.</li>}
      </ul>
      <TextChartDialog
        open={textOpen}
        onClose={() => {
          setTextOpen(false);
        }}
        controller={controller}
      />
    </div>
  );
}
