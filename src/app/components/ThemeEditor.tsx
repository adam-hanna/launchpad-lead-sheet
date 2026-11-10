import type { ColourRole } from '@core/lighting';
import type { CustomTheme } from '@core/settings';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { hexToRgb127, rgb127ToHex } from '@app/lib/colour';

const ROLE_LABELS: Record<ColourRole, string> = {
  bass: 'Slash bass',
  chordRoot: 'Chord root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  extension: 'Extensions',
  keyRoot: 'Key root',
  scale: 'Scale tone',
  pressed: 'Pressed pad',
  dim: 'Dim (out of key)',
};

/**
 * Per-role colour editor for the custom theme (roadmap M7-T1). Static roles pick any colour; the root
 * flash uses two palette entries because the Pro MK3 flash command is palette-only (plan §4.3).
 */
export function ThemeEditor({
  theme,
  onChange,
}: {
  readonly theme: CustomTheme;
  readonly onChange: (t: CustomTheme) => void;
}) {
  return (
    <div className="grid gap-2" data-testid="theme-editor">
      {(Object.keys(ROLE_LABELS) as ColourRole[]).map((role) => (
        <div key={role} className="flex items-center justify-between gap-2">
          <Label htmlFor={`colour-${role}`} className="text-xs">
            {ROLE_LABELS[role]}
          </Label>
          <input
            id={`colour-${role}`}
            type="color"
            aria-label={ROLE_LABELS[role]}
            className="h-7 w-10 cursor-pointer rounded border bg-transparent"
            value={rgb127ToHex(theme.colours[role])}
            onChange={(e) => {
              onChange({ ...theme, colours: { ...theme.colours, [role]: hexToRgb127(e.target.value) } });
            }}
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Root flash palette (bright / dim)</Label>
        <div className="flex gap-1">
          <Input
            type="number"
            aria-label="Flash bright palette index"
            className="w-16"
            min={0}
            max={127}
            value={theme.rootFlash.a}
            onChange={(e) => {
              onChange({
                ...theme,
                rootFlash: { ...theme.rootFlash, a: Math.max(0, Math.min(127, Number(e.target.value) || 0)) },
              });
            }}
          />
          <Input
            type="number"
            aria-label="Flash dim palette index"
            className="w-16"
            min={0}
            max={127}
            value={theme.rootFlash.b}
            onChange={(e) => {
              onChange({
                ...theme,
                rootFlash: { ...theme.rootFlash, b: Math.max(0, Math.min(127, Number(e.target.value) || 0)) },
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
