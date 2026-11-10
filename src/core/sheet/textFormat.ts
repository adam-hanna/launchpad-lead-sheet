import { formatKey } from '../theory';
import type { Bar, Sheet } from './types';

export interface FormatOptions {
  /** Bars per line. */
  readonly barsPerLine?: number;
}

/**
 * Canonical text export. Stable: `formatChart(parseChart(formatChart(s)))` equals `formatChart(s)`.
 * `%` is never emitted (it was expanded on import); inherit cells are empty; N.C. is `N.C.`.
 */
export function formatChart(sheet: Sheet, options: FormatOptions = {}): string {
  const perLine = options.barsPerLine ?? 4;
  const out: string[] = [];
  out.push(`title: ${sheet.title}`);
  out.push(`time: ${String(sheet.meter.numerator)}/${String(sheet.meter.denominator)}`);
  if (sheet.tempoNote !== undefined) out.push(`tempo: ${String(sheet.tempoNote)}`);
  if (sheet.originBar !== 1) out.push(`origin: ${String(sheet.originBar)}`);
  if (sheet.loop) out.push(`loop: ${String(sheet.loop.startBar)}-${String(sheet.loop.endBar)}`);
  if (sheet.bars.length) out.push('');

  let lineCells: string[] = [];
  const flush = () => {
    if (lineCells.length) out.push(`| ${lineCells.join(' | ')} |`);
    lineCells = [];
  };
  sheet.bars.forEach((bar, i) => {
    if (bar.section !== undefined) {
      flush();
      if (i > 0) out.push('');
      out.push(`[${bar.section}]`);
    }
    lineCells.push(formatCell(bar));
    if (lineCells.length === perLine) flush();
  });
  flush();
  return out.join('\n') + '\n';
}

function formatCell(bar: Bar): string {
  const parts: string[] = [];
  if (bar.key === null) parts.push('{-}');
  else if (bar.key !== undefined) parts.push(`{${formatKey(bar.key)}}`);
  if (bar.chords !== undefined)
    parts.push(bar.chords.length ? bar.chords.map((c) => c.symbol).join(' ') : 'N.C.');
  return parts.join(' ');
}
