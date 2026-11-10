# ADR-0002: Programmer mode with an app-defined pad layout

Status: Accepted
Date: 2026-11-09

## Context

Only Programmer mode gives full control of every LED on the Launchpad Pro MK3. In that mode pads send
grid indices (11–88), not musical notes, and all built-in functionality (Note mode, Session mode, Setup
menu) is disabled. See the programmer's reference and `docs/plan.md` §4.2.

## Decision

Drive the device in Programmer mode over the `LPProMK3 MIDI` port. The app owns the pad-to-note mapping,
forwards notes to Live on an IAC bus, and owns press feedback. It re-enters Programmer mode on
reconnect and restores Live mode on request.

## Consequences

- Session mode cannot run simultaneously; "keeping it" means fast hand-back (post-v1).
- Layout customisation lives in the app; the device's own scale settings are inert.
- Note ownership, cleanup and recovery contracts (§4.1, §4.2) are required for correctness.
- If the browser dies, the user power-cycles the Launchpad (it boots into Live mode).
