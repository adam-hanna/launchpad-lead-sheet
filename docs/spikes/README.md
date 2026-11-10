# Feasibility gate — results and runbook

The gate is defined in `docs/plan.md` §5 (G1–G8). This directory holds the recorded results, the raw
traces, and the runbook for the person at the hardware. Nothing in the architecture is treated as proven
until every gate below has a recorded pass or an ADR explaining the consequence of a fail.

## Versions under test

Fill this in once per session. The harness exports the same block with every file.

| Item                       | Value                                            |
| -------------------------- | ------------------------------------------------ |
| macOS                      | 27.0 (26A428)                                    |
| Browser                    | Chrome 157.0.8103.39 (browser gates not yet run) |
| Ableton Live               | Live 12 Lite 12.4.16                             |
| Launchpad Pro MK3 firmware | inquiry version bytes `00 04 06 05`              |
| Harness commit             | 2435415                                          |
| Date                       | 2026-11-10 (CoreMIDI probe only, see G1)         |

## Running the harness

```sh
pnpm spike            # serves spikes/ at http://127.0.0.1:5174
```

Open it in Chrome. Before starting:

1. **IAC**: Audio MIDI Setup → IAC Driver → enable, create buses `LS Clock` and `LS Notes`.
2. **Live → Preferences → Link/Tempo/MIDI**: `IAC Driver LS Clock` output: **Sync On**, MIDI Clock Type
   **Song**. `IAC Driver LS Notes` input: **Track On**. `LPProMK3 MIDI` input: **Track Off**.
3. A MIDI track with input **IAC Driver LS Notes** only, monitoring **In**, with any instrument.
4. In the harness: **Request MIDI access** → **Auto-detect ports** (fix any that are wrong) →
   **Inquiry** (records the firmware) → fill the macOS and Live fields.

Files the harness downloads go in this directory: traces under `traces/`, logs and CSVs under `logs/`.

## Gates

Record each gate as **PASS**, **FAIL** or **PARTIAL** with evidence. A FAIL requires a note on what
changes in the plan (then an ADR in `docs/adr/`).

### G1 Device control

- **Method**: Enter Programmer → confirm the mode pill turns green and the log shows `layout changed →
Programmer` with the response time. **All off**, then **Index sweep** (watch a white LED walk every
  pad and button). Then **Index map test**: press every pad and every surrounding button once. Each
  press logs ✓ (index and message type match the documented map) or ✗. **Restore Live mode** → the device
  returns to its normal Live/Note mode.
- **Pass**: 97 indices seen, zero ✗; Programmer mode confirmed within 500 ms; restore works.
- **Result**: **PARTIAL** (2026-11-10, terminal CoreMIDI probe, not the browser harness) · evidence:
  `logs/g1-coremidi-probe-2026-11-10.txt`. Inquiry answered in 0.6 ms (family `23 01`, not the documented
  `13 01`; decoder and protocol note fixed). Programmer mode entered and restored by SysEx, confirmed by
  layout query in 0.7 ms (`04` → `11` → `04`); an RGB LED message lit pad 11 and a 64-pad off frame
  cleared it. **FAIL of an assumption**: the device sent no layout-changed message after either mode
  command (2.5 s windows) → ADR-0004, every mode command is now followed by a layout query. Still to do
  in the browser: index sweep, index map test (97 presses), restore observed on the device.

### G2 Live coexistence

- **Method**: With Live's Launchpad Pro MK3 control surface **enabled** in Live preferences and Live
  running: Enter Programmer; wait 60 s; press play/stop in Live; switch Session/Arrangement views. Watch
  for `layout changed` messages that are not ours (the harness re-enters up to 3× in 10 s then reports
  CONFLICT). Repeat with the control surface **disabled**.
- **Pass**: no unsolicited layout changes with the control surface enabled; or, if there are, disabling
  it stops them (then the setup guide requires disabling it).
- **Result**: _pending_ · evidence: `logs/g2-*.json`, note which configuration was stable

### G3 Clock traces

- **Method**: For each scenario in the dropdown: select it, press **Record**, perform the scenario in
  Live, press **Stop & save**. Scenarios: start from 1.1.1; start mid-song (click bar 17 while stopped,
  press play); continue (stop, then play without moving); seek while stopped (stopped, click another
  bar); seek while playing (playing, click another bar); loop wrap (loop brace bars 5–8, play through the
  wrap twice); stop; clock stall (unplug/replug the IAC? not possible: instead pause Live with the OS for
  2 s, or skip and note); long stop then continue (stop ≥ 60 s, then continue); reconnect while running
  (Live playing, unplug and replug the Launchpad).
- **Pass**: a trace file per scenario in `traces/`, each with the expected message types present and the
  position pill tracking Live's bar counter.
- **Open questions answered here**: Does Live send SPP alone on a stopped seek, or SPP + Continue? What,
  if anything, does Live send on an Arrangement loop wrap?
- **Result**: _pending_ · evidence: `traces/g3-*.json`

