# Troubleshooting

Each entry names the state the app shows, what causes it and the recovery. The states are specified in
`docs/plan.md` §4.2, §4.4 and §4.12.

## Stuck notes

**Symptom.** A note keeps sounding in Live after every pad is released; the transport header shows a
"Stuck on …" badge listing the notes.

**Cause.** The notes output (`IAC Driver LS Notes`) disappeared, or Live stopped listening, while notes
were sounding. The app could not deliver the Note Off, so it remembers the debt per destination.

**Recovery.**

1. Replug or re-enable the output. The app sends the owed Note Offs before any new note.
2. If the instrument still rings, press **Panic** in the Setup tab: Note Off for every note on every
   reachable destination, then a repaint.
3. As a last resort stop the track in Live (its own MIDI panic: double-click the stop button).

Changing the MIDI channel or the octave while holding pads is safe: the original pitch is released on the
original channel first.

## The Launchpad stays in Programmer mode

**Symptom.** After closing the browser, the Launchpad shows the app's colours and does not react to Live.

**Cause.** The device was not restored. Programmer mode is a device state; the browser cannot leave it
once the tab is gone.

**Recovery.** Power-cycle or replug the Launchpad: it always boots into Live mode. Next time, press
**Restore Launchpad** before closing the tab. Reloading the tab is fine: the app re-enters and repaints.

## "Launchpad conflict"

**Symptom.** The device badge shows **Conflict** and the pads are dark or show another program's colours.

**Cause.** Something else keeps switching the device out of Programmer mode. The app re-entered three
times within ten seconds and then stopped trying, so two programs do not fight over the LEDs forever.

**Recovery.**

1. Set Live's Launchpad control surface to **None** (Preferences → Link, Tempo & MIDI), or quit the other
   application using the Launchpad.
2. Press **Retry** in the Setup tab. Recovery resumes normally; the counter resets after a quiet period.

## "Another tab is controlling MIDI"

Only one tab may own the MIDI ports. Close the other tab, or press **Take over here**: the new tab waits
for the owner to release and then takes the device, repainting from scratch.

## "Clock lost"

Live stopped sending clock for half a second while the app believed it was playing. Check that Sync is
**On** for `IAC Driver LS Clock`, then press Play or click in the Arrangement (a Song Position message
resynchronises). The app never guesses a position: it stays in **Clock lost** until Live tells it where
it is.

## "Waiting for position"

The app has clock but no position yet, which happens when it connected while Live was already playing.
Press Stop then Play, or click a locator in the Arrangement.

## Harmony is off by one bar

Either the sheet starts mid-song (set **Starts at Live bar** in the Sheet tab) or Live's time signature
differs from the sheet's. The app derives bars from ticks using the sheet's meter, so they must agree from
Live bar 1 through the end of the sheet.

## Nothing sounds, pads light

The notes reach `IAC Driver LS Notes` but no track listens. Set a MIDI track's **MIDI From** to that bus
with **Monitor Auto** and arm it (Monitor **In** would also mute the track's recordings). Do not use "All Ins": the raw Launchpad port would reach the instrument.

## Pads send wrong notes into Live

`LPProMK3 MIDI` has **Track** enabled in Live. In Programmer mode the pads send grid indices, not notes;
switch Track off for that input.
