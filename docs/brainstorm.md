# Launchpad Lead Sheet — Brainstorm

Status: **closed** (2026-11-09) after two review rounds. Decisions are recorded in §2, §14 and §15; the
plan (`docs/plan.md`) and roadmap are distilled from here. Kept as the record of what was considered.

## 1. The idea in one paragraph

A configurable lead sheet that runs alongside Ableton Live. You enter a key (and/or chord) for each bar,
press play in Live, and the Launchpad Pro MK3 lights **only the pads that are in the current bar's key or
chord**. It is a practice and performance aid: the grid always shows you what is "safe" to play right now,
and changes with the song.

## 2. Decisions already made

| Topic | Decision | Why |
| --- | --- | --- |
| Hardware | Launchpad Pro MK3 only for v1 | It's what we have; Mini MK3 / X share most of the protocol and can follow later |
| Pad layout | Programmer mode, app-defined layout | Only Programmer mode gives full LED control; pads then send grid positions, not notes, so the app must map pads to notes and forward them to Live |
| Host integration | No Max for Live | Requires Suite; too expensive |
| Transport | Follow Live | Live stays the source of truth for tempo, position, start/stop |
| Per-bar content | Key/scale **and** chord(s); user picks what lights up | Both are useful; chord tones over a scale is how real charts are read |
| Persistence | Save/load lead sheets | Never start from scratch |
| Process | Brainstorm → plan → roadmap → build; GitHub issues/PRs/milestones/wiki | Deliberate, trackable |

## 3. Architecture

### 3.1 Recommended: browser app on Web MIDI

```
┌────────────────────┐   MIDI clock / start / stop / SPP   ┌─────────────────────────┐
│    Ableton Live     │ ──────────── IAC "LS Clock" ──────▶ │                         │
│                     │                                     │   Lead Sheet app        │
│  MIDI track input   │ ◀─────────── IAC "LS Notes" ─────── │   (Chrome, Web MIDI)    │
│  = IAC "LS Notes"   │          notes + aftertouch         │                         │
└────────────────────┘                                     └──────┬──────────▲───────┘
                                                        LED msgs  │          │ pad presses
                                                  (notes/SysEx)   ▼          │ (notes/CCs)
                                                           ┌──────────────────────┐
                                                           │ Launchpad Pro MK3    │
                                                           │ port: "LPProMK3 MIDI"│
                                                           └──────────────────────┘
```

- **Zero install.** Chrome + the macOS IAC Driver (built in, enabled once in Audio MIDI Setup).
- **Works with any Live edition** (Intro/Standard/Suite). Live only needs: sync output enabled on one IAC
  bus with MIDI Clock Type = **Song** (so Song Position Pointer is sent), and a MIDI track whose input is
  the other IAC bus.
- **Two IAC buses, not one.** IAC is a loopback: anything written to a bus appears on that bus's input for
  every app, including the sender. Separate buses keep clock and notes from echoing back.
- The Launchpad's **DAW port stays free** for Live's own control surface script. Whether Live's script
  and our Programmer mode coexist peacefully is a spike (see §10).

### 3.2 Alternatives considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Max for Live device | Reads Live transport directly, saves in the Set | Needs Suite / M4L | Rejected |
| Ableton Remote Script (Python) | Deep Live integration | Undocumented API, painful dev loop, fragile across Live versions | Rejected for v1 |
| Native app (Electron/Tauri) | Virtual MIDI ports (no IAC setup), Ableton Link, file system | Packaging, signing, slower iteration | **Later**: wrap the web app in Tauri once it's proven |
| Ableton Link for sync | Sub-ms phase, tempo, start/stop | No browser API; needs native | Only with the Tauri wrapper |
| MIDI clock for sync | Works from the browser today; Live sends SPP in Song mode | 24 ppqn jitter, loop-wrap behaviour unknown | **Chosen** for v1 |

### 3.3 Possible evolution path

1. Browser app (Chrome) with IAC. Proves everything.
2. Installable PWA so it feels like an app window.
3. Optional Tauri shell: creates its own virtual ports, adds Link, bundles a tiny setup wizard.

## 4. Hardware facts that shape the design (Launchpad Pro MK3)

Source: Novation "Launchpad Pro [MK3] Programmer's Reference Manual" (LPP3_prog_ref_guide_200415.pdf).
Worth copying into the wiki as a protocol cheat sheet.

