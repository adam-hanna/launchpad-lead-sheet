# ADR-0001: Browser companion app instead of a Max for Live device

Status: Accepted
Date: 2026-11-09

## Context

The app must follow Live's transport and light a Launchpad. A Max for Live device would read Live's
transport directly and save state inside the Set, but it requires Live Suite or the Max for Live add-on,
which the project owner does not have and does not want to buy. A Remote Script would need Live's
undocumented Python API. See `docs/brainstorm.md` §3.2.

## Decision

Build a standalone browser app (macOS, Chromium, Web MIDI) that runs alongside Live and talks to it over
the macOS IAC Driver. Any Live edition works.

## Consequences

- Sync must come from MIDI (clock, Start/Stop, SPP), not from Live's object model (ADR-0003).
- Users perform a one-time IAC and Live preferences setup (`docs/live-setup.md`).
- A later Tauri shell can add virtual ports and Ableton Link without changing the domain code.
