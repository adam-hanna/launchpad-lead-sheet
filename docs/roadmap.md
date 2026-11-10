# Launchpad Lead Sheet — Roadmap

Status: draft (2026-11-09). Derived from `docs/plan.md` revision 4. Every task is written to become one
GitHub issue; every milestone becomes a GitHub milestone; every epic becomes a parent issue with a task
list (sub-issues). Section references (§) point into the plan and are the acceptance criteria.

## 1. Structure

```
Milestone (M0–M7, one GitHub milestone each, one release tag each from M2 on)
└── Epic (E#.#, a parent issue labelled type:epic, holds the task list)
    └── Task (M#-T#, one issue; title is the bold text, body is the rest)
```

**Task line format**: `**ID Title** — what and why. Labels. Size. Depends. Accepts.`

- **Labels**: one `area:*` and one `type:*` per issue.
  - `area:` `infra` `docs` `theory` `sheet` `sync` `grid` `lighting` `midi` `launchpad` `routing` `ui`
    `storage` `qa`
  - `type:` `feature` `spike` `bug` `docs` `chore` `test` `epic`
- **Size**: S (under half a day), M (one to two days), L (three to five days). Anything larger is split.
- **Depends**: task IDs that must be merged first. Milestones are not strictly sequential; §3 shows
  what can run in parallel.
- **Accepts**: plan sections whose acceptance examples must be automated tests or recorded results.

## 2. Milestones at a glance

| Milestone                 | Theme                                                  | Exit criterion                                                                  | Release |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- | ------- |
| M0 Foundation             | Repo, CI, process, docs infrastructure                 | CI green on an empty app; labels, templates, board exist; design docs committed | —       |
| M1 Feasibility gate       | Gates G1–G8 on real hardware                           | Every gate has a recorded pass/fail with versions; plan amended for any failure | —       |
| M2 Core domain            | Theory, chord grammar, sheet model, text format        | All §4.5, §4.9, §4.11 acceptance tests pass; grammar doc reviewed               | v0.2.0  |
| M3 Sync, grid, lighting   | ClockEngine, mapping, LED model                        | §4.3, §4.4, §4.6, §4.7, §4.8 tests pass incl. G3 trace replay                   | v0.3.0  |
| M4 Device adapters        | Web MIDI, Pro MK3 driver, ownership, virtual Launchpad | A JSON sheet lights the real and virtual Launchpad from Live's transport        | v0.4.0  |
| M5 Note routing           | Ownership, pressure, feedback, cleanup                 | §4.1, §4.2, §4.10 tests pass; G4 scenario repeats on the app                    | v0.5.0  |
| M6 App UI and persistence | Setup, editor, settings, library                       | A new sheet can be written, played, saved and reloaded without JSON             | v0.6.0  |
| M7 Release                | Should-haves, docs, checklist, deploy                  | §9 definition of done                                                           | v1.0.0  |
| M8 Backlog                | Won't-haves and parking lot                            | Unscheduled                                                                     | —       |

## 3. Sequencing and parallelism

```
M0 ──► M1 (hardware) ─────────────────┐
  └──► M2 (pure TS, no hardware) ─► M3 ─┴─► M4 ─► M5 ─► M6 ─► M7
```

- M1 and M2 run in parallel: M2 needs no hardware. M3's ClockEngine starts on synthetic streams and adds
  G3 trace replay when M1 delivers traces.
- M4 waits for M1's gate review (control-surface recommendation, hardware vs software flash).
- M6 UI shells (setup panel, chart grid layout) can start during M4/M5 against the virtual Launchpad.

## 4. M0 — Foundation

### E0.1 Repository scaffold

- **M0-T1 Scaffold the Vite + React + TypeScript app** — pnpm, strict TS, `src/core`, `src/adapters`,
  `src/app` folders with path aliases; empty app renders. `area:infra` `type:chore`. S. Accepts: §3.
- **M0-T2 Add ESLint, Prettier and typecheck scripts** — shared config, `pnpm lint`, `pnpm typecheck`,
  pre-commit hook optional. `area:infra` `type:chore`. S. Depends: M0-T1.
- **M0-T3 Set up Vitest with coverage thresholds for `src/core`** — near-complete coverage target,
  snapshot serializer for 8x8 role grids. `area:infra` `type:test`. S. Depends: M0-T1. Accepts: §6.
