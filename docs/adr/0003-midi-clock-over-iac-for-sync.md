# ADR-0003: Follow Live via MIDI clock and SPP over IAC

Status: Accepted
Date: 2026-11-09

## Context

With no in-Live component (ADR-0001), transport position must arrive over MIDI. Live can send MIDI
Clock, Start/Stop/Continue and, with MIDI Clock Type set to Song, Song Position Pointer. Ableton Link
has no browser API; MIDI Time Code cannot be sent by Live. See `docs/plan.md` §4.4.

## Decision

Live sends sync to an IAC bus (`LS Clock`) with MIDI Clock Type = Song. The ClockEngine treats Start and
SPP as authoritative, counts Clock ticks between them, tracks position validity separately from play
intent, and never infers progress from wall-clock time. A sheet-level loop range is a pure mapping on the
derived bar so it cannot conflict with SPP.

## Consequences

- Live's meter must match the sheet meter from bar 1 through the sheet; v1 does not read Live's meter.
- Starting the app mid-song leaves it `unsynced` until the next Start or SPP.
- Exact Live sequences for seeks and loop wraps are recorded in gate G3 and replayed as tests.
- A later Tauri shell may add Link as a second, higher-precision source.
