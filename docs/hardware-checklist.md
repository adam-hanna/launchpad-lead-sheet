# Hardware checklist (release gate)

Run before every release on the documented versions (plan §9). Each line maps to a contract in
`docs/plan.md`; tick it only when observed on the real Launchpad Pro MK3 with Live running. Record the
versions and the date at the bottom.

Prerequisites: `docs/live-setup.md` completed; the feasibility gates in `docs/spikes/README.md` have
recorded results (G1–G8).

## Device ownership (§4.2)

- [ ] Take the Launchpad → Programmer mode confirmed, full repaint, pads respond.
- [ ] Restore Launchpad → device returns to Live mode and does **not** re-enter on its own.
- [ ] Unplug while owned → "No Launchpad"; replug → re-enters and repaints without clicking.
- [ ] Hold a pad, then Restore → the note stops (Note Off precedes the mode switch).
- [ ] Hold a pad, unplug → note stops within 100 ms of the browser noticing.
- [ ] Switch the device out of Programmer mode from the hardware three times quickly → "Launchpad
      conflict", no more automatic attempts; Retry recovers once the cause is gone.
- [ ] Open the app in a second tab → it shows "Another tab is controlling MIDI"; Take over works.

## Transport (§4.4)

- [ ] Start from 1.1.1 → bar 1 lit on the first clock.
- [ ] Start from bar 17 (Song mode) → bar 17's harmony immediately.
- [ ] Stop → pads keep the stopped bar; held notes keep sounding until released.
- [ ] Continue after a long stop → no "Clock lost" flicker.
- [ ] Turn Sync off in Live while playing → "Clock lost" within a second; clicking in the Arrangement
      (SPP) recovers.
- [ ] Loop brace 5–8 with a sheet loop 5–8 → harmony follows the loop through two wraps.
- [ ] Sheet shorter than the song → past the end holds the last chord (or repeats / goes dark per
      setting).
- [ ] Sheet with **Starts at Live bar** 9 → bar 1 of the sheet lights at Live bar 9; before that bar 1 shows
      as a count-in.

## Lighting (§4.3, §4.6)

- [ ] Key mode: key root pink, scale tones dim blue, out-of-key dark.
- [ ] Key + chord: chord tones coloured by function; a borrowed chord's tones stay visible.
- [ ] Root flashes on the beat while playing and is static when stopped; phase correct after Start,
      Continue mid-bar and a replug.
- [ ] Split bar `Dm7 G7` changes at the half bar.
- [ ] Pressing a pad lights every pad with that note white; releasing restores the role colour even if
      the chord changed meanwhile.
- [ ] Octave ↑/↓ buttons shift the grid; their LEDs show direction and limits.
- [ ] Beat indicator on the top row follows the beat (setting on).
- [ ] Look-ahead pulses changing pads during the last beat (setting on).
- [ ] Custom theme colours appear as chosen; dim mode shows out-of-key pads faintly.

## Notes (§4.1, §4.10)

- [ ] One note plays per pad press at the pressed velocity; two pads of the same note do not retrigger;
      the note stops after the last release.
- [ ] Hold a pad, shift the octave, release → the original pitch stops, nothing stuck.
- [ ] Polyphonic aftertouch reaches Live (device set to poly), channel pressure too (device set to
      channel).
- [ ] Panic silences everything.
- [ ] Unplug the notes IAC bus while holding → "Stuck on …" listed; replug → released before new notes.
- [ ] Change the MIDI channel while holding → old note stops on the old channel.

## Editor and persistence (§4.5, §4.9, §4.11)

- [ ] Edit a bar while it plays → LEDs change immediately.
- [ ] Edit an earlier bar that a later inheriting bar depends on → the later bar follows.
- [ ] Reload the page → last sheet and settings return; the device reconnects on Take.
- [ ] Export JSON, delete the sheet, import the JSON → identical chart.
- [ ] Text chart with `%`, `N.C.`, `{key}` round-trips.

## Endurance

- [ ] 20 minutes at 120 bpm with pads played throughout: no stuck notes, no drift versus Live's bar
      counter, Chrome in the background for part of it.

## Record

| Item               | Value                  |
| ------------------ | ---------------------- |
| Date               |                        |
| macOS              |                        |
| Browser            |                        |
| Live               |                        |
| Launchpad firmware |                        |
| App commit         |                        |
| Result             | pass / fail with notes |