- **M0-T4 Initialise Tailwind and shadcn/ui with an app shell** — dark theme default, header, main,
  side panel placeholders. `area:ui` `type:chore`. S. Depends: M0-T1.
- **M0-T5 Add a Playwright smoke test with a Web MIDI mock** — one test that loads the app with a fake
  `navigator.requestMIDIAccess`. `area:infra` `type:test`. M. Depends: M0-T1.

### E0.2 CI/CD

- **M0-T6 GitHub Actions: lint, typecheck, test, build on every PR** — required check for `develop`.
  `area:infra` `type:chore`. S. Depends: M0-T2, M0-T3.
- **M0-T7 Deploy to GitHub Pages on push to `main`** — Vite base path, SPA fallback, Pages workflow for
  the private repo. `area:infra` `type:chore`. S. Depends: M0-T6.

### E0.3 Project process

- **M0-T8 Create labels, milestones, issue and PR templates** — labels per §1; milestones M0–M8; templates
  for feature, bug, spike; PR template with linked issue, test notes, hardware-tested checkbox.
  `area:infra` `type:chore`. S. Accepts: §7.
- **M0-T9 Configure branches** — `develop` default for PRs, `main` for releases, squash merge, required
  CI, linear history. `area:infra` `type:chore`. S. Depends: M0-T6.
- **M0-T10 Create the GitHub Projects v2 board** — fields Status, Size, Area, Milestone; roadmap view by
  milestone. Needs `gh auth refresh -s project`. `area:infra` `type:chore`. S. Depends: M0-T8.
- **M0-T11 Write the Launchpad protocol cheat sheet in the wiki** — SysEx header, mode commands, LED
  commands, index map, port names, from the programmer's reference. `area:docs` `type:docs`. M.
- **M0-T12 Add ADR template and the first ADRs** — ADR-001 browser app over Max for Live; ADR-002
  Programmer mode and app-defined layout; ADR-003 MIDI clock over IAC for sync. `area:docs` `type:docs`.
  S.
- **M0-T13 Commit the design docs and a CONTRIBUTING guide** — brainstorm, plan, roadmap; branch and
  commit conventions. `area:docs` `type:docs`. S. Depends: M0-T9.

## 5. M1 — Feasibility gate

### E1.1 Spike harness

- **M1-T1 Build the throwaway spike page** — Web MIDI access with SysEx, port list, device inquiry, raw
  MIDI logger with timestamps, send-bytes box, JSON export of logs. Lives in `spikes/`, not shipped.
  `area:midi` `type:spike`. M. Depends: M0-T1.
- **M1-T2 Create `docs/spikes/README.md`** — version recording template (macOS, browser, Live, firmware),
  per-gate result sections, trace file naming. `area:docs` `type:docs`. S.

### E1.2 Gates (each records pass/fail and evidence in `docs/spikes/`)

- **M1-T3 G1 Device control** — enter/exit Programmer mode, full 106-LED SysEx frame, layout-change
  message detection, verify every pad and button index against the documented map. `area:launchpad`
  `type:spike`. M. Depends: M1-T1. Accepts: §5 G1.
- **M1-T4 G2 Live coexistence** — behaviour with Live's Launchpad control surface enabled vs disabled
  while in Programmer mode; record fighting, resets, LED hogging. `area:launchpad` `type:spike`. M.
  Depends: M1-T3. Accepts: §5 G2.
- **M1-T5 G3 Clock traces** — capture raw bytes for Start from 1.1.1, Start mid-song, Continue, seek
  while stopped, seek while playing, loop wrap, Stop, clock stall, long Stop then Continue, reconnect
  while running; MIDI Clock Type Song. Check traces in. `area:sync` `type:spike`. M. Depends: M1-T1.
  Accepts: §4.4 G3 list.
- **M1-T6 G4 Mapped round trip** — hard-coded fourths mapping, pad → IAC → Live instrument with Live in
  the foreground; held notes across a mapping change; poly and channel pressure; LED repaint while
  playing. `area:routing` `type:spike`. L. Depends: M1-T3. Accepts: §5 G4.
- **M1-T7 G5 Latency and jitter** — known-output workload, external MIDI monitor, pairing by mapped
  note, unmatched/extra/late reporting, harness self-test with a dropped event, ≥ 1,000 presses, raw
  samples kept. `area:qa` `type:spike`. L. Depends: M1-T6. Accepts: §5 G5.
