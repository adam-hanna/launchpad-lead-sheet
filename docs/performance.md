# Performance notes (roadmap M7-T10)

What the app does per MIDI clock tick, what that costs, and how it behaves in a background tab. Numbers
were measured on the test fake (no real MIDI latency) with the demo chart, 200 bars of 4/4 at 24 ticks per
quarter, in Node via Vitest on an Apple-silicon Mac; treat them as orders of magnitude.

## Render path

1. `ClockEngine` ingests the tick and emits a snapshot only when the transport snapshot changed (every tick
   while playing, because the tick-in-bar changes).
2. `SessionController.render()` resolves the current bar, builds the grid mapping, computes the look-ahead
   set, renders a full 8x8 frame and diffs it against the cached device frame (`FrameRenderer`).
3. Only the LEDs that changed are encoded as one SysEx message (up to 106 LED specs per message; a full
   64-pad repaint is 1 message of 328 bytes). Most ticks change nothing, so most ticks send nothing: the
   hardware sees SysEx at bar and half-bar boundaries, on pad press and release, and on settings changes.
4. The controller emits a snapshot to the store; the store forwards the latest one to React once per
   animation frame (`animationFrameScheduler` in `src/app/state/store.ts`).

## Budget and measurement

| Measure                                                  | Value                                             |
| -------------------------------------------------------- | ------------------------------------------------- |
| Controller cost per clock tick (steps 1–3 plus snapshot) | ≈ 13 µs                                           |
| Ticks per second at 120 bpm                              | 48                                                |
| CPU spent in the controller at 120 bpm                   | ≈ 0.6 ms/s, under 0.1 % of one core               |
| SysEx messages per bar while nothing is pressed          | 1 (bar change) or 2 (split bar)                   |
| Full repaint (take-over, reconnect, failed send)         | 1 message, 328 bytes                              |
| React commits per second while playing                   | ≤ display refresh rate (coalesced), 0 when hidden |

The per-tick cost is linear in the number of sheet bars only through `resolve`, which is memoised per
sheet in the controller; it does not grow with tempo beyond the tick rate.

## Rate limiting

There is no explicit SysEx rate limiter because the design already bounds the rate: at most one diff per
state change, each diff at most one message for the grid, and the clock cannot produce more than one state
change per tick. The pathological case is a pad hammered faster than the clock, which produces one
press-feedback diff (a handful of LEDs) per Note On/Off; the device absorbs this comfortably (gate G6
measures the LED update latency on hardware). If hardware testing ever shows the device dropping SysEx,
the right place for a limiter is `ProMk3Port.send`, coalescing specs by pad before encoding.

## Idle CPU

With the transport stopped nothing runs: no timers, no polling. The only periodic work is the virtual
Launchpad's 250 ms flash emulation, and that interval exists only while no clock is running
(`useFlashPhase`), so it stops the moment Live plays. While clock is running the controller keeps exactly
one clock-lost `setTimeout` armed, cleared and re-armed on each tick to the engine's next deadline; it
fires only when the clock actually stops.

## Background tab

- Web MIDI input callbacks keep firing in a hidden tab, so LEDs and notes stay in sync with Live.
- `requestAnimationFrame` does not fire while hidden, so the React tree stops updating and costs nothing.
  The pending snapshot is applied on `visibilitychange`, so the UI is current when the tab is shown.
- Chromium throttles `setTimeout` in hidden tabs to one wake-up per second (and to one per minute after
  five minutes hidden for chained timers). The clock-lost timeout is 500 ms, so "Clock lost" may be
  reported late while the tab is hidden; it is never reported falsely, because the engine checks the real
  elapsed time when the timer fires. Autosave's debounce is similarly delayed, and `pagehide` flushes it.
- Keep the app in its own window rather than a tab behind Live if you want the chart sweep to animate;
  the hardware does not care.
