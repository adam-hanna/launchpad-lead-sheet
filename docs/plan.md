# Launchpad Lead Sheet — Plan

Status: revision 4, for approval (2026-11-09). Revision 1 review: seven P1 and six P2 findings, resolved as
the contracts in §4. Revision 2 review: three P1 and four P2 findings, resolved in §3.2, §4.1–4.4, §4.7–4.11
and §5. Revision 3 review: two P1 wording defects (cleanup must not relinquish ownership; duplicate owner
Note On is idempotent) and three P2 items (state precedence and timer arming, latency pairing, semantic
round-trip), resolved in §4.1, §4.2, §4.4, §4.9 and §5. Distilled from `docs/brainstorm.md`. Once
approved, the roadmap (`docs/roadmap.md`) breaks this into milestones and GitHub issues.

## 1. Goal and product definition

A **browser companion app** that runs alongside Ableton Live on the same Mac. It follows Live's
**Arrangement timeline** over MIDI clock and lights a Launchpad Pro MK3 so that, for the current bar of a
user-written lead sheet, only the pads in the bar's key and chord are lit, colour-coded by function. Pads
play notes into Live through a virtual MIDI bus. Sheets are saved and reloaded.

Supported platform for v1: **macOS** (IAC Driver) and a **Chromium-based browser** (Chrome or Edge, for
Web MIDI with SysEx). Any Live edition. It is not a Live device or plug-in, and it does not use Max for
Live or a Remote Script.

## 2. Scope for v1.0.0

### Must have

- **Device**: connect to the Launchpad Pro MK3 over Web MIDI, enter Programmer mode, restore Live mode on
  request, recover from reconnect and from being kicked out of Programmer mode, per the ownership
  contract (§4.2). Single-tab ownership.
- **Transport**: follow Live via MIDI clock, Start/Continue/Stop and Song Position Pointer on an IAC bus;
  derive bar, beat and tick for a global meter (§4.8); sheet origin bar and sheet loop range (§4.4).
- **Sheet**: title, meter, tempo note, origin bar, loop range, flat list of bars with optional section
  labels. Each bar: key (inherit / explicit / cleared), chords (inherit / one / two split half-bar /
  N.C.), per §4.5.
- **Chords**: bounded chord-symbol grammar (§4.9) with user spelling preserved.
- **Lighting**: membership-by-mode plus priority (§4.6); display modes Key / Chord / Key+Chord;
  out-of-mode dark (setting: dim); root flashes on the beat via hardware flash with clock forwarded to
  the device, opt-out; semantic LED state model (§4.3).
- **Grid**: Fourths default; Thirds, Sequential, custom row offset; base note and octave shift via side
  buttons with LED feedback; Absolute vs Relative grid, relative anchor chord root (setting: key root),
  per §4.7.
- **Routing**: pad → note → IAC notes bus with note ownership and duplicate policy (§4.1), velocity,
  polyphonic and channel pressure (§4.10), held-note safety across any mapping change, Panic.
- **Press feedback** lighting every pad that currently maps to a held note.
- **Editor**: bars 4 per row, click to edit, text chart import/export (§4.9), current-bar highlight with
  beat progress and auto-scroll, now/next header, transport state indicator (§4.4 states).
- **Virtual Launchpad** on screen mirroring semantic LED state (including flash intent) and clickable.
- **Persistence**: autosave, sheet library, validated JSON export/import (§4.11), settings saved
  separately.
- **Themes**: two built-in (warm-over-cool default, pink/red/orange), selectable. Flashing roles use
  palette colours (§4.3).
- **Setup**: port pickers with auto-detect, status indicators, unsupported-browser and permission-denied
  states, Live setup guide.
- **Delivery**: deployed to GitHub Pages from `main`; runnable locally with one command.

### Should have (drop if the date is at risk)

- Per-role colour editor for themes (flashing roles pick from the palette).
- Light the same pitch class in other octaves on press (option).
- Look-ahead flash of pads that change in the next bar during the last beat.
- Beat / bar-in-phrase indicator on the top button row.
- Clock offset (± ticks) setting.
- Meter-aware software flash fallback for compound meters (§4.8).

### Won't have in v1.0.0 (tracked for later)

- Following Session-view clip launches positionally (no clip identity in clock/SPP); session-mode auto
  hand-back; more than two chords per bar; uneven splits; repeats and endings; per-section meters;
  standalone metronome; Tauri shell, virtual ports, Ableton Link; Mini MK3 / X; URL sharing; cloud
  sync; chord-tone drills; ChordPro/MusicXML import; Windows/Linux.

## 3. Architecture

Single Vite + React + TypeScript app. Domain logic is framework-free in `src/core`; anything touching
the browser or hardware is an adapter behind an interface; React only renders state.

