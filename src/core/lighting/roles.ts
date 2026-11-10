import { GRID_PADS, type GridMapping, type PadIndex } from '../grid';
import { chordAt, type ResolvedBar } from '../sheet';
import { keyPitchClasses, toPitchClass, type ChordFunction, type PitchClass } from '../theory';

/** Lighting roles (plan §4.6). `off` means outside the active display mode's membership. */
export type Role =
  'bass' | 'chordRoot' | 'third' | 'fifth' | 'seventh' | 'extension' | 'keyRoot' | 'scale' | 'off';

/** Highest first. A pitch class with several functions takes the highest. */
export const ROLE_PRIORITY: readonly Role[] = [
  'bass',
  'chordRoot',
  'third',
  'fifth',
  'seventh',
  'extension',
  'keyRoot',
  'scale',
];

export type DisplayMode = 'key' | 'chord' | 'keyChord';

const FUNCTION_ROLE: Record<ChordFunction, Role> = {
  bass: 'bass',
  root: 'chordRoot',
  third: 'third',
  fifth: 'fifth',
  seventh: 'seventh',
  extension: 'extension',
};

function rank(role: Role): number {
  const i = ROLE_PRIORITY.indexOf(role);
  return i === -1 ? ROLE_PRIORITY.length : i;
}

/**
 * Role per visible pitch class for a bar half. Membership comes first (key tones, chord tones ∪ bass, or
 * their union), then priority decides collisions: for `C/E`, E is `bass` not `third`; the key root
 * shows `keyRoot` only when it carries no chord role; chord tones outside the key stay visible in
 * `keyChord` mode.
 */
export function pitchClassRoles(
  harmony: ResolvedBar | null,
  half: 0 | 1,
  mode: DisplayMode,
): ReadonlyMap<PitchClass, Role> {
  const out = new Map<PitchClass, Role>();
  if (!harmony) return out;
  const assign = (pc: PitchClass, role: Role) => {
    const cur = out.get(pc);
    if (cur === undefined || rank(role) < rank(cur)) out.set(pc, role);
  };

  if (mode !== 'chord' && harmony.key) {
    for (const pc of keyPitchClasses(harmony.key)) assign(pc, pc === harmony.key.root ? 'keyRoot' : 'scale');
  }
  if (mode !== 'key') {
    const chord = chordAt(harmony, half);
    if (chord) {
      for (const tone of chord.tones) assign(tone.pc, FUNCTION_ROLE[tone.fn]);
      if (chord.bass !== undefined) assign(chord.bass, 'bass');
    }
  }
  return out;
}

/** Role per grid pad for the current mapping; unmapped pads and non-members are `off`. */
export function resolveRoles(
  harmony: ResolvedBar | null,
  half: 0 | 1,
  mapping: GridMapping,
  mode: DisplayMode,
): ReadonlyMap<PadIndex, Role> {
  const byPc = pitchClassRoles(harmony, half, mode);
  const out = new Map<PadIndex, Role>();
  for (const pad of GRID_PADS) {
    const note = mapping.noteAt(pad);
    out.set(pad, note === null ? 'off' : (byPc.get(toPitchClass(note)) ?? 'off'));
  }
  return out;
}
