import { describe, expect, it } from 'vitest';
import { defaultVisible, orderSeriesKeys, seriesColor, SERIES_SLOTS } from '@/lib/palette';

const KEYS = [
  'temperature_sensor mcu',
  'heater_bed',
  'extruder',
  'heater_generic chamber',
  'temperature_fan exhaust',
];

describe('orderSeriesKeys', () => {
  it('puts the hotend first and the bed second, so the hues match convention', () => {
    expect(orderSeriesKeys(KEYS)).toEqual([
      'extruder',
      'heater_bed',
      'heater_generic chamber',
      'temperature_fan exhaust',
      'temperature_sensor mcu',
    ]);
  });

  it('is stable regardless of the order Klipper reports objects in', () => {
    expect(orderSeriesKeys([...KEYS].reverse())).toEqual(orderSeriesKeys(KEYS));
  });
});

describe('seriesColor', () => {
  const ordered = orderSeriesKeys(KEYS);

  it('assigns a slot per entity', () => {
    expect(seriesColor('extruder', ordered)).toBe('var(--color-series-1)');
    expect(seriesColor('heater_bed', ordered)).toBe('var(--color-series-2)');
  });

  it('keeps an entity on its slot no matter which series are visible', () => {
    // The palette must follow the entity, never its rank in a filtered list.
    expect(seriesColor('heater_bed', ordered)).toBe(seriesColor('heater_bed', ordered));
    const withoutExtruder = ordered.filter((k) => k !== 'extruder');
    expect(seriesColor('heater_bed', withoutExtruder)).not.toBe(
      seriesColor('heater_bed', ordered),
    );
  });

  it('falls back to grey past the last slot rather than cycling hues', () => {
    const many = Array.from({ length: SERIES_SLOTS + 2 }, (_, i) => `temperature_sensor s${i}`);
    const orderedMany = orderSeriesKeys(many);
    expect(seriesColor(orderedMany[SERIES_SLOTS]!, orderedMany)).toBe('var(--color-series-extra)');
  });

  it('greys out an entity it does not know', () => {
    expect(seriesColor('nope', ordered)).toBe('var(--color-series-extra)');
  });
});

describe('defaultVisible', () => {
  it('shows heaters but not ambient sensors by default', () => {
    expect(defaultVisible('extruder')).toBe(true);
    expect(defaultVisible('heater_bed')).toBe(true);
    expect(defaultVisible('heater_generic chamber')).toBe(true);
    expect(defaultVisible('temperature_sensor mcu')).toBe(false);
  });
});
