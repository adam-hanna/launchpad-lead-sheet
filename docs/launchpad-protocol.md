# Launchpad Pro MK3 protocol cheat sheet

Condensed from Novation's "Launchpad Pro [MK3] Programmer's Reference Manual" (LPP3_prog_ref_guide_200415).
All values hex unless stated. This page is mirrored to the repository wiki.

## USB MIDI interfaces

| Name (macOS)    | Use                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `LPProMK3 MIDI` | Note/Chord/Custom mode output; **LED control and pad input in Programmer mode**. We use only this one. |
| `LPProMK3 DIN`  | Bridges the 5-pin DIN jacks.                                                                           |
| `LPProMK3 DAW`  | Session mode; used by Live's control surface script. Leave it to Live.                                 |

The device sends Note On with velocity 0 for Note Off. It accepts either Note Off or Note On velocity 0.

## SysEx header and identification

- Header on every SysEx, both directions: `F0 00 20 29 02 0E … F7`.
- Universal device inquiry: send `F0 7E 7F 06 01 F7`. Reply (application): `F0 7E 00 06 02 00 20 29 13 01 00 00 <v1 v2 v3 v4> F7`. Bootloader reply has `13 11` instead of `13 01`. The four version bytes are decimal digits.
- Other models for later: Launchpad X header `… 02 0C`, Mini MK3 `… 02 0D`.

## Modes and layouts

- **Programmer mode on**: `F0 00 20 29 02 0E 0E 01 F7`. **Live mode**: `… 0E 00 F7` (returns to Session layout in DAW mode, Note mode otherwise).
- Select layout: `F0 00 20 29 02 0E 00 <layout> <page> 00 F7`; Programmer layout is `11`, Session `00`, Note/Drum `04`, Settings `12`. Query current layout: `F0 00 20 29 02 0E 00 F7`.
- **The device emits a select-layout message whenever its view changes** — this is how we detect losing Programmer mode.
- DAW/Standalone: `F0 00 20 29 02 0E 10 <0|1> F7` (1 = DAW; Session layout only available in DAW mode).
- The device **always boots into Live mode**. When Programmer mode was entered by SysEx the Setup menu is unavailable; manual exit is hold SETUP → bottom scene button (orange) only when entered from the device UI.

## Programmer-mode surface map

Indices = `row*10 + col`, row 1 at the bottom, col 1 at the left. The 8x8 grid is **Notes**; surrounding buttons are **CCs**. Every pad and button accepts either Note or CC for lighting.

```
      91 92 93 94 95 96 97 98        (top row, CC)
 80 | 81 82 83 84 85 86 87 88 | 89
 70 | 71 72 73 74 75 76 77 78 | 79
 60 | 61 62 63 64 65 66 67 68 | 69
 50 | 51 52 53 54 55 56 57 58 | 59
 40 | 41 42 43 44 45 46 47 48 | 49
 30 | 31 32 33 34 35 36 37 38 | 39
 20 | 21 22 23 24 25 26 27 28 | 29
 10 | 11 12 13 14 15 16 17 18 | 19
       1  2  3  4  5  6  7  8        (bottom row, CC)
 left column 10..80 (CC)   right column 19..89 (CC)   logo 99 (CC, light only)
```

Grid pads send **Note On** (channel 1) with velocity; **aftertouch** is polyphonic or channel pressure depending on the device's setting. Verified against hardware in gate G1 (`docs/spikes/`).

## Lighting

### By channel (Note On or CC, value = palette index)

| Channel | Status (note / CC) | Behaviour                                                                                                 |
| ------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| 1       | `90` / `B0`        | Static palette colour                                                                                     |
| 2       | `91` / `B1`        | Flashing between colour A (current static/pulse colour) and B (this value), 50% duty, **one beat period** |
| 3       | `92` / `B2`        | Pulsing dark ↔ full, **two beat period**                                                                  |

Velocity/value 0 turns the LED off. Flash and pulse are synchronised to **MIDI beat clock received on the MIDI port** (fallback 120 bpm). Forward Live's clock to the device for beat-locked flashing.

### By SysEx (preferred; whole surface in one message)

`F0 00 20 29 02 0E 03 <spec> [<spec> …] F7`, up to **106 specs**.

| Type | Spec bytes                         | Meaning               |
| ---- | ---------------------------------- | --------------------- |
| `00` | `00 <index> <palette>`             | Static palette colour |
| `01` | `01 <index> <paletteB> <paletteA>` | Flash between B and A |
| `02` | `02 <index> <palette>`             | Pulse                 |
| `03` | `03 <index> <r> <g> <b>`           | Static RGB, each 0–7F |

Example: `F0 00 20 29 02 0E 03 00 0B 0D 01 0C 15 17 02 0D 25 F7` lights pad 11 static yellow, pad 12 flashing green, pad 13 pulsing turquoise.

Consequences for us: **flashing is palette-only**; RGB is static-only. Theme roles that flash (the root) must map to palette entries. Palette indices for pinks are chosen in gate G7.

## Palette landmarks (verify on hardware)

`00` off · `01`–`03` greys/white · `05` red · `09` orange · `0D` yellow · `15` green · `25` turquoise · `2D` blue · `35` magenta-ish. Full 128-entry table is in the reference; dim variants sit next to bright ones.

## What the reference does not provide (Pro MK3)

- No text-scrolling SysEx (Mini MK3 / X have one).
- No SysEx to set Note mode scale/root.
- No brightness SysEx; brightness is a device setting.

## MIDI realtime we consume from Live

| Byte       | Message                                                 | Our handling (plan §4.4)                                       |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `F8`       | Timing Clock, 24 per quarter note                       | Advances position while intent = play; re-arms the clock timer |
| `FA`       | Start                                                   | Position 1.1.1 pending, valid, intent play                     |
| `FB`       | Continue                                                | Intent play; validity unchanged                                |
| `FC`       | Stop                                                    | Intent stop; position kept                                     |
| `F2 ll hh` | Song Position Pointer in 16th notes (14-bit, LSB first) | Position set, valid; intent unchanged                          |
