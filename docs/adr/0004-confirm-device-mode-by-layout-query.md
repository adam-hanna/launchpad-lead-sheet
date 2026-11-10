# ADR-0004: Confirm the device mode by layout query, not by notification

Status: Accepted
Date: 2026-11-10

## Context

Plan §3.2 and §4.2 assumed the Launchpad Pro MK3 announces every layout change, so entering Programmer
mode was confirmed by waiting for a layout-changed message. A CoreMIDI probe of the real device during
gate G1 (`docs/spikes/logs/g1-coremidi-probe-2026-11-10.txt`) showed that after a SysEx mode command
(`0E 01` or `0E 00`) nothing arrives within 2.5 s, while a layout query is answered within 1 ms with the
new layout. With the code as written, "Take the Launchpad" would never leave _acquiring_.

## Decision

Every mode command the app sends (enter Programmer, restore Live, automatic re-entry after a replug or a
kick-out) is followed immediately by a layout query. The reply feeds the same `layoutObserved` event as
an unsolicited layout-change message, so the ownership state machine is unchanged; only the adapter
effect handler gained the query. The spike harness does the same.

## Consequences

- Confirmation arrives about 1 ms after the command instead of never; the complete frame follows it.
- Detection of a kick-out initiated from the hardware or by another program still relies on unsolicited
  layout messages. Whether the device sends them for hardware-initiated changes is gate G2's question;
  if it does not, a periodic layout poll while desired = ours is the follow-up (cheap: 8 bytes out, 11
  back).
- The protocol note now records the verified inquiry family bytes (`23 01`) and the device's own clock
  output on the MIDI port.
