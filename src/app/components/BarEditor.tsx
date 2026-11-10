import { useState } from 'react';
import type { Bar, ChordField, Sheet } from '@core/sheet';
import { formatKey } from '@core/theory';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { parseChordField, parseKeyField } from '@app/lib/barFields';
import type { BarPatch } from '@app/state/sessionController';

export interface BarEditorProps {
  readonly sheet: Sheet;
  /** 0-based bar to edit, or null when closed. */
  readonly index: number | null;
  readonly onClose: () => void;
  readonly onApply: (index: number, patch: BarPatch) => void;
  readonly onRemove: (index: number) => void;
  readonly onInsertAfter: (index: number) => void;
}

type KeyMode = 'inherit' | 'clear' | 'set';
type ChordMode = 'inherit' | 'nc' | 'set';

function ModeChoice<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (v: T) => void;
  readonly testId: string;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" data-testid={testId}>
      {options.map(([v, label]) => (
        <Button
          key={v}
          type="button"
          size="sm"
          role="radio"
          aria-checked={v === value}
          variant={v === value ? 'default' : 'outline'}
          onClick={() => {
            onChange(v);
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

/** Dialog for one bar (roadmap M6-T5): key (inherit / clear / set), chords (inherit / N.C. / set), section. */
export function BarEditor({ sheet, index, onClose, onApply, onRemove, onInsertAfter }: BarEditorProps) {
  const bar = index !== null ? sheet.bars[index] : undefined;
  return (
    <Dialog
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent data-testid="bar-editor">
        {index !== null && bar && (
          // Keyed by bar so the form state re-initialises for every bar opened.
          <BarForm
            key={`${sheet.id}:${String(index)}`}
            index={index}
            bar={bar}
            onClose={onClose}
            onApply={onApply}
            onRemove={onRemove}
            onInsertAfter={onInsertAfter}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BarForm({
  index,
  bar,
  onClose,
  onApply,
  onRemove,
  onInsertAfter,
}: {
  readonly index: number;
  readonly bar: Bar;
} & Pick<BarEditorProps, 'onClose' | 'onApply' | 'onRemove' | 'onInsertAfter'>) {
  const [keyMode, setKeyMode] = useState<KeyMode>(
    bar.key === undefined ? 'inherit' : bar.key === null ? 'clear' : 'set',
  );
  const [keyText, setKeyText] = useState(bar.key ? formatKey(bar.key) : '');
  const [chordMode, setChordMode] = useState<ChordMode>(
    bar.chords === undefined ? 'inherit' : bar.chords.length === 0 ? 'nc' : 'set',
  );
  const [chordText, setChordText] = useState(bar.chords?.map((c) => c.symbol).join(' ') ?? '');
  const [section, setSection] = useState(bar.section ?? '');

  const keyResult = keyMode === 'set' ? parseKeyField(keyText) : null;
  const chordResult = chordMode === 'set' ? parseChordField(chordText) : null;
  const keyError = keyResult && 'error' in keyResult ? keyResult.error : null;
  const chordError = chordResult && 'error' in chordResult ? chordResult.error : null;
  const valid = !keyError && !chordError;

  const apply = () => {
    if (!valid) return;
    const key: BarPatch['key'] =
      keyMode === 'inherit'
        ? 'inherit'
        : keyMode === 'clear'
          ? null
          : keyResult && 'key' in keyResult
            ? keyResult.key
            : 'inherit';
    const chords: BarPatch['chords'] =
      chordMode === 'inherit'
        ? 'inherit'
        : chordMode === 'nc'
          ? []
          : chordResult && 'chords' in chordResult
            ? (chordResult.chords as unknown as ChordField)
            : 'inherit';
    onApply(index, { key, chords, section: section.trim() === '' ? null : section });
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bar {index + 1}</DialogTitle>
        <DialogDescription>Leave a field on "inherit" to carry the previous bar's value.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>Key</Label>
          <ModeChoice
            testId="key-mode"
            value={keyMode}
            options={[
              ['inherit', 'Inherit'],
              ['clear', 'No key'],
              ['set', 'Set'],
            ]}
            onChange={setKeyMode}
          />
          {keyMode === 'set' && (
            <>
              <Input
                aria-label="Key"
                placeholder="e.g. G, Em, Bb major, E dorian"
                value={keyText}
                onChange={(e) => {
                  setKeyText(e.target.value);
                }}
              />
              {keyError && (
                <p className="text-xs text-red-500" data-testid="key-error">
                  {keyError}
                </p>
              )}
            </>
          )}
        </div>
        <div className="grid gap-2">
          <Label>Chords</Label>
          <ModeChoice
            testId="chord-mode"
            value={chordMode}
            options={[
              ['inherit', 'Inherit'],
              ['nc', 'N.C.'],
              ['set', 'Set'],
            ]}
            onChange={setChordMode}
          />
          {chordMode === 'set' && (
            <>
              <Input
                aria-label="Chords"
                placeholder="one or two, e.g. Dm7 G7"
                value={chordText}
                onChange={(e) => {
                  setChordText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') apply();
                }}
              />
              {chordError && (
                <p className="text-xs text-red-500" data-testid="chord-error">
                  {chordError}
                </p>
              )}
            </>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="section">Section label (starts a new row)</Label>
          <Input
            id="section"
            placeholder="A, B, Bridge…"
            value={section}
            onChange={(e) => {
              setSection(e.target.value);
            }}
          />
        </div>
      </div>
      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onRemove(index);
              onClose();
            }}
          >
            Delete bar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onInsertAfter(index);
              onClose();
            }}
          >
            Insert bar after
          </Button>
        </div>
        <Button type="button" size="sm" disabled={!valid} onClick={apply} data-testid="apply-bar">
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}