```
src/
  core/                 pure TS, no DOM, unit-tested
    theory/             pitch classes, scales, chord grammar + parser, chord → tones with functions
    sheet/              Sheet/Bar types, inherit/explicit/clear, schema + validation, text chart, resolve()
    sync/               ClockEngine: bytes → TransportState + Position; replayable from recorded traces
    grid/               layouts, pad ⇄ note mapping, absolute/relative, octave shift
    lighting/           semantic LedState per LED, role resolution, themes, frame diff → device specs
    routing/            NoteOwnership table, duplicate policy, pressure routing, panic, press feedback
  adapters/
    midi/               Web MIDI access, port discovery, device inquiry, hot-plug, permission states
    launchpad/          Pro MK3 driver: mode control, SysEx frame writer, input decode, clock forwarding
    virtual/            on-screen Launchpad implementing the same LaunchpadPort interface
    storage/            IndexedDB (sheets), localStorage (settings), file export/import, tab lock
  app/                  React: setup, editor, settings, library, performance header
    state/              Zustand stores wiring core + adapters
    components/         shadcn/ui-based components, chart grid, virtual Launchpad
docs/                   brainstorm, plan, roadmap, adr/, live-setup.md, launchpad-protocol.md,
                        chord-grammar.md, hardware-checklist.md, spikes/ (traces + results)
```

### 3.1 Core interfaces (sketch; the contracts in §4 are normative)

```ts
// theory
type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
interface Key {
  root: PitchClass;
  scale: ScaleType;
}
type ChordFunction = 'root' | 'third' | 'fifth' | 'seventh' | 'extension' | 'bass';
interface Chord {
  symbol: string /* user spelling, authoritative */;
  root: PitchClass;
  bass?: PitchClass;
  tones: Array<{ pc: PitchClass; fn: ChordFunction }>; /* derived, never stored */
}

// sheet
type Inherit = undefined; // field absent → inherit from previous bar
type KeyField = Inherit | Key | null; // null → cleared (no key)
type ChordField = Inherit | [Chord] | [Chord, Chord] | []; // [] → N.C.
interface Bar {
  key?: KeyField;
  chords?: ChordField;
  section?: string;
}
interface Meter {
  numerator: number /* 1..16 */;
  denominator: 2 | 4 | 8 | 16;
}
interface Sheet {
  schemaVersion: 1;
  id: string;
  title: string;
  meter: Meter;
  tempoNote?: number;
  originBar: number /* Live bar where sheet bar 1 starts; default 1 */;
  loop?: { startBar: number; endBar: number } /* 1-based, inclusive */;
  bars: Bar[];
}
interface ResolvedBar {
  key: Key | null;
  chords: [Chord] | [Chord, Chord] | [];
}
// resolve(sheet): ResolvedBar[]  — see §4.5

// sync
type TransportState = 'unsynced' | 'playing' | 'stopped' | 'lostClock';
interface Position {
  liveBar: number;
  beat: number;
  tickInBar: number;
  sheetBar: number | null; /* null = outside sheet */
}

// grid
interface Layout {
  rowOffset: number;
  baseNote: number;
}
interface GridMapping {
  noteAt(pad: PadIndex): MidiNote | null;
  padsFor(note: MidiNote): PadIndex[];
}

// lighting
type LedState =
  | { kind: 'off' }
  | { kind: 'rgb'; rgb: RGB }
  | { kind: 'palette'; index: number }
  | { kind: 'flash'; a: number; b: number }
  | { kind: 'pulse'; index: number };
type Role =
  | 'bass'
  | 'chordRoot'
  | 'third'
  | 'fifth'
  | 'seventh'
  | 'extension'
  | 'keyRoot'
  | 'scale'
  | 'off'
  | 'pressed';
interface Theme {
  name: string;
  colours: Record<Role, RGB | { palette: number }>;
  rootFlash?: { a: number; b: number };
}
type Frame = LedState[106];
// resolveRoles(resolvedBar, half, mapping, displayMode, offStyle) → Role per pad   (§4.6)
// render(roles, theme, pressedNotes, mapping, transport) → Frame                 (§4.3)
// diff(prev, next) → LedSpec[]  (one SysEx)

// routing
interface NoteOwner {
  source: 'hw' | 'virtual';
  pad: PadIndex;
}
interface OwnedNote {
  port: string;
  channel: number;
  note: MidiNote;
  velocity: number;
}
// NoteOwnership: Map<ownerKey, OwnedNote> + refcount per (port, channel, note)        (§4.1)

// hardware
interface LaunchpadPort {
  send(specs: LedSpec[]): void;
  forwardClock(byte: number): void;
  onPad(cb: (pad: PadIndex, velocity: number) => void): Unsub;
  onPolyPressure(cb: (pad: PadIndex, value: number) => void): Unsub;
  onChannelPressure(cb: (value: number) => void): Unsub;
  onLayoutChanged(cb: (layout: number) => void): Unsub;
  enterProgrammerMode(): void;
  restoreLiveMode(): void;
}
```

### 3.2 Key flows

**Connect.** Acquire the tab lock (§4.2). Enumerate Web MIDI ports (user gesture, SysEx) → device inquiry
→ pick `LPProMK3 MIDI` in/out → set desired ownership = ours → **invalidate the device-frame cache** →
send Programmer mode → query the layout and wait for the reply confirming Programmer (ADR-0004) → send a **complete frame** (§4.3) → only
then accept pad input and resume incremental diffs. Pick IAC clock input and notes output by remembered
name. Forward clock bytes to the Launchpad out. Transport starts with an invalid position (§4.4).

**Render.** Rendering is driven by **dependency changes**, not only by bar boundaries (§4.3). Clock byte →
ClockEngine → transport state + position. Whenever the active resolved harmony (bar or half-bar), the
mapping, the transport state, the editor selection while not playing, a display/theme setting, or
pressed ownership changes: `resolve(sheet)` → rebuild mapping if relative (§4.7) → resolve roles →
render frame → diff against the device cache → one SysEx. Beat changes within a half-bar update only the
UI; hardware flash carries the pulse.

