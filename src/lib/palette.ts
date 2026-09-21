/**
 * Series colours for the temperature chart.
 *
 * Colour follows the *entity*, not its position in the visible list: toggling a
 * series in the legend must never repaint the others. Slots are therefore
 * assigned from the full, stably ordered set of tracked objects.
 *
 * The eight slots are the validated categorical palette from docs/DESIGN.md;
 * slot 1 is warm and slot 2 cool so hotend/bed match the usual convention.
 */

export const SERIES_SLOTS = 8;

function rankOf(key: string): number {
  if (/^extruder\d*$/.test(key)) return 0;
  if (key === 'heater_bed') return 1;
  if (key.startsWith('heater_generic ')) return 2;
  if (key.startsWith('temperature_fan ')) return 3;
  return 4;
}

/** Stable ordering: extruders, bed, generic heaters, fans, then sensors. */
export function orderSeriesKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

/**
 * CSS colour for a series. Keys past the eighth share a neutral grey rather
 * than cycling hues, which would make two entities look like one.
 */
export function seriesColor(key: string, orderedKeys: string[]): string {
  const index = orderedKeys.indexOf(key);
  if (index < 0 || index >= SERIES_SLOTS) return 'var(--color-series-extra)';
  return `var(--color-series-${index + 1})`;
}

/** Heaters are on by default; ambient sensors would just add clutter. */
export function defaultVisible(key: string): boolean {
  return rankOf(key) <= 2;
}