- **M1-T8 G6 Endurance and transitions** — 20 min at 60/120/200 bpm in 4/4 plus a 7/16 and 6/8
  split-chord run; Stop, seek, loop wrap, reconnect in each run. `area:qa` `type:spike`. M. Depends:
  M1-T6. Accepts: §5 G6.
- **M1-T9 G7 Colour and flash** — test pattern of all theme roles, candidate pink flash palette pairs,
  flash phase on Start/Continue/reconnect with clock forwarded. `area:lighting` `type:spike`. M.
  Depends: M1-T3. Accepts: §5 G7, §4.3.
- **M1-T10 G8 Web MIDI lifecycle** — permission flow, hot-plug, reconnect timing from port-available
  event to confirmed mode plus repaint. `area:midi` `type:spike`. S. Depends: M1-T3. Accepts: §5 G8.

### E1.3 Gate review

- **M1-T11 Gate review and plan amendments** — record pass/fail per gate; decide the control-surface
  recommendation (G2), hardware vs software flash (G7), stopped-seek receiver contract (G3); write ADRs
  for deviations; update `docs/plan.md`. `area:docs` `type:docs`. S. Depends: M1-T3…M1-T10.

## 6. M2 — Core domain (v0.2.0)

### E2.1 Theory

- **M2-T1 Pitch classes, scales and keys** — all scale types from the brainstorm, `Key → Set<PitchClass>`,
  enharmonic spelling helpers. `area:theory` `type:feature`. S. Depends: M0-T3.
- **M2-T2 Write `docs/chord-grammar.md`** — bounded token table with pitch classes and functions,
  aliases, rejected examples, whitespace rules, error format. Reviewed before M2-T3 merges.
  `area:theory` `type:docs`. M. Accepts: §4.9.
- **M2-T3 Implement the chord parser** — grammar from M2-T2, user spelling preserved, errors with token
  position. `area:theory` `type:feature`. L. Depends: M2-T1, M2-T2. Accepts: §4.9.
- **M2-T4 Chord to tones with functions** — root/third/fifth/seventh/extension/bass, sus as third
  replacement, slash bass. `area:theory` `type:feature`. M. Depends: M2-T3. Accepts: §4.6, §4.9.

### E2.2 Sheet model

- **M2-T5 Sheet and Bar types with zod schema v1** — inherit/explicit/clear fields, meter set, origin,
  loop; validation rules incl. empty sheet. `area:sheet` `type:feature`. M. Depends: M2-T3. Accepts:
  §4.11, §4.8 supported meters.
- **M2-T6 Implement `resolve()`** — independent key and chord inheritance, clear, N.C., split-bar
  sustain, first-bar defaults. `area:sheet` `type:feature`. M. Depends: M2-T5. Accepts: §4.5.
- **M2-T7 Loop mapping and outside-timeline harmony** — pure functions from `sheetBar` to active
  harmony: loop modulo, past-end (sustain / repeat / dark), before-origin. `area:sheet` `type:feature`.
  S. Depends: M2-T6. Accepts: §4.4 outside-timeline bullets.

### E2.3 Text format

- **M2-T8 Text chart parser** — headers, `[sections]`, `{key}` tokens, `N.C.`, `%`, two chords per bar,
  errors with bar and token. `area:sheet` `type:feature`. L. Depends: M2-T5. Accepts: §4.9.
- **M2-T9 Canonical text exporter and round-trip fixture** — stable canonical output, `%` expansion,
  semantic round-trip test, fixture with every v1 feature. `area:sheet` `type:test`. M. Depends: M2-T8.
  Accepts: §4.9.

## 7. M3 — Sync, grid, lighting (v0.3.0)

### E3.1 ClockEngine

- **M3-T1 ClockEngine state machine** — validity, intent, clock timer, transition table, UI state
  precedence, no wall-clock inference. `area:sync` `type:feature`. L. Depends: M0-T3. Accepts: §4.4.
- **M3-T2 Meter and tick arithmetic** — `ticksPerBar`, `ticksPerBeat`, half-bar boundary, position →
  bar/beat/tick, origin offset. `area:sync` `type:feature`. S. Depends: M3-T1. Accepts: §4.8.