**Pad press.** Launchpad note in → `mapping.noteAt(pad)` → NoteOwnership add (§4.1) → Note On to the
IAC notes bus if first owner → press feedback on `mapping.padsFor(note)`. Release → look up the owner's
recorded note → Note Off if last owner → repaint. Pressure per §4.10.

**Edit.** Editor mutates the Sheet store → validation → debounced autosave (§4.11) → re-resolve; if the
**resolved** value of the active bar changed (including edits to an earlier bar that the active bar
inherits from), recompute mapping + lighting immediately.

**Stop.** Transport `stopped`; held notes are **kept** (you may hold a chord while stopped); frame shows
the editor-selected bar; root flash becomes static (§4.3).

### 3.3 Live setup (`docs/live-setup.md`, with screenshots)

1. Audio MIDI Setup → IAC Driver → enable; create buses `LS Clock` and `LS Notes`.
2. Live → Preferences → Link/Tempo/MIDI: `LS Clock` output **Sync On**, MIDI Clock Type **Song**.
   `LS Notes` input **Track On**. The `LPProMK3 MIDI` input must have **Track Off** so raw Programmer-mode
   pad indices never reach an instrument.
3. A MIDI track with input **`LS Notes` only** (not "All Ins"), monitoring In or Auto, armed, with an
   instrument.
4. Launchpad control surface in Live: recommendation comes from spike S1.

## 4. Contracts

Each contract resolves a review finding (noted in brackets) and has acceptance examples that become tests.

### 4.1 Note ownership and duplicates [P1-1]

- An **owner** is `(source, pad)` where source is the hardware Launchpad or the virtual Launchpad. At Note
  On the owner records the **destination** `(port, channel, note, velocity)` as it was at press time.
  Later changes to layout, octave, relative anchor, output port or channel do not alter recorded owners.
- A **refcount** per destination `(port, channel, note)` decides what is sent: the **first** owner sends
  Note On (with its velocity); additional owners of the same destination send **nothing** (no retrigger);
  the **last** release sends Note Off. Velocity of later owners is ignored for output.
- Press feedback is derived from the set of all owned notes: a pad lights `pressed` iff the current
  mapping maps it to any owned note. Releasing one duplicate does not clear another's feedback.
- Panic: Note Off to every recorded destination that is **reachable**, clear the active table, repaint.
  Unreachable destinations go to the pending-cleanup record (§4.2); Panic never claims to have silenced
  them.
- Table hygiene: a Note On for an owner that is already active is an **idempotent no-op**: its recorded
  port, channel, note, velocity and the refcount are all preserved, even if the pad now maps to a
  different note. The record is never silently overwritten; the only way an owner changes note is an
  explicit release followed by a new acquisition, with the corresponding output messages. A release for
  an unknown owner is ignored and never decrements; after Panic, late releases are no-ops.

Acceptance: two hardware pads and one virtual pad hold the same note; change layout; release in any
order → exactly one Note On and one Note Off, the Note Off reaching the original port/channel after the
final release; feedback persists until then. Press C4 → remap the pad to D4 → duplicate Note On for the
same owner → release → exactly one C4 Note On and one C4 Note Off, no D4 messages, all counts zero; the
same with a second owner sharing C4. Unowned release → no Note Off. Panic then release → nothing sent.

### 4.2 Device ownership, recovery and cleanup [P1-2]

- **Desired ownership** (ours / released) is app state, separate from **observed device mode** (from
  layout messages: the reply to a layout query sent after every mode command, and any unsolicited
  layout-change message; ADR-0004). Auto re-entry into Programmer mode happens only while desired =
  ours.
- **Hardware-owner cleanup** is one operation, used by several events: remove every owner whose source
  is the hardware Launchpad from the active table through NoteOwnership, so a destination's Note Off is
  sent only when its refcount reaches zero (a note still owned by the virtual Launchpad keeps sounding).
- **Explicit Restore**: (1) hardware-owner cleanup, (2) set desired = released, (3) send Live mode. It
  stays restored; nothing auto-reacquires.
- **Unexpected mode loss or device disconnect**: hardware-owner cleanup and input gating, but **desired
  ownership is preserved** (stays ours), so bounded recovery or reconnect runs per the policy below.
- **Conflict**: desired stays ours and a `conflict` flag suspends automatic recovery. Manual retry clears
  the flag and attempts re-entry once; success resumes normal operation, failure re-raises the flag.
- **Input gating**: while desired = released, or while the device is not observed in Programmer mode,
  hardware pad and pressure events are **ignored** and never reach NoteOwnership (the device is sending
  Live-mode data, not pad indices). Input resumes only after re-entry is confirmed and the complete
  frame has been sent (§4.3).
- **Bounded recovery**: when desired = ours, `conflict` is clear, and the device reports leaving
  Programmer mode, re-enter at most 3 times within 10 s; then enter the visible **conflict** state
  ("something else is controlling the Launchpad") with a manual retry. No further automatic attempts
  while the flag is set.
- **Single tab**: a Web Lock / BroadcastChannel ensures one tab owns MIDI; other tabs show "active in
  another tab" and never send device commands.
