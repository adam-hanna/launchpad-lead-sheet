import { LAYOUT_PRESETS, MAX_ROW_OFFSET, MIN_ROW_OFFSET, presetName, type LayoutPreset } from '@core/grid';
import { CUSTOM_THEME_NAME, MAX_OCTAVE_SHIFT, MIN_OCTAVE_SHIFT, THEMES } from '@core/lighting';
import { MAX_CLOCK_OFFSET_TICKS } from '@core/settings';
import { ThemeEditor } from '@app/components/ThemeEditor';
import { midiNoteName } from '@core/theory';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Switch } from '@app/components/ui/switch';
import type { SessionController, SessionSnapshot } from '@app/state/sessionController';

function Row({
  label,
  children,
  htmlFor,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly htmlFor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
  testId,
  label,
}: {
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (v: T) => void;
  readonly testId: string;
  readonly label: string;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant={o.value === value ? 'default' : 'outline'}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            onChange(o.value);
          }}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** Settings panel (roadmap M6-T9, M6-T10): everything in plan §2 "Settings" plus theme selection. */
export function SettingsPanel({
  snap,
  controller,
}: {
  readonly snap: SessionSnapshot;
  readonly controller: SessionController;
}) {
  const s = snap.settings;
  const preset = presetName(s.layout);
  return (
    <div className="grid gap-1" data-testid="settings-panel">
      <Row label="Show">
        <Choice
          label="Show"
          testId="display-mode"
          value={s.displayMode}
          options={[
            { value: 'key', label: 'Key' },
            { value: 'chord', label: 'Chord' },
            { value: 'keyChord', label: 'Key + chord' },
          ]}
          onChange={(displayMode) => {
            controller.updateSettings({ displayMode });
          }}
        />
      </Row>
      <Row label="Out-of-key pads" htmlFor="dim">
        <span className="text-xs text-muted-foreground">{s.offStyle === 'dim' ? 'dim' : 'dark'}</span>
        <Switch
          id="dim"
          checked={s.offStyle === 'dim'}
          onCheckedChange={(v) => {
            controller.updateSettings({ offStyle: v ? 'dim' : 'dark' });
          }}
        />
      </Row>
      <Row label="Root flashes on the beat" htmlFor="flash">
        <Switch
          id="flash"
          checked={s.rootFlash}
          onCheckedChange={(rootFlash) => {
            controller.updateSettings({ rootFlash });
          }}
        />
      </Row>
      <Row label="Grid">
        <Choice
          label="Grid"
          testId="grid-mode"
          value={s.relative ? 'relative' : 'absolute'}
          options={[
            { value: 'absolute', label: 'Fixed pitches' },
            { value: 'relative', label: 'Fixed shape' },
          ]}
          onChange={(v) => {
            controller.updateSettings({ relative: v === 'relative' });
          }}
        />
      </Row>
      {s.relative && (
        <Row label="Shape anchored on">
          <Choice
            label="Shape anchored on"
            testId="anchor"
            value={s.anchor}
            options={[
              { value: 'chordRoot', label: 'Chord root' },
              { value: 'keyRoot', label: 'Key root' },
            ]}
            onChange={(anchor) => {
              controller.updateSettings({ anchor });
            }}
          />
        </Row>
      )}
      <Row label="Layout">
        <Choice
          label="Layout"
          testId="layout"
          value={preset}
          options={[
            { value: 'fourths', label: 'Fourths' },
            { value: 'thirds', label: 'Thirds' },
            { value: 'sequential', label: 'Sequential' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(p: LayoutPreset | 'custom') => {
            if (p !== 'custom')
              controller.updateSettings({
                layout: { ...s.layout, rowOffset: LAYOUT_PRESETS[p] },
              });
            else controller.updateSettings({ layout: { ...s.layout, rowOffset: 7 } });
          }}
        />
      </Row>
      <Row label="Row offset (semitones)" htmlFor="rowOffset">
        <Input
          id="rowOffset"
          type="number"
          className="w-20"
          min={MIN_ROW_OFFSET}
          max={MAX_ROW_OFFSET}
          value={s.layout.rowOffset}
          onChange={(e) => {
            const v = Math.max(
              MIN_ROW_OFFSET,
              Math.min(MAX_ROW_OFFSET, Number(e.target.value) || MIN_ROW_OFFSET),
            );
            controller.updateSettings({ layout: { ...s.layout, rowOffset: v } });
          }}
        />
      </Row>
      <Row label="Bottom-left note" htmlFor="baseNote">
        <span className="text-xs text-muted-foreground">{midiNoteName(s.layout.baseNote)}</span>
        <Input
          id="baseNote"
          type="number"
          className="w-20"
          min={0}
          max={127}
          value={s.layout.baseNote}
          onChange={(e) => {
            const v = Math.max(0, Math.min(127, Number(e.target.value) || 0));
            controller.updateSettings({ layout: { ...s.layout, baseNote: v } });
          }}
        />
      </Row>
      <Row label="Octave">
        <Button
          size="sm"
          variant="outline"
          aria-label="Octave down"
          disabled={s.octaveShift <= MIN_OCTAVE_SHIFT}
          onClick={() => {
            controller.updateSettings({ octaveShift: s.octaveShift - 1 });
          }}
        >
          −
        </Button>
        <span className="w-8 text-center text-sm tabular-nums" data-testid="octave-shift">
          {s.octaveShift > 0 ? `+${String(s.octaveShift)}` : String(s.octaveShift)}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label="Octave up"
          disabled={s.octaveShift >= MAX_OCTAVE_SHIFT}
          onClick={() => {
            controller.updateSettings({ octaveShift: s.octaveShift + 1 });
          }}
        >
          +
        </Button>
      </Row>
      <Row label="After the last bar">
        <Choice
          label="After the last bar"
          testId="past-end"
          value={s.pastEnd}
          options={[
            { value: 'sustain', label: 'Hold last chord' },
            { value: 'repeat', label: 'Repeat last bar' },
            { value: 'dark', label: 'Go dark' },
          ]}
          onChange={(pastEnd) => {
            controller.updateSettings({ pastEnd });
          }}
        />
      </Row>
      <Row label="MIDI channel to Live" htmlFor="channel">
        <Input
          id="channel"
          type="number"
          className="w-20"
          min={1}
          max={16}
          value={s.notesChannel + 1}
          onChange={(e) => {
            const v = Math.max(1, Math.min(16, Number(e.target.value) || 1));
            controller.updateSettings({ notesChannel: v - 1 });
          }}
        />
      </Row>
      <Row label="Clock offset (ticks)" htmlFor="clockOffset">
        <Input
          id="clockOffset"
          type="number"
          className="w-20"
          min={-MAX_CLOCK_OFFSET_TICKS}
          max={MAX_CLOCK_OFFSET_TICKS}
          value={s.clockOffsetTicks}
          onChange={(e) => {
            const v = Math.max(
              -MAX_CLOCK_OFFSET_TICKS,
              Math.min(MAX_CLOCK_OFFSET_TICKS, Number(e.target.value) || 0),
            );
            controller.updateSettings({ clockOffsetTicks: v });
          }}
        />
      </Row>
      <Row label="Preview next change on the last beat" htmlFor="lookAhead">
        <Switch
          id="lookAhead"
          checked={s.lookAhead}
          onCheckedChange={(lookAhead) => {
            controller.updateSettings({ lookAhead });
          }}
        />
      </Row>
      <Row label="Beat on the top buttons" htmlFor="beatIndicator">
        <Switch
          id="beatIndicator"
          checked={s.beatIndicator}
          onCheckedChange={(beatIndicator) => {
            controller.updateSettings({ beatIndicator });
          }}
        />
      </Row>
      <Row label="Theme">
        <Choice
          label="Theme"
          testId="theme"
          value={s.themeName}
          options={[
            ...THEMES.map((t) => ({ value: t.name, label: t.label })),
            { value: CUSTOM_THEME_NAME, label: 'Custom' },
          ]}
          onChange={(themeName) => {
            controller.updateSettings({ themeName });
          }}
        />
      </Row>
      {s.themeName === CUSTOM_THEME_NAME && (
        <ThemeEditor
          theme={s.customTheme}
          onChange={(customTheme) => {
            controller.updateSettings({ customTheme });
          }}
        />
      )}
    </div>
  );
}
