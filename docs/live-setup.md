# Setting up Ableton Live and the Launchpad

Target: a working setup in under ten minutes (plan §9). Everything here is macOS plus Chrome or Edge; the
app does not run in Safari or Firefox because they have no Web MIDI.

> Screenshots: `docs/images/setup-*.png` are added when the hardware gate runs (roadmap M7-T6). The text
> is complete without them.

## 1. Create the two IAC buses (once)

1. Open **Audio MIDI Setup** (Applications → Utilities).
2. Window → **Show MIDI Studio**. Double-click **IAC Driver**.
3. Tick **Device is online**.
4. In the Ports list add two ports and name them exactly:
   - `LS Clock`
   - `LS Notes`
5. Apply and close.

Live and the browser both see these as `IAC Driver LS Clock` and `IAC Driver LS Notes`.

## 2. Tell Live where to send clock and take notes

Live → Preferences → **Link, Tempo & MIDI**:

| Port                          | Track            | Sync   | Remote | Why                                                                                       |
| ----------------------------- | ---------------- | ------ | ------ | ----------------------------------------------------------------------------------------- |
| Output: `IAC Driver LS Clock` | off              | **On** | off    | Live sends MIDI clock, Start/Stop and Song Position here                                  |
| Input: `IAC Driver LS Notes`  | **On**           | off    | off    | the app's notes arrive here                                                               |
| Input: `LPProMK3 MIDI`        | **Off**          | off    | off    | in Programmer mode the pads send grid indices, not notes; keep them away from instruments |
| Input/Output: `LPProMK3 DAW`  | as Live set them |        |        | used by Live's own Launchpad control surface                                              |

Then, still in that preferences page, under **MIDI Clock Type** for `IAC Driver LS Clock` choose **Song**.
Pattern mode would always start the app at bar 1; Song mode sends the position so starting mid-arrangement
lands on the right bar (plan §4.4).

Live's Launchpad control surface may stay configured. Whether it coexists with the app's Programmer mode
is what gate G2 decides; if it fights, set the control surface to **None** while using the app.

## 3. A track that plays what you press

1. Create a MIDI track with any instrument.
2. **MIDI From**: `IAC Driver LS Notes`, channel **All** (or the channel chosen in the app's settings).
3. **Monitor**: **In** (or Auto with the track armed).

Do not set MIDI From to "All Ins": the raw Launchpad port would reach the instrument too.

## 4. Open the app and connect

1. Plug the Launchpad Pro MK3 directly into the Mac (not through an unpowered hub).
2. Open the app in Chrome or Edge. Click **Connect MIDI** and allow MIDI with SysEx when the browser asks.
3. **Auto-detect ports** should fill all four slots: Launchpad in/out = `LPProMK3 MIDI`, clock =
   `IAC Driver LS Clock`, notes = `IAC Driver LS Notes`. Fix any slot by hand.
4. Click **Take the Launchpad**. The device switches to Programmer mode and the chart lights up.
5. Press Play in Live. The transport badge says **Playing** and the lit pads follow the chart.

## 5. The meter must match

The app computes bars from clock ticks using the sheet's time signature, so Live's time signature must
equal the sheet's from Live bar 1 through the end of the sheet (plan §4.4). If your song starts after an
intro, set **Starts at Live bar** in the Sheet tab instead of changing the meter.

## 6. Giving the Launchpad back

**Restore Launchpad** in the Setup tab returns it to Live mode. If the browser is closed without that,
the device stays in Programmer mode; **power-cycle or replug it** (it always boots into Live mode).

## Troubleshooting

| Symptom                                            | Cause                                                          | Fix                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| "This browser has no Web MIDI"                     | Safari / Firefox                                               | Use Chrome or Edge                                                  |
| "MIDI access was denied"                           | Permission refused once                                        | Site settings → MIDI → Allow (SysEx included) → reload              |
| "Ports missing: clockIn"                           | IAC bus absent or renamed                                      | Section 1; names must match                                         |
| Transport stays "Waiting for position"             | Live has not sent Start/SPP since the app connected            | Press Play, or click in the Arrangement while Live is stopped       |
| Harmony changes mid-bar after a click in the ruler | The click was not on a bar line; Live sends the exact position | Use locators, or click with the grid snap on                        |
| "Clock lost"                                       | Live stopped sending clock (sync turned off, Live quit)        | Check Sync **On** for `LS Clock`; press Play                        |
| Harmony is one bar off                             | Sheet starts mid-song or meter differs                         | Set **Starts at Live bar**; check the meter                         |
| Pads light but nothing sounds                      | Track input or monitoring                                      | Section 3                                                           |
| "Launchpad conflict"                               | Something keeps leaving Programmer mode                        | Set Live's Launchpad control surface to None, then **Retry**        |
| "Stuck on …" badge                                 | Notes were sounding when the notes output vanished             | Replug the output (the app releases them) or stop the track in Live |
| Another tab is controlling MIDI                    | Two app tabs                                                   | Close one, or **Take over here**                                    |