- **Cleanup rules** (all release through NoteOwnership to the recorded destinations):
  - Launchpad disconnected: release all owned hardware notes (the IAC output is still reachable), clear
    pressed state. **Transport and clock validity are unaffected** (§4.4). On reconnect, re-enter if
    desired = ours and send a complete frame.
  - Output port or channel changed: release all owned notes to the **old** destination before switching.
  - Virtual pad pointer cancel / blur / page hide: release that owner.
  - Explicit "Release all" = Panic.
  - **Destination unavailable** (the IAC output disappears while notes are owned): the affected owners
    are removed from the active table and moved to a **pending-cleanup record** keyed by destination,
    holding the Note Offs that could not be sent. Blocking is **scoped to that destination**: other
    outputs stay fully usable. When the destination reappears, its pending Note Offs are sent **before**
    any new Note On to it is accepted; if a cleanup send fails, the record is retained and the
    destination stays blocked (an attempted send is not a successful cleanup). While it is absent, the UI
    lists the stuck notes and tells the user how to silence them in Live (deactivate and re-activate the
    track, or re-select the instrument). Selecting a different output never clears the record, and the
    app never claims the old notes were silenced; sending cleanup is not proof of audible silence.
- **Transport Stop does not release notes.** Only pad release, Panic, or the cleanup rules do.
- **Browser exit** restores Live mode on a best-effort basis (`pagehide`/`beforeunload`); it is not
  guaranteed. Documented manual recovery: the Setup menu is unavailable when Programmer mode was entered
  by SysEx, so **power-cycle or replug the Launchpad** (it always boots into Live mode), or reopen the app
  and press Restore.

Acceptance: hold → Restore → the Note Off precedes the Live-mode SysEx, and nothing auto-reacquires
afterwards. With desired = ours, unplug and replug → Programmer mode is reacquired and a complete frame
is sent without user action. Unexpected mode loss → bounded recovery runs. A note owned by both a
hardware pad and a virtual pad survives hardware-owner cleanup until the virtual owner releases. Hold →
unexpected mode loss → physical release while in Live mode → recovery → no active owner remains and no
stray message was sent.
Unplugging during a held note → Note Off on the IAC bus within 100 ms of the browser's disconnect event.
Output lost → the same output returns → pending Note Offs are sent before the next Note On. Output lost →
a different output is chosen → the stuck notes stay listed. A second tab never seizes the device. After
three failed re-entries the conflict state is shown and no further SysEx is sent.

### 4.3 Semantic LED state and flashing [P1-3]

- A frame is 106 `LedState` values (`off | rgb | palette | flash(a,b) | pulse`). Diffing compares semantic
  state, so a static pink and a flashing pink are different and each change emits the right spec.
- The Pro MK3 flash command takes **two palette entries**, so **flashing roles are palette-based**: the
  theme's `rootFlash` is `{a, b}` palette indices (bright pink / dim pink, chosen in spike S7). Static roles
  may be RGB. The theme editor restricts flashing roles to palette colours.
- Pressed overrides flash: a flashing root that is pressed becomes static `pressed`; on release it returns
  to whatever its **current** role is (which may have changed during the hold).
- **Not playing**: the root is rendered **static**, never flashing, because the device free-runs at
  120 bpm without clock. Flash is only emitted while the transport state is `playing` (§4.4).
- **Render dependencies**: the frame is a function of the active resolved harmony (bar and half, from
  transport position while playing and from the editor selection otherwise), the grid mapping, the
  transport state, display mode, off/dim setting, theme, and pressed ownership. A render runs whenever
  any of these changes, not only on bar boundaries. Examples: Start or Stop within a half-bar toggles
  flash; `lostClock` makes flash static; selecting another bar while stopped repaints; editing an earlier
  bar whose value the active bar inherits repaints.
- **Device-frame cache**: the diff is valid only against what the device is known to display. The cache
  is **invalidated** on disconnect, on observed mode loss, on a failed send, and on tab-lock acquisition.
  After control is (re)acquired, the app sends a **complete frame** (all 106 LEDs, including `off`) and
  only then resumes incremental diffs.
- The virtual Launchpad renders the same intent. Its flash phase comes from the **absolute quarter-note
  tick phase** (authoritative tick count mod 24), not from the displayed beat counter and not reset per
  bar, which matches the hardware's clock-driven flash across odd-meter bar lines (§4.8).
- Gate G7 verifies flash **phase** on Start, Continue (mid-song) and reconnect with clock forwarded.
  If phase is unreliable, the fallback is software flashing driven by the ClockEngine (two static specs per
  quarter note); the semantic model is unchanged either way.

Acceptance: flashing root → pressed white → chord changes during hold → release → pad shows the new
role's state (static or flash) with no extra commands beyond the diff. Start then Stop within one
half-bar → flash then static with no bar change. Reconnect with an unchanged sheet → a complete repaint
including `off` LEDs, even though the cached frame was identical.

### 4.4 Transport, alignment and resynchronisation [P1-4]

- **Timeline**: Live Arrangement bars, 1-based. `sheet.originBar` (default 1) is the Live bar at which
  sheet bar 1 starts. `sheetBar = liveBar - originBar + 1`; before the origin `sheetBar = null`.