- **Three USB MIDI interfaces**: `LPProMK3 MIDI` (Note/Chord/Custom modes, LED control in Custom and
  Programmer mode), `LPProMK3 DIN` (bridges the 5-pin jacks), `LPProMK3 DAW` (Session mode, used by
  Live's control surface). We talk only to the **MIDI** interface.
- **SysEx header**: `F0 00 20 29 02 0E`. Device inquiry `F0 7E 7F 06 01 F7` identifies the model
  (reply contains `00 20 29 13 01`). Useful for auto-detecting ports and, later, other Launchpad models
  (Mini MK3 uses device byte `0D`, X uses `0C`).
- **Enter Programmer mode**: `F0 00 20 29 02 0E 0E 01 F7`. **Back to Live mode**: `... 0E 00 F7`.
  The device **always boots into Live mode**, so the app must re-enter Programmer mode on every
  connect/reconnect. The device emits a "select layout" message whenever its view changes, so we can
  detect being kicked out (e.g. power cycle) and recover.
- **In Programmer mode, all functionality is disabled** (mode buttons do nothing). Expected and fine,
  but the app must offer a clear "Restore Launchpad" action and restore Live mode on exit.
- **Session mode cannot run at the same time** as Programmer mode on the device; it is one or the other.
  "Keeping Session mode" therefore means **fast hand-back**, not coexistence. Idea for v1.x: an optional
  *auto hand-back* setting that returns the Launchpad to Live mode when Live stops (Session view works
  again) and re-enters Programmer mode when Live starts. Whether Live's control surface script tolerates
  this is spike S1. Nice-to-have, not a v1.0.0 blocker (decided).
- **Pad indices** (from the layout diagram; verify on hardware): grid is `row*10 + col`, `11` bottom-left
  through `88` top-right, sent as **Notes**. Surrounding buttons are **CCs**: top row `91–98`, bottom row
  `1–8`, left column `10,20,…,80`, right column `19,29,…,89`, logo `99`. Pads send Note On with velocity
  0 for Note Off.
- **Lighting by channel**: Note On / CC on channel 1 = static, channel 2 = flashing, channel 3 = pulsing;
  velocity/value = palette index (0 = off, 128-colour palette).
- **Lighting by SysEx** (preferred): `F0 00 20 29 02 0E 03 <spec>… F7`, up to **106 specs in one message**,
  spec = `type, index, data` where type `00` palette, `01` flash (B, A), `02` pulse (palette),
  `03` RGB (3 bytes, 0–127 each). One SysEx can repaint the whole surface at a bar change.
- **Flashing and pulsing are synced to MIDI beat clock received by the device** (falls back to 120 bpm).
  If we forward Live's clock to the Launchpad, hardware pulsing is beat-locked for free. Nice for
  pulsing the root or flashing "change coming".
- **Velocity and aftertouch**: pads are velocity sensitive and send polyphonic or channel aftertouch
  depending on the device setting. We pass both through to Live.
- **No text-scroll SysEx** in the Pro MK3 reference (Mini MK3 / X have one). Any "show the key name"
  feature has to be drawn as pixel art on the 8x8 or shown on screen.

## 5. Music model

### 5.1 What a bar can hold

- **Key/scale**: root (12 pitch classes) + scale type. Starter set: major, natural/harmonic/melodic minor,
  the seven modes, major/minor pentatonic, blues, whole tone, diminished (both), chromatic.
- **Chord(s)**: a chord symbol parsed from text (`Cmaj7`, `F#m7b5`, `G7/B`, `Bbsus4`, `Am(add9)`), giving a
  set of chord tones plus a bass note for slash chords. **v1: up to two chords per bar, split in time**:
  the first chord covers the first half of the bar, the second covers the second half (`| Dm7 G7 |` in 4/4
  = Dm7 on beats 1–2, G7 on beats 3–4). The UI shows a split cell. Uneven splits (3+1) and more than two
  chords come later.
  - *Not* "first time through / second time through": that is a repeat with different endings, which
    belongs to song structure (§5.3). Until that exists, write the repeat out as separate bars.
- **Both**: the normal lead-sheet case. Key gives the scale backdrop, chord gives the strong tones.
- Empty bar = inherit previous (so you only write changes, like a real chart).

### 5.2 Lighting semantics (the heart of the product)

Layered priority, each layer with a configurable colour (see §5.4 for the palette):

1. Chord root / bass note (brightest, maybe pulsing on the beat)
2. Chord tones, coloured **by function** (3rd, 5th, 7th, extensions) so the shape of the chord is visible
3. Scale tones
4. Key root (marker colour, like Live's own Note mode)
5. Everything else: **off** (decided: dark by default; "dim" is an optional setting)

Display modes the user can switch between: **Key only**, **Chord only**, **Key + Chord**.

**Grid reference mode** (decided: a setting):

- **Absolute grid** (default): pads are fixed pitches. When the key/chord changes, the *lights move*.
  Same as a piano: C is always in the same place.
- **Relative grid** ("movable do"): the lights stay put and the *pitches under them move*. The bottom-left
  pad is always the current root, so the root / 3rd / 5th shapes are always in the same place and every
  chord is fingered the same way. Sub-setting: follow the **chord** root or the **key** root. This is a
  per-bar transposition of the pad→note mapping, so it depends on the held-note safety in §6.

### 5.4 Colour palette

Stock Launchpad convention (Live's Note mode and the Launchpad's own Scale mode): **root = pink, in-scale
= blue, out-of-scale = dark**. Keeping that in Key-only mode means zero re-learning.

Proposed default theme, "warm chord over cool scale":

| Role | Colour | Rationale |
| --- | --- | --- |
| Chord root / bass | **Pink**, full brightness | Matches stock Launchpad root colour (user preference) |
| 3rd | **Orange** | Warm family = chord tones; far enough from pink on an LED |
| 5th | **Yellow** | Continues the warm gradient root → 3rd → 5th |
| 7th | **White** | Neutral "colour tone"; distinct from both families |
| Extensions (9, 11, 13) | **Cyan** | Cool but clearly brighter/greener than scale blue |
| Scale tone (not in chord) | **Dim blue** | Stock Launchpad in-scale colour, dimmed so chord tones pop |
| Key root when not a chord tone | **Dim pink** | Keeps the key anchor visible under the chord |
| Pressed pad | **Bright white flash** | We own press feedback in Programmer mode |
| Out of key | Off (or dim grey if "dim" setting is on) | Decided |

Notes:

- The user's suggestion (pink / red / orange for root / 3rd / 5th) is a valid alternative theme. The
  concern is **pink vs red on an RGB LED** reads as nearly the same hue at a glance; the warm gradient
  above skips red for that reason. We keep it as a selectable theme and let hardware testing decide.
- Add **brightness tiers** on top of hue (root brightest, chord tones full, scale dim) so the hierarchy
  survives colour-blindness and bad stage lighting. Offer a colour-blind-safe theme (e.g. pink / white /
  cyan / dim blue).
- Optional **quality-tinted 3rd**: minor 3rd in a different colour than major 3rd (e.g. red vs orange).
  Turns the grid into a chord-quality teacher. Off by default to keep the palette small.
- LEDs are not screens: yellow drifts green, pink drifts purple, dim colours lose hue. Plan a
  **colour-tuning spike** with a test pattern on the actual device and store colours as Launchpad RGB
  (0–127 per channel), not CSS colours. The on-screen virtual Launchpad gets a separate display mapping.
- Themes are just named sets of role → RGB and are user-editable and saved with settings.

Extras to consider:

- **Look-ahead**: during the last beat of a bar, flash the pads that will *change* in the next bar.
- **Beat indicator** on a side button column (4 LEDs for 4/4) and a bar-position readout on screen.
- **Octave markers** on the side buttons, like Live's Note mode.
- **Stopped state**: show the selected bar in the editor so you can practice a bar without transport.
- **Colour themes**: accessible palette with a colour-blind-safe option; brightness control.

### 5.3 Song structure

- v1: flat list of bars with optional section labels (Intro / A / B / Bridge) and a global time signature.
- Later: repeats, 1st/2nd endings, D.S./coda, per-section time signatures. Internally always **unrolled**
  into a flat timeline of bars so the sync engine stays simple.

## 6. Grid layout and note routing

- **Layouts** (selectable): *Fourths* (Live's default: each row is 5 semitones up, the classic "guitar"
  grid), *Thirds*, *Sequential* (rows continue chromatically), *In-key only* (like Launchpad's Scale mode:
  only scale tones get pads). **Decided: Fourths is the default.**
- **Customisation lives in our software, not the Launchpad.** In Programmer mode the device's own Note
  mode settings (scale, root, layout) do nothing; the firmware is out of the loop. Internally every
  chromatic layout is just a **row offset in semitones** (5 = fourths, 4 = thirds, 8 = sequential), so a
  "custom" layout is one number plus a base note. Cheap to expose, so we do.
- **Root/base note** and **octave shift** controls, bound to the up/down side buttons, with LED feedback.
- **Note output**: to the IAC notes bus on a configurable channel. Velocity and aftertouch pass through.
- **Held-note safety**: remember pad→note mapping at press time so a layout/octave/key change mid-hold
  still produces the right Note Off. Provide a **Panic** (all notes off).
- Out-of-key pads still play (they're dark, not disabled). Optional "mute out-of-key pads" practice toggle.
- Latency: pad → Chrome → IAC → Live is well under 10 ms in practice; nothing audio-rate happens in JS.

## 7. Sync engine (following Live)

- Inputs: MIDI Clock `F8` (24 per quarter note), Start `FA`, Continue `FB`, Stop `FC`, Song Position
  Pointer `F2` (in 16th notes).
- Position = SPP (if received) + counted ticks since. Bar/beat derived from time signature.
- Live settings: Sync **on** for the clock IAC bus, MIDI Clock Type = **Song** (sends SPP so starting
  mid-arrangement lands on the right bar). Pattern mode would always start at bar 1.
- **Known unknown**: what Live sends when the Arrangement loop wraps. If it sends nothing, the app will
  drift past the loop. Mitigation: a **loop range in the lead sheet** that the engine wraps on (and that
  the user matches to Live's loop brace). Spike needed.
- Tempo is **derived** (smoothed clock interval) for display only; logic never depends on it.
- Offset control (± ticks) to compensate for perceived LED lag.
- Stopped: engine idles; UI lets you pick a bar manually.
- Nice trick for later: Live's **MIDI Map** can bind Play/Stop/Loop to CCs on the notes bus, so the app
  could offer "loop this section" practice buttons without a Remote Script.

## 8. Leadsheet editor and on-screen UI

- **Chart view**: bars laid out 4 per row like paper. Click a bar to edit key/chord. Inherit-previous
  shown greyed.
- **Text entry**: paste a chart `| Cmaj7 | Am7 | Dm7 G7 | Cmaj7 |` and parse it. Also export back to text.
- **Current-bar indicator** (decided: the chart view is the performance view; no separate big display):
  the playing bar is highlighted in the chart, with a **beat progress fill** sweeping across the cell, the
  chart **auto-scrolls** to keep it in view, and a compact header shows bar:beat plus "now / next" chord.
  On the hardware, the top button row can double as a **beat / bar-in-phrase indicator** (optional).
- **Virtual Launchpad**: an on-screen 8x8 (plus buttons) that mirrors LED state and is clickable to send
  notes. Lets development and demos happen without hardware, and doubles as a visual aid.
- **Setup panel**: port pickers with auto-detect (device inquiry), status lights for clock/Launchpad/notes,
  Enter/Exit Programmer mode, Panic, test pattern.
- **Settings**: layout, colours, display mode, out-of-key behaviour, look-ahead, MIDI channel.

## 9. Persistence (sessions)

- **Autosave** the working sheet and settings locally (IndexedDB; localStorage for small prefs).
- **Library**: list of saved sheets with title, key, tempo note, last edited.
- **Export/import JSON** with a versioned schema (`schemaVersion`), plus **text chart** export. Chrome's
  File System Access API can save straight to disk; fallback is download/upload.
- Keep sheets and device settings separate so a sheet is portable between setups.
- Later: share via URL hash, folders/tags, cloud sync (out of scope for now).

## 10. Risks, unknowns, and spikes

| # | Unknown | How we find out |
| --- | --- | --- |
| S1 | Does Live's Launchpad control surface fight Programmer mode (e.g. reset the device, hog LEDs)? | Spike: enter Programmer mode with Live running, with the control surface on and off |
| S2 | What does Live send on Arrangement loop wrap, on Continue, on jumping the playhead? | Spike: log raw clock/SPP from Live under each case |
| S3 | Chrome Web MIDI: SysEx permission UX, hot-plug/reconnect reliability, timestamp precision | Spike alongside S1 |
| S4 | Pad/button index map matches the manual's diagram | Hardware check |
| S5 | IAC setup friction for other users | Document with screenshots; revisit with Tauri |
| S6 | GitHub Pages from the **private** repo (paid plan: allowed). The site URL is still publicly reachable unless on Enterprise; acceptable since the app holds no secrets and all data stays in the browser | Deploy via Actions; revisit if that ever matters |
| S7 | LED colour rendering: do the proposed palette roles stay distinguishable on the real device? | Colour-tuning spike with a test pattern (§5.4) |

## 11. Tech stack (proposal)

- **TypeScript** everywhere. **Vite** for dev/build. **React** for UI (decided).
- **UI kit: shadcn/ui** (Tailwind + Radix primitives, components copied into the repo). Preferred over
  Mantine because the chart grid and virtual Launchpad are custom-drawn anyway, Tailwind makes that easy,
  and owning the component code avoids fighting a kit's theme. Mantine is the fallback if we want more
  batteries (forms, notifications) with less setup.
- **Framework-free `core/`**: theory (scales, chord parser → pitch classes), sync engine, grid mapping,
  LED frame rendering and diffing, sheet schema. 100% unit-testable with **Vitest**, no browser needed.
- **Adapters**: Web MIDI adapter and a Virtual Launchpad adapter share one `LaunchpadPort` interface.
- **State**: Zustand (small, no boilerplate). **Styling**: Tailwind (comes with shadcn/ui).
- **Tests**: Vitest for core, Playwright for the editor with a mocked Web MIDI. Snapshot-test LED frames.
- **CI**: GitHub Actions (lint, typecheck, test, build).
- Chromium-only is acceptable (Web MIDI with SysEx is Chrome/Edge/Opera).

## 12. Working in GitHub

- **Milestones** mirror the roadmap phases (e.g. Spikes, Core model, Hardware I/O, Sync, Editor,
  Persistence, Polish).
- **Issues** per task, labelled by area (`hardware`, `sync`, `theory`, `ui`, `persistence`, `infra`)
  and type (`spike`, `feature`, `bug`, `docs`). Issue templates for bug/feature/spike.
- **PRs** reference issues; squash-merge into `develop`, release-merge into `main`.
- **Wiki**: Launchpad protocol cheat sheet, Live setup guide (with screenshots), troubleshooting.
- **docs/** in repo: this brainstorm, the plan, the roadmap, and ADRs for decisions (`docs/adr/`).
- **GitHub Projects** board for the roadmap (needs `gh auth refresh -s project` once).

## 13. Stretch ideas (parking lot)

- Standalone practice mode with its own metronome (WebAudio) when Live isn't running; optionally send
  clock *to* Live.
- Count-in display.
- Chord-tone "target" drills: light only the 3rd and 7th.
- Record what you played vs. the chart; show out-of-key hits afterwards.
- Import chord charts from text formats (ChordPro, iReal-style) or MusicXML.
- Second Launchpad (Mini MK3 / X) support via device-ID detection.
- Lighting the DIN-connected gear or a second grid with the same frame.

## 14. Decisions from the first review (2026-11-09)

1. Out-of-key pads are **dark** by default. Chord tones coloured by function; root stays **pink**. Palette
   proposal in §5.4. Added the **absolute vs relative grid** setting (§5.2).
2. **Two chords per bar** in v1, split in time (first half / second half). "First pass / second pass"
   chords are a song-structure feature for later.
3. **Fourths** is the default layout; layout customisation lives in the app (the Launchpad's own settings
   are inert in Programmer mode).
4. Session mode hand-back is **nice-to-have**, not a v1.0.0 blocker.
5. The **chart view is the performance view**; current bar highlighted with beat progress and auto-scroll.
6. Repo stays **private**; paid plan, so GitHub Pages is available.
7. **React + shadcn/ui**.
8. Standalone metronome mode → **parking lot**.

## 15. Decisions from the second review (2026-11-09)

1. **Palette**: "warm chord over cool scale" is the default theme; pink/red/orange ships as a second
   built-in theme. Because a theme is just a role → RGB map, a **per-role colour editor** is cheap and is
   a *should-have* for v1.0.0 (drop it if it threatens the date; theme *selection* is a must-have).
2. **Relative grid anchor defaults to the chord root**, with a setting to use the key root instead. In this
   mode the lit shape never moves: the root pad is always bottom-left and only the pitches underneath
   change bar to bar.
3. **Pressed-pad feedback is on**, Launchpad-standard: pressing a pad lights that pad *and every other pad
   that plays the same note* (the fourths layout repeats each pitch on several pads). Default is same MIDI
   note; option to also light the same pitch class in other octaves.
4. **Root pulses on the beat by default**, opt-out. Implementation note from the spec: hardware *pulsing*
   has a two-beat period, while hardware *flashing* has a one-beat period between two colours. So "pulse on
   the beat" = hardware **flash between bright pink and dim pink**, beat-locked by forwarding Live's MIDI
   clock to the Launchpad's MIDI port. Software fallback if clock forwarding proves unreliable.

Brainstorm closed. Next: `docs/plan.md`.
