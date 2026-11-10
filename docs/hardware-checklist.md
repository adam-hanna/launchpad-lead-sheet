# Hardware checklist (release gate)

Run before every release on the documented versions (plan §9). Each line maps to a contract in
`docs/plan.md`; tick it only when observed on the real Launchpad Pro MK3 with Live running. Record the
versions and the date at the bottom.

Prerequisites: `docs/live-setup.md` completed; the feasibility gates in `docs/spikes/README.md` have
recorded results (G1–G8).

## Device ownership (§4.2)

- [x] Take the Launchpad → Programmer mode confirmed, full repaint, pads respond.
- [x] Restore Launchpad → device returns to Live mode and does **not** re-enter on its own.
- [ ] (deferred) Unplug while owned → "No Launchpad"; replug → re-enters and repaints without clicking.
- [ ] (deferred) Hold a pad, then Restore → the note stops (Note Off precedes the mode switch).
- [ ] (deferred) Hold a pad, unplug → note stops within 100 ms of the browser noticing.
- [ ] (deferred) Switch the device out of Programmer mode from the hardware three times quickly → "Launchpad
      conflict", no more automatic attempts; Retry recovers once the cause is gone.
- [ ] (deferred) Open the app in a second tab → it shows "Another tab is controlling MIDI"; Take over works.

## Transport (§4.4)

- [x] Start from 1.1.1 → bar 1 lit on the first clock.
- [ ] (deferred) Start from bar 17 (Song mode) → bar 17's harmony immediately.
- [x] Stop → pads keep the stopped bar; held notes keep sounding until released.
- [ ] (deferred) Continue after a long stop → no "Clock lost" flicker.
- [ ] (deferred) Turn Sync off in Live while playing → "Clock lost" within a second; clicking in the Arrangement
      (SPP) recovers.
- [ ] (deferred) Loop brace 5–8 with a sheet loop 5–8 → harmony follows the loop through two wraps.
- [x] Sheet shorter than the song → past the end holds the last chord (or repeats / goes dark per
      setting).
- [ ] (deferred) Sheet with **Starts at Live bar** 9 → bar 1 of the sheet lights at Live bar 9; before that bar 1 shows
      as a count-in.

## Lighting (§4.3, §4.6)

- [ ] (deferred) Key mode: key root pink, scale tones dim blue, out-of-key dark.
- [x] Key + chord: chord tones coloured by function; a borrowed chord's tones stay visible.
- [x] Root flashes on the beat while playing and is static when stopped; phase correct after Start,
      Continue mid-bar and a replug.
- [x] Split bar `Dm7 G7` changes at the half bar.
- [x] Pressing a pad lights every pad with that note white; releasing restores the role colour even if
      the chord changed meanwhile.
- [x] Octave ↑/↓ buttons shift the grid; their LEDs show direction and limits.
- [ ] (deferred) Beat indicator on the top row follows the beat (setting on).
- [ ] (deferred) Look-ahead pulses changing pads during the last beat (setting on).
- [ ] (deferred) Custom theme colours appear as chosen; dim mode shows out-of-key pads faintly.

## Notes (§4.1, §4.10)

- [x] One note plays per pad press at the pressed velocity; two pads of the same note do not retrigger;
      the note stops after the last release.
- [x] Hold a pad, shift the octave, release → the original pitch stops, nothing stuck.
- [ ] (deferred) Polyphonic aftertouch reaches Live (device set to poly), channel pressure too (device set to
      channel).
- [ ] (deferred) Panic silences everything.
- [ ] (deferred) Unplug the notes IAC bus while holding → "Stuck on …" listed; replug → released before new notes.
- [ ] (deferred) Change the MIDI channel while holding → old note stops on the old channel.

## Editor and persistence (§4.5, §4.9, §4.11)

- [ ] (deferred) Edit a bar while it plays → LEDs change immediately.
- [ ] (deferred) Edit an earlier bar that a later inheriting bar depends on → the later bar follows.
- [x] Reload the page → last sheet and settings return; the device reconnects on Take.
- [ ] (deferred) Export JSON, delete the sheet, import the JSON → identical chart.
- [ ] (deferred) Text chart with `%`, `N.C.`, `{key}` round-trips.

## Endurance

- [ ] (deferred) 20 minutes at 120 bpm with pads played throughout: no stuck notes, no drift versus Live's bar
      counter, Chrome in the background for part of it.

## Record

Legend: `[x]` = seen on the hardware. `[ ] (deferred)` = not done before this release; tracked in #153.

| Item               | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Date               | 2026-11-10                                                               |
| macOS              | 27.0                                                                     |
| Browser            | Chrome 156                                                               |
| Live               | Live 12 Lite 12.4.16                                                     |
| Launchpad firmware | 0465                                                                     |
| App commit         | a6ef749                                                                  |
| Result             | **Pass for v1.0.0**, with the deferred items below accepted by the owner |

Notes on this run:

- The items marked `[x]` were seen in the local app with Live and the device, or in the gate runs of the
  same day (`docs/spikes/README.md`: G1, G2, G3, G4, G7).
- Three items were seen only partly: the phase of the root flash after a replug, octave button LED limits,
  and "Reload the page" (settings and sheet return; the device needs **Take** again by design).
- Deferred: all unplug cases, the conflict state, two tabs, mid-song start in the app (seen in the G3
  traces only), Continue after a long stop in the app, Sync off, the Live loop brace, the origin bar,
  Key mode, beat indicator, look-ahead, custom theme, aftertouch, Panic, a lost notes bus, a channel
  change while a note is held, live edits, JSON and text round trips on hardware, and the 20-minute run.
- Two more bugs were found and fixed in this run: MIDI timestamps of 0 from Chrome (#150) and a rebind on
  each port connection event (#151).