- **Meter requirement**: `liveBar` is computed from ticks and SPP using the **sheet's** meter, so Live's
  time signature must equal the sheet meter from Live bar 1 through the end of the sheet. A meter change
  in Live before or inside the sheet makes bar numbers diverge; v1 does not read Live's meter. The setup
  guide states this.
- **Validity, intent and the clock timer are tracked separately.** `positionValid` is true once an
  authoritative position (Start or SPP) has been received and no ticks could have been lost since.
  `playIntent` is play or stop. A **clock timer** is armed by Start, Continue and SPP, re-armed by every
  Clock, disarmed by Stop; firing (500 ms without Clock while armed) sets `timedOut` and clears validity.
- **UI state precedence** (first match wins, so states are mutually exclusive):
  1. `lostClock` if intent = play ∧ `timedOut`
  2. `unsynced` if ¬valid (including clock input lost)
  3. `playing` if intent = play
  4. `stopped` otherwise
- **Transition table**

  | Event      | Effect                                                                                            |
  | ---------- | ------------------------------------------------------------------------------------------------- |
  | Start `FA` | position := 1.1.1, tick 0 pending; valid := true; intent := play; timer armed, `timedOut` cleared |

| SPP `F2` | position := value (16ths → ticks), pending; valid := true; intent unchanged; `timedOut` cleared; timer armed **only if intent = play** (a seek while stopped must not time out into `unsynced`) |
| Continue `FB` | intent := play; valid unchanged (¬valid stays `unsynced` until SPP/Start); timer armed from now, `timedOut` cleared |
| Stop `FC` | intent := stop; position retained; valid unchanged; timer disarmed |
| Clock `F8` | if intent = play: the first Clock after Start/Continue/SPP **occupies** the pending position (the downbeat lands on that Clock, per the MIDI spec), each later Clock advances one tick; timer re-armed. If intent = stop: ignored |
| Timer fires | `timedOut` := true; valid := false → `lostClock` |
| Clock input port disconnected | valid := false; intent := stop; timer disarmed → `unsynced`, "clock input lost" |
| Clock input port reconnected | no change; valid stays false until Start/SPP |
| Launchpad disconnect / reconnect | **no effect** on transport (§4.2) |

**Receiver rule** (ours, fixed): SPP alone never changes play intent; Continue always sets it.
**Sender behaviour** (Live 12 Lite 12.4.16, verified by gate G3 on 2026-11-10, traces in
`docs/spikes/traces/`): the very first Play from 1.1.1 sends `Start` alone; later Plays from the start
marker send `SPP 0, Start`; Play from elsewhere sends `SPP, Stop, SPP, Continue`; a seek while playing
sends `Stop, SPP, Continue`; a seek while **stopped** sends a lone `SPP` (no Continue, so the receiver
rule above holds and nothing plays); every `Stop` is followed by one stray `Clock` a few ms later (ignored
because intent = stop); an Arrangement loop wrap sends **nothing** (ticks keep counting, which is why
the sheet loop is a pure mapping). SPP values follow the click position exactly, so a ruler click that is
not on a bar line starts mid-bar.

- **No wall-clock inference.** Position advances only on received messages, processed in arrival order
  with their Web MIDI timestamps. A burst of buffered clocks after a stall shorter than the timeout is
  applied as counted ticks; after a longer stall validity is already lost and a fresh SPP/Start is
  required before `playing` is shown again.
- **Sheet loop** `{startBar, endBar}` (1-based, inclusive) is a **pure mapping** applied to `sheetBar`:
  `startBar + ((sheetBar - startBar) mod (endBar - startBar + 1))` for `sheetBar > endBar`. It does not
  modify transport position, so SPP and loop never conflict. Matching it to Live's loop brace keeps the
  harmony right even when Live sends nothing on wrap (G3 confirms what Live actually sends).
