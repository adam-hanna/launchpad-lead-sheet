import { DEFAULT_LAYOUT, type AnchorSetting, type Layout } from '@core/grid';
import { WARM_THEME, type DisplayMode, type OffStyle } from '@core/lighting';
import type { PastEndPolicy } from '@core/sheet';

/** User settings that affect lighting and mapping (plan §2, §4.3, §4.7). Persisted separately from sheets in M6. */
export interface Settings {
  readonly displayMode: DisplayMode;
  readonly offStyle: OffStyle;
  readonly themeName: string;
  readonly rootFlash: boolean;
  readonly relative: boolean;
  readonly anchor: AnchorSetting;
  readonly layout: Layout;
  readonly octaveShift: number;
  readonly pastEnd: PastEndPolicy;
  /** 0-based MIDI channel for notes sent to Live. */
  readonly notesChannel: number;
}

export const DEFAULT_SETTINGS: Settings = {
  displayMode: 'keyChord',
  offStyle: 'dark',
  themeName: WARM_THEME.name,
  rootFlash: true,
  relative: false,
  anchor: 'chordRoot',
  layout: DEFAULT_LAYOUT,
  octaveShift: 0,
  pastEnd: 'sustain',
  notesChannel: 0,
};
