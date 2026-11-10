import { parseChart, type Sheet } from '@core/sheet';

export const DEMO_CHART = `title: Demo changes
time: 4/4
tempo: 120

[A]
| {C} Cmaj7 | Am7 | Dm7 G7 | Cmaj7 |
[B]
| {F} Fmaj7 | Dm7 | Gm7 C7 | Fmaj7 |
`;

/** A small built-in chart so the app lights up before any sheet is written or imported. */
export function demoSheet(id = 'demo'): Sheet {
  const r = parseChart(DEMO_CHART, id);
  if (!r.ok) throw new Error(`demo chart failed to parse: ${JSON.stringify(r.errors)}`);
  return r.sheet;
}