### G4 Mapped round trip

- **Method**: Live in the foreground, harness in a visible Chrome window. Enter Programmer, **Paint
  harmony demo**. Play pads: notes sound in Live, pressed pads light white on every pad with the same
  note. Hold a chord, press **Octave +** and **Octave −** (buttons 80/70 on the left column also work),
  release: no stuck notes (Live's track meter returns to silence). Enable **polyphonic aftertouch** on the
  device (Setup menu while in Live mode) and press into a held pad: Live shows poly pressure. Switch the
  device to channel pressure and repeat. Enable **repaint on every beat**, press play in Live, keep
  playing pads.
- **Pass**: no stuck notes across 20 remaps; pressure arrives in both modes; LEDs keep updating while
  playing with Live in front.
- **Result**: _pending_ · evidence: `logs/g4-*.json`

### G5 Latency and jitter

- **Method**: Open an external MIDI monitor (e.g. MIDI Monitor.app) showing both `LPProMK3 MIDI` input
  events and `IAC Driver LS Notes` events with timestamps. In the harness press **Start G5 workload
  count**. With a fixed mapping, press pads one at a time, fully released, no overlaps: at least 1,000
  presses (a 10-minute run at a steady pace, or a scripted finger). Keep **repaint on every beat** on and
  Live in the foreground. Save the monitor log and the harness CSV.
- **Analysis**: pair each input Note On with the routed Note On of the expected note/channel in order.
  Report count of inputs, matched outputs, unmatched, extra, late (> 100 ms). Any unmatched or extra
  event fails the run. Compute median and p99 of (output − input).
- **Pass**: median ≤ 10 ms, p99 ≤ 20 ms, zero anomalies. Harness self-test: deliberately disable **route
  pads to notes out** for one press and confirm the analysis reports one unmatched input.
- **Result**: _pending_ · evidence: `logs/g5-monitor-*.txt`, `logs/g5-inpage-*.csv`, analysis notes

### G6 Endurance and transitions

- **Method**: **Start endurance timer**. Run Live for 20 minutes at 60, 120 and 200 bpm (three runs) in
  4/4, playing pads occasionally. During each run: press Stop and Play, click to another bar, play
  through a loop wrap, unplug and replug the Launchpad once. Compare the harness position pill with
  Live's bar counter at the end. Fourth run: 7/16 or 6/8 in Live for 5 minutes (the harness displays 4/4
  bars; note the mismatch, the point is stability).
- **Pass**: position matches Live's bar at the end of each run (or re-aligns after the next SPP); no held
  notes remain; every transition logged as expected; Live stayed in the foreground.
- **Result**: _pending_ · evidence: `logs/g6-*.json` (export summary at the end of each run)

### G7 Colour and flash

- **Method**: **Paint role rows**: rows top→bottom are chordRoot, third, fifth, seventh, extension,
  scale, keyRoot, pressed, each ramping dim→bright left→right. Judge at arm's length under normal room
  light: can every row be told apart from every other at the brightness the plan intends (root
  brightest, chord tones full, scale dim)? **Palette page 0–63** and **64–127**: find the bright pink and
  dim pink indices (press a pad while a palette page is shown to log its index), enter them as flash A/B,
  **Flash row 1**, **Pulse row 2**. Press play in Live with clock forwarding on: flash should be
  beat-locked. Check phase after Start from 1.1.1, after Continue mid-bar, and after unplug/replug while
  playing.
- **Pass**: all roles distinguishable; pink pair chosen (record the indices); flash is on the beat in all
  three cases, or the fail is recorded and the software flash fallback is adopted.
- **Result**: _pending_ · chosen palette: A = _, B = _ · evidence: photo or notes

### G8 Web MIDI lifecycle

- **Method**: Load the harness in a fresh Chrome profile: observe the SysEx permission prompt and deny
  it once (log shows the denied state), then allow. Unplug the Launchpad while in Programmer mode: the
  log shows the disconnect and releases held notes. Replug: the log shows `LP reconnected … ms after
disconnect`, then `layout changed → Programmer … [reconnect→programmer N ms]` and a full repaint.
  Repeat five times.
- **Pass**: reconnect→Programmer+repaint ≤ 2,000 ms from the port-available event, every time; the
  position pill is unaffected by the Launchpad reconnect while Live keeps playing.
- **Result**: _pending_ · evidence: `logs/g8-*.json`

## Decisions fed back into the plan (gate review, M1-T11)

| Question                                   | Answer | Consequence                     |
| ------------------------------------------ | ------ | ------------------------------- |
| Live control surface: coexist or disable?  |        | setup guide / §4.2              |
| Hardware flash phase reliable?             |        | §4.3 hardware vs software flash |
| Stopped seek: SPP alone or SPP + Continue? |        | §4.4 receiver contract          |
| Loop wrap: what does Live send?            |        | §4.4 sheet-loop guidance        |
| Pink palette pair                          |        | theme defaults                  |
| Index map matches the reference?           |        | driver constants                |
