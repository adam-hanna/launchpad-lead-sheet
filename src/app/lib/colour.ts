import type { RGB } from '@core/lighting';

/** Inverse of the display gamma in adapters/virtual/displayColours (0.7): CSS hex → Launchpad 0–127. */
export function hexToRgb127(hex: string): RGB {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.padEnd(6, '0').slice(0, 6);
  const ch = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    const unit = Number.isFinite(v) ? Math.max(0, Math.min(255, v)) / 255 : 0;
    return Math.round(127 * Math.pow(unit, 1 / 0.7));
  };
  return [ch(0), ch(2), ch(4)];
}

/** Launchpad 0–127 → CSS hex using the display gamma, for colour inputs. */
export function rgb127ToHex(rgb: RGB): string {
  const ch = (v: number) =>
    Math.round(255 * Math.pow(Math.max(0, Math.min(127, v)) / 127, 0.7))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(rgb[0])}${ch(rgb[1])}${ch(rgb[2])}`;
}