- **M3-T3 Trace replay test harness** — load G3 traces, assert positions at first Clock, half-bar
  boundaries, loop wrap, stall, long Stop then Continue. `area:sync` `type:test`. M. Depends: M3-T2,
  M1-T5. Accepts: §4.4 acceptance.
- **M3-T4 Tempo estimate for display** — smoothed clock interval, never used for logic. `area:sync`
  `type:feature`. S. Depends: M3-T1.

### E3.2 Grid

- **M3-T5 Layouts and absolute mapping** — row offset presets and custom, `effectiveBase`, out-of-range
  pads unmapped, `padsFor(note)`. `area:grid` `type:feature`. S. Depends: M0-T3. Accepts: §4.7.
- **M3-T6 Relative mapping** — anchor placement rule, anchor setting with fallbacks, mode switch
  preserves register. `area:grid` `type:feature`. M. Depends: M3-T5, M2-T4. Accepts: §4.7.

### E3.3 Lighting

- **M3-T7 LedState model, Frame, semantic diff and SysEx encoder** — off/rgb/palette/flash/pulse, diff to
  `LedSpec[]`, encode to one SysEx, pure. `area:lighting` `type:feature`. M. Depends: M0-T3. Accepts:
  §4.3.
- **M3-T8 Role resolution** — membership by display mode, priority order, slash-bass collisions, off/dim.
  `area:lighting` `type:feature`. M. Depends: M2-T4, M3-T5. Accepts: §4.6.
- **M3-T9 Themes and `render()`** — role → RGB|palette, `rootFlash` palette pair, two built-in themes,
  static root when not playing, pressed override. `area:lighting` `type:feature`. M. Depends: M3-T7,
  M3-T8. Accepts: §4.3.
- **M3-T10 Render dependency tracker and frame snapshots** — re-render on harmony, mapping, transport,
  selection, settings, pressed; absolute quarter-note flash phase for the virtual display; snapshot
  tests as 8x8 role grids. `area:lighting` `type:test`. M. Depends: M3-T9, M3-T1. Accepts: §4.3, §4.8.

## 8. M4 — Device adapters (v0.4.0)

### E4.1 Web MIDI

- **M4-T1 Web MIDI adapter** — access with SysEx, port enumeration, `statechange`, permission and
  unsupported states, timestamps. `area:midi` `type:feature`. M. Depends: M0-T1. Accepts: §4.12.
- **M4-T2 Device inquiry and port auto-detect** — identify the Pro MK3 reply, pick `LPProMK3 MIDI` in/out,
  remember IAC bus names. `area:midi` `type:feature`. S. Depends: M4-T1.

### E4.2 Pro MK3 driver and ownership

- **M4-T3 LaunchpadPort driver for the Pro MK3** — mode commands, frame send, input decode (pads, CCs,
  poly and channel pressure), layout-change events, clock forwarding. `area:launchpad` `type:feature`.
  L. Depends: M4-T1, M3-T7, M1-T11. Accepts: §4.3, §4.10.
- **M4-T4 Device ownership state machine** — desired vs observed, conflict flag, bounded recovery,
  hardware-owner cleanup hook, input gating, frame-cache invalidation and complete repaint on
  acquisition, best-effort restore on exit. `area:launchpad` `type:feature`. L. Depends: M4-T3.
  Accepts: §4.2, §4.3.
- **M4-T5 Single-tab lock** — Web Locks plus BroadcastChannel; passive state for other tabs.
  `area:storage` `type:feature`. S. Depends: M4-T1. Accepts: §4.2.

### E4.3 Virtual Launchpad

- **M4-T6 Virtual Launchpad component** — implements LaunchpadPort, renders LedState with flash phase,
  clickable pads with fixed velocity, pointer-cancel release. `area:ui` `type:feature`. M. Depends:
  M3-T9, M0-T4. Accepts: §4.3.

### E4.4 Integration

- **M4-T7 First end-to-end light-up** — dev-only page: load a JSON sheet, connect, follow Live, light the
  real and virtual Launchpad together. `area:ui` `type:feature`. M. Depends: M4-T4, M4-T6, M3-T10,
  M2-T7. Accepts: M4 exit criterion.
- **M4-T8 Software flash fallback** — only if G7 fails: ClockEngine-driven two-spec flash behind the same
  LedState. `area:lighting` `type:feature`. M. Depends: M1-T11. Accepts: §4.3.

## 9. M5 — Note routing (v0.5.0)