- **Outside the timeline** (identical whether reached sequentially or by SPP):
  - **Past the end**, no loop: the active harmony is the final **sounding** chord (the second chord of a
    split last bar) plus the final resolved key, treated as a single-chord bar. UI shows "past end".
    Setting _repeat last bar_: replay the last resolved bar every bar instead. Setting _go dark_: guidance
    lighting off; pads remain playable with the last mapping (relative anchor stays on the final sounding
    chord's root).
  - **Before the origin** (`sheetBar = null` while playing): show bar 1's resolved harmony as a count-in;
    relative anchor = bar 1's anchor; UI shows "before start".
- **Editor selection** is separate from transport position and is what is shown whenever the state is
  not `playing`. In `unsynced` the header says "waiting for position: press Play or click in the
  Arrangement". Never silently assume bar 1.
- Gate G3 records raw byte traces for: Start from 1.1.1, Start mid-song, Continue, seek while stopped,
  seek while playing, Arrangement loop wrap, Stop, clock stall, long Stop then Continue, reconnect while
  running. Traces are checked in under `docs/spikes/` and replayed by ClockEngine tests, which also pin
  the tick-zero convention (first Clock after Start/Continue) and the exact half-bar boundary tick.

Acceptance: start at Live bar 17 with `originBar = 9` → sheet bar 9; loop 5–8 → bar 9 shows bar 5.
Clock loss followed only by clock → stays `lostClock`/`unsynced`, never valid; a subsequent SPP clears
`timedOut`, restores validity and the correct chord → `playing` once Clock resumes. Long Stop → Continue
→ no instant timeout from the stale timestamp (timer armed from the Continue). SPP while stopped →
position updates, nothing plays. Continue with ¬valid → `unsynced`, not bar 1.
Launchpad-only reconnect while Live plays → position stays valid. Last bar `[Dm7, G7]` then past the end →
G7 only; seek before the origin → bar 1's harmony.

### 4.5 Sheet inheritance and clearing [P1-5]

- Key and chords inherit **independently**. For each field: absent = inherit the previous bar's
  **resolved** value; `null` key = cleared (no key); `[]` chords = N.C.; otherwise explicit.
- First bar with an inherit field resolves to **cleared / N.C.** and the editor shows a warning.
- After a split bar `[c1, c2]`, an inheriting bar resolves to **`[c2]`** for the whole bar (the last
  sounding chord sustains).
- Inheritance is resolved over the **whole flat sheet** before any loop mapping; a loop starting at bar 5
  uses bar 5's resolved value. Loop passes never change resolution.
- Text tokens: empty cell = inherit; `N.C.` = no chord; `%` = explicit copy of the previous bar's
  **resolved** chords (stored explicitly, so it survives edits above it); key tokens per §4.9.
- Round trip: the stored sheet keeps inherit/explicit/clear exactly; resolution is never written back.

Acceptance: `| Cmaj7 | N.C. | Dm7 G7 |   |` → `[Cmaj7] [] [Dm7,G7] [G7]`; same on every loop pass.
While bar 4 (inheriting) is playing, editing bar 3 to `Em7 A7` changes bar 4's active harmony to A7
immediately (§3.2 Edit).

### 4.6 Lighting membership and priority [P1-6]

- **Membership by display mode** decides which pitch classes are _visible_:
  Key mode = key tones; Chord mode = chord tones ∪ bass; Key+Chord = union of both. Pads outside the
  active membership get `off` (or `dim` if the setting is on). A borrowed chord's tones are therefore
  visible in Key+Chord mode even when outside the key.
- **Role priority** among visible pads (highest first):
  `bass` (slash bass) › `chordRoot` › `third` › `fifth` › `seventh` › `extension` › `keyRoot` › `scale`.
  A pitch class with several functions takes the highest. For `C/E`, E is `bass`, not `third`.
- In Key mode no chord roles apply, so the key root shows `keyRoot` above `scale`.
- `pressed` overrides any role on the pads mapped to owned notes.

Acceptance: Key mode, C major: C = keyRoot, D = scale. Key+Chord, C major with Ab major: Ab = chordRoot,
C = third (`third` outranks `keyRoot`), Eb = fifth (visible although out of key), G = scale, F# = off.

### 4.7 Relative mapping semantics [P2-1]

- One register rule for both modes: `effectiveBase = baseNote + 12 * octaveShift`. The octave buttons
  change `octaveShift` in both modes; `baseNote` is a layout setting. Switching modes never alters either.
- Absolute mode: `noteAt(pad) = effectiveBase + row*rowOffset + col`.
- Relative mode: the anchor pitch class `a` is placed at the bottom-left pad as the **lowest note ≥
  effectiveBase with pitch class `a`**; the rest of the grid follows the layout from there. Anchor
  selection: setting _chord root_ (default) uses the chord root, falling back to the key root when there
  is no chord; setting _key root_ uses the key root, falling back to the chord root when there is no
  key; with neither, `a` = the pitch class of `effectiveBase` (the grid equals absolute mode). The rule
  is deterministic and not path-dependent. Example with `effectiveBase` = C2: anchor B sits at B2 and
  anchor C at C2, so B → C shifts the grid down eleven semitones; with a different base pitch class the
  shift differs.
- Notes outside 0–127 are unmapped: dark and silent.
- Mapping and lighting are recomputed **together** at every bar/half-bar boundary and on any accepted
  edit affecting the current bar. Held notes keep their recorded destination (§4.1); their feedback shows
  on whichever pads currently map to that note, possibly none.
- Chord shapes still vary with chord quality; only the root position is fixed.

Acceptance: shift up one octave, switch Absolute → Relative → Absolute → the register is unchanged.
Key-root anchoring with no key in the bar → anchors to the chord root.

### 4.8 Meter and ticks [P2-2]

- Supported: numerator 1–16, denominator ∈ {2, 4, 8, 16}. `ticksPerBar = 24 * numerator * 4 / denominator`
  (always an integer); `ticksPerBeat = 96 / denominator`; beats are counted in denominator units
  (6/8 shows six beats in v1). Tick 0 is the downbeat.
- The two-chord split is at `ticksPerBar / 2` (always an integer for the supported set); in odd meters it
  falls mid-beat (3/4 → tick 36, mid-way through beat 2). Documented; configurable splits come later.
- Hardware flash follows the device's quarter-note clock (24 ticks) regardless of meter; in 6/8 it flashes
  per quarter, not per dotted quarter. Documented limitation; the meter-aware software flash is a
  should-have. The virtual Launchpad uses the same **absolute quarter-note phase** (tick count mod 24),
  which in 7/16 (42 ticks) crosses bar lines; tests cover consecutive 7/16 bars.

Acceptance: 3/4 → 72 ticks, 24 per beat, split at tick 36 (mid-way through beat 2). 6/8 → 72 ticks,
12 per beat, split at tick 36 (start of beat 4). 7/16 → 42 ticks, 6 per beat, split at tick 21 (mid-way
through beat 4). 4/4 → 96 ticks, split at 48 (start of beat 3).

### 4.9 Chord grammar and text format [P2-3]

- A bounded grammar lives in `docs/chord-grammar.md` (deliverable of the theory milestone) listing every
  accepted token, its pitch classes and functions, aliases, and rejected examples. Families: major/minor/
  dim/aug triads; `6`, `m6`, `6/9`; `7`, `maj7`, `m7`, `mMaj7`, `dim7`, `ø7`/`m7b5`, `aug7`; `sus2`/`sus4`/
  `7sus4`; `add9`/`add11`; `9`/`11`/`13` and their maj/min forms; alterations `b5 #5 b9 #9 #11 b13`
  (bare or parenthesised); slash bass. Suspended 4th/2nd take function `third` (replacement) ; added
  tones and 9/11/13 are `extension`; the 6th is `extension`.
- User spelling (`C#` vs `Db`, `ø` vs `m7b5`) is stored and displayed; pitch classes are derived.
- Text format: bars between `|`, chords separated by whitespace (max two per bar), `N.C.`, `%`, an
  optional key token in braces at the start of a bar (`{G}` major, `{Em}` minor, `{G dorian}`, `{-}`
  to clear), section labels on their own line as `[A]`. Header lines `title:`, `time:`, `tempo:`,
  `origin:`, `loop:`. Errors report bar number and token.
- The text format carries **all musical content** of a v1 sheet (every Sheet field except `id` and
  `schemaVersion`). `id` is library identity, not content: text import always assigns a new id. JSON is
  the full-fidelity interchange format and the only one guaranteed to round-trip future fields.
- Round-trip guarantee is **semantic, not lexical**: import → export → import preserves all musical
  content and every inherit / explicit / clear distinction, chord spelling included; **canonical export
  is stable** (exporting twice yields identical text). Canonical normalisation expands `%` to explicit
  chords, so `| Cmaj7 | % |` and `| Cmaj7 | Cmaj7 |` import to the same sheet and export identically;
  no provenance is stored. The grammar milestone ships a fixture covering tempo, key changes and clears,
  N.C., `%`, inherited bars, a split bar, sections, origin and loop, asserting canonical stability and
  that editing bar 1 afterwards leaves an expanded bar 2 unchanged.

### 4.10 Pressure routing [P2-4]

- Separate events: **polyphonic pressure** (per pad) and **channel pressure** (device-wide), following
  the Launchpad's configured mode.
- Poly pressure is routed through NoteOwnership: pad → owner → recorded `(port, channel, note)`. Pressure
  on an unowned pad is dropped. With several owners of one note, the sent value is the **max** across
  owners, emitted only when it changes.
- Channel pressure is forwarded as channel pressure on the configured output port/channel.
- Both modes are verified on hardware in the feasibility gate (§5).

Acceptance: two owners of one note at pressures 90 and 40 → 90 sent; the 90 owner releases → 40 is
emitted without a new pressure event; a remaining virtual owner (no pressure input) counts as 0.
Pressure on an unowned pad → nothing sent.

### 4.11 Persistence and validation [P2-5]

- All imports are validated (zod schema) **before** replacing anything: integer meter fields in the
  supported set, integer `originBar ≥ 1`, loop with `1 ≤ startBar ≤ endBar ≤ bars.length` (or absent),
  chord symbols parse. An empty sheet (zero bars) is valid: nothing resolves, the UI shows "empty sheet",
  the grid shows no guidance. Unsupported future `schemaVersion` → actionable error, nothing changed.
- The chord **symbol string is authoritative**; tones are derived on load and never stored.
- Import ID collision → import as a copy with a new ID (user may then replace manually).
- Autosave: one pending write per sheet ID; switching sheets flushes the previous. Writes go to a new
  record and then swap, so the last good copy survives a failed write. Storage failure → visible warning,
  in-memory editing continues, and JSON export remains available.

### 4.12 Platform and Live operating mode [P2-6]

- macOS + Chromium-based browser, alongside Live, Arrangement following only (§1). Session clip launching
  is not followed positionally; clock still counts from Start, so sheet loops can approximate a looping
  clip but this is unsupported in v1.
- Setup states: unsupported browser (no Web MIDI) → explanatory page; permission denied → instructions
  to re-enable; ports missing → guided checklist.
- Routing contract in §3.3: notes reach Live only through `LS Notes`; the Launchpad's own MIDI port must
  have Track input off in Live.

## 5. Feasibility gate (spikes) [P1-7]

A throwaway page proves the **whole performance path** before feature work. It covers the brainstorm's
S1–S4 and S7. Results, traces and the exact versions tested (macOS, browser, Live, Launchpad firmware)
are recorded in `docs/spikes/README.md`. A failed gate changes the plan before implementation.

| Gate                         | What is proven                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pass criteria                                                                                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1 Device control            | Programmer mode entry/exit, full-frame SysEx, layout-change detection, pad/button index map (S4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Every pad and button index matches the documented map; exit restores Live mode                                                                                                                                                                   |
| G2 Live coexistence (S1)     | Behaviour with Live's Launchpad control surface enabled and disabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Either coexistence works, or disabling it is documented as required; no fighting                                                                                                                                                                 |
| G3 Clock traces (S2)         | Raw bytes for start, mid-song start, continue, seek, loop wrap, stop, reconnect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Traces captured and interpretable; S2 unknowns answered                                                                                                                                                                                          |
| G4 Round trip                | Mapped pad → IAC → Live instrument **with Live in the foreground** (pass requirement, not a note); held notes across a mapping change; poly and channel pressure; LED repaint during play                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No stuck notes; pressure arrives in both modes; LEDs update while playing with Live in front                                                                                                                                                     |
| G5 Latency / jitter          | **Metric**: arrival of the pad's Note On on `LPProMK3 MIDI` to arrival of the routed Note On on `LS Notes`, both timestamped by one external MIDI monitor (same clock). Not pad motion to sound. **Workload with known expected output**: fixed mapping, non-overlapping fully released presses (no duplicates, so every input has exactly one expected output note/channel); ≥ 1,000 presses; simultaneous LED traffic; Live in the foreground. **Pairing** by expected mapped note/channel in sequence, not by proximity alone. Unmatched inputs, extra outputs and events later than 100 ms are counted and reported separately and stay in the denominator; raw samples kept in `docs/spikes/` | Median ≤ 10 ms, p99 ≤ 20 ms (provisional budgets) **and** zero unmatched or extra events; any anomaly fails the run regardless of percentiles. Harness self-test: a deliberately delayed or dropped event must be reported and must fail the run |
| G6 Endurance and transitions | 20 min each at 60, 120 and 200 bpm in 4/4, plus one run with split-chord bars in 7/16 and 6/8; each run includes explicit Stop, seek, Arrangement loop wrap and a Launchpad reconnect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | No bar drift vs Live's counter; no stuck notes; every transition behaves per §4.4; Live foreground throughout                                                                                                                                    |
| G7 Colour (S7)               | Test pattern of all theme roles plus candidate flash palette pairs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Roles distinguishable at arm's length; palette pinks chosen; flash phase correct on Start/Continue/reconnect                                                                                                                                     |
| G8 Web MIDI lifecycle (S3)   | Permission flow, hot-plug, reconnect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | From the browser's port-available event to confirmed Programmer mode plus complete repaint ≤ 2 s (OS enumeration excluded); device readiness reported separately from transport validity; states surface in UI                                   |

## 6. Quality and tooling

- `pnpm`, Vite, TypeScript strict, ESLint + Prettier, Vitest for `core` (near-complete coverage),
  Playwright smoke test of the editor and virtual Launchpad with a mocked Web MIDI.
- Frames are snapshot-tested as 8x8 role grids plus LED-state kinds (readable diffs).
- ClockEngine tests replay the recorded traces from G3.
- GitHub Actions: lint, typecheck, test, build on every PR; deploy to Pages on push to `main`.
- Conventional commits; semver; `v0.x` until the v1.0.0 must-haves are done.
- Manual hardware checklist in `docs/hardware-checklist.md`, run before each release.

## 7. GitHub process

- Branches: `develop` (integration), `main` (released). Feature branches `feat/<issue>-<slug>`,
  squash-merged into `develop` via PR; `develop` → `main` per release with a tag.
- Milestones = roadmap phases. Every issue has one `area:*` and one `type:*` label.
- Issue templates: feature, bug, spike. PR template: linked issue, test notes, hardware tested y/n.
- Wiki: protocol cheat sheet, Live setup, troubleshooting. `docs/` for durable design docs and ADRs.
- GitHub Projects v2 board with the roadmap view.

## 8. Risks

| Risk                                          | Mitigation                                                       |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Live's control surface fights Programmer mode | G2 before feature work; bounded recovery + conflict state (§4.2) |
| Loop wrap / SPP behaviour                     | G3 traces; sheet loop is a pure mapping (§4.4)                   |
| Hardware flash phase unreliable               | Software flash fallback behind the same LED model (§4.3)         |
| Web MIDI reconnect / permission UX            | G8; adapter states surfaced in UI                                |
| LED colours not distinguishable               | G7; themes editable                                              |
| Scope creep in the editor                     | Must/should/won't list; song structure deferred                  |
| Hardware-only testability                     | Virtual Launchpad, recorded clock traces, mocked Web MIDI        |

## 9. Definition of done for v1.0.0

- All must-haves implemented and tested; every §4 acceptance example is an automated test.
- Hardware checklist passed on the documented versions; gate results recorded.
- A new user follows `docs/live-setup.md` to a working setup in under ten minutes.
- Deployed on Pages from a tagged `main`; release notes published; wiki pages present.

## 10. Order of work (the roadmap formalises this)

1. Feasibility gate G1–G8 with a throwaway page.
2. Core theory, chord grammar doc, sheet model with inherit/clear, text format (pure TS, tested).
3. ClockEngine with trace replay; grid mapping (absolute/relative); lighting model and diff.
4. Adapters: Web MIDI, Pro MK3 driver, virtual Launchpad, tab lock. First end-to-end light-up.
5. NoteOwnership routing, pressure, press feedback, cleanup rules.
6. Editor, settings, library, validated persistence.
7. Themes, polish, docs, Pages deploy, hardware checklist, v1.0.0.