### E5.1 Ownership and output

- **M5-T1 NoteOwnership table** — owners by source and pad, destinations captured at press, refcount,
  idempotent duplicate Note On, unknown-release ignore, Panic semantics. `area:routing` `type:feature`.
  M. Depends: M0-T3. Accepts: §4.1.
- **M5-T2 IAC notes output adapter and Panic** — channel, velocity, reachable-destination Note Offs.
  `area:routing` `type:feature`. S. Depends: M4-T1, M5-T1. Accepts: §4.1.
- **M5-T3 Pressure routing** — poly pressure through ownership with max across owners and recompute on
  release; channel pressure forwarded; unowned dropped. `area:routing` `type:feature`. M. Depends:
  M5-T1, M4-T3. Accepts: §4.10.

### E5.2 Feedback and safety

- **M5-T4 Press feedback** — `pressed` role on all pads mapped to owned notes; option for same pitch class
  in other octaves (should-have flag). `area:lighting` `type:feature`. S. Depends: M5-T1, M3-T9.
  Accepts: §4.1, §4.3.
- **M5-T5 Cleanup rules and pending-cleanup record** — device loss, port or channel change, pointer
  cancel, destination unavailable per destination, flush-before-accept on return, failed-send retention,
  stuck-note UI list. `area:routing` `type:feature`. L. Depends: M5-T2, M4-T4. Accepts: §4.2.
- **M5-T6 Held-note safety under remap and octave buttons** — mapping changes never alter owned notes;
  side buttons change `octaveShift` in both modes; relative mode remap at boundaries. `area:routing`
  `type:feature`. M. Depends: M5-T1, M3-T6. Accepts: §4.7.
- **M5-T7 Side-button LED feedback** — octave indicators and reserved buttons lit per state.
  `area:launchpad` `type:feature`. S. Depends: M5-T6.

## 10. M6 — Application UI and persistence (v0.6.0)

### E6.1 Setup and status

- **M6-T1 Setup panel** — port pickers with auto-detect, status lights (device, clock, notes), Enter /
  Restore, Panic, test pattern. `area:ui` `type:feature`. M. Depends: M4-T2, M4-T4, M5-T2.
- **M6-T2 Unsupported and degraded states** — no Web MIDI, permission denied, ports missing, conflict,
  other-tab active, stuck notes. `area:ui` `type:feature`. S. Depends: M6-T1. Accepts: §4.12, §4.2.
- **M6-T3 Transport header** — state badge, bar:beat, tempo, now/next, before-start / past-end / empty
  / waiting-for-position messages. `area:ui` `type:feature`. M. Depends: M3-T4, M2-T7. Accepts: §4.4.

### E6.2 Chart editor

- **M6-T4 Chart grid** — bars 4 per row, section headers, inherited values greyed, split cells, empty
  sheet state. `area:ui` `type:feature`. L. Depends: M2-T6, M0-T4.
- **M6-T5 Bar editor** — key picker (root, scale, inherit, clear), chord entry with live parser
  validation, N.C., second chord toggle. `area:ui` `type:feature`. L. Depends: M6-T4, M2-T3.
- **M6-T6 Current-bar highlight and selection** — beat progress fill, auto-scroll, editor selection
  drives the grid when not playing. `area:ui` `type:feature`. M. Depends: M6-T4, M3-T10. Accepts: §4.3,
  §4.4.
- **M6-T7 Text import/export dialog** — paste or file, errors by bar and token, canonical export copy.
  `area:ui` `type:feature`. M. Depends: M2-T9, M6-T4.
- **M6-T8 Sheet metadata editor** — title, meter, tempo note, origin bar, loop range with validation.
  `area:ui` `type:feature`. S. Depends: M6-T4, M2-T5.

### E6.3 Settings

- **M6-T9 Settings panel** — display mode, off/dim, layout and row offset, base note, absolute/relative
  and anchor, root flash, MIDI channel, clock offset (should-have). `area:ui` `type:feature`. M.
  Depends: M3-T6, M3-T9, M5-T6.
- **M6-T10 Theme selection** — pick between built-in themes; colour editor is M7. `area:ui`
  `type:feature`. S. Depends: M3-T9.

### E6.4 Persistence

- **M6-T11 IndexedDB sheet store** — autosave debounce, write-then-swap, one pending write per sheet,
  flush on switch, failure feedback. `area:storage` `type:feature`. M. Depends: M2-T5. Accepts: §4.11.
- **M6-T12 Sheet library UI** — list, new, duplicate, rename, delete with confirm, last edited.
  `area:ui` `type:feature`. M. Depends: M6-T11.
- **M6-T13 JSON export/import** — validation before replace, future-version rejection, collision →
  copy, usable after storage failure. `area:storage` `type:feature`. M. Depends: M6-T11. Accepts: §4.11.
- **M6-T14 Settings persistence** — localStorage with try/catch fallbacks, device/port memory separate
  from sheets. `area:storage` `type:feature`. S. Depends: M6-T9.

## 11. M7 — Release v1.0.0

### E7.1 Should-haves (triage at milestone start; drop before slipping the date)

- **M7-T1 Per-role theme colour editor** — RGB for static roles, palette picker for flashing roles,
  save as custom theme. `area:ui` `type:feature`. M. Depends: M6-T10.
- **M7-T2 Look-ahead flash** — during the last beat, flash pads that change in the next bar.
  `area:lighting` `type:feature`. M. Depends: M3-T10.
- **M7-T3 Top-row beat and bar-in-phrase indicator** — `area:launchpad` `type:feature`. S. Depends:
  M5-T7.
- **M7-T4 Clock offset setting** — ± ticks applied in ClockEngine. `area:sync` `type:feature`. S.
  Depends: M3-T1.
- **M7-T5 Meter-aware software flash for compound meters** — `area:lighting` `type:feature`. M.
  Depends: M4-T8.

### E7.2 Documentation and QA

- **M7-T6 Write `docs/live-setup.md` with screenshots** — IAC buses, Live preferences, track routing,
  control-surface recommendation from G2, ten-minute target. `area:docs` `type:docs`. M. Depends:
  M1-T11.
- **M7-T7 Wiki: setup, troubleshooting, protocol pages** — mirror of live-setup, stuck-note recovery,
  power-cycle recovery, conflict state. `area:docs` `type:docs`. S. Depends: M7-T6.
- **M7-T8 Write and run `docs/hardware-checklist.md`** — every §4 acceptance that needs hardware, run on
  the documented versions, results recorded. `area:qa` `type:test`. M. Depends: M6-T13.
- **M7-T9 Accessibility and colour-blind pass** — keyboard navigation in the editor, contrast, a
  colour-blind-safe theme. `area:ui` `type:feature`. M. Depends: M6-T10.
- **M7-T10 Performance pass** — SysEx rate limiting, render budget, idle CPU, background-tab behaviour
  documented. `area:qa` `type:chore`. S. Depends: M6-T6.

### E7.3 Ship

- **M7-T11 Release v1.0.0** — merge `develop` → `main`, tag, release notes, Pages deploy verified,
  definition of done checked. `area:infra` `type:chore`. S. Depends: all M7.

## 12. M8 — Backlog (unscheduled)

Each becomes an issue labelled `type:feature` and milestone M8, to be re-planned after v1.0.0.

- Session-mode auto hand-back when Live stops.
- More than two chords per bar; uneven splits; configurable split points.
- Repeats, 1st/2nd endings, D.S. and coda; per-section meters.
- Standalone metronome mode (own transport, optional clock out to Live).
- Tauri shell: virtual MIDI ports, Ableton Link, no IAC setup.
- Launchpad Mini MK3 and X support via device-ID detection.
- URL sharing of sheets; cloud sync.
- Chord-tone drills (light only 3rd and 7th); played-vs-chart review.
- ChordPro / iReal-style / MusicXML import.
- Windows and Linux support.

## 13. Converting this roadmap into GitHub

1. M0-T8 creates labels and milestones M0–M8.
2. Each epic (E#.#) becomes an issue titled `Epic: <name>` with `type:epic`, assigned to its milestone,
   body = the task list with checkboxes linking the task issues.
3. Each task becomes an issue titled with the bold text, body = description, Size, Depends (as issue
   links), Accepts (plan section links). Labels from the task line.
4. The Projects v2 board (M0-T10) gets Size and Area as custom fields, grouped by milestone.
5. A small script (`scripts/roadmap-to-issues.ts`, part of M0-T8) parses the task line format above so
   the roadmap stays the single source of truth; re-running it updates bodies without duplicating issues.
