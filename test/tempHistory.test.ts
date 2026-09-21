import { describe, expect, it } from 'vitest';
import {
  appendSample,
  emptyHistory,
  seedHistory,
  TEMP_HISTORY_POINTS,
} from '@/lib/tempHistory';
import { printerStatus } from './fixtures';

describe('seedHistory', () => {
  it('takes the series from a temperature_store response', () => {
    const history = seedHistory({
      extruder: { temperatures: [200, 201, 202], targets: [210, 210, 210] },
      'temperature_sensor mcu': { temperatures: [40, 41] },
    });
    expect(history.series.extruder?.temperatures).toEqual([200, 201, 202]);
    expect(history.series.extruder?.hasTarget).toBe(true);
    expect(history.series['temperature_sensor mcu']?.hasTarget).toBe(false);
    expect(history.length).toBe(3);
  });

  it('pads targets when the store omits them', () => {
    const history = seedHistory({ heater_bed: { temperatures: [60, 60, 60] } });
    expect(history.series.heater_bed?.targets).toEqual([0, 0, 0]);
  });
});

describe('appendSample', () => {
  it('adds one point per tracked object', () => {
    const history = appendSample(emptyHistory(), printerStatus(), 1000);
    expect(Object.keys(history.series).sort()).toEqual([
      'extruder',
      'heater_bed',
      'heater_generic chamber',
      'temperature_sensor mcu',
    ]);
    expect(history.series.extruder?.temperatures).toEqual([248.4]);
    expect(history.series.extruder?.targets).toEqual([250]);
  });

  it('ignores samples that arrive inside the throttle window', () => {
    const first = appendSample(emptyHistory(), printerStatus(), 1000);
    const second = appendSample(first, printerStatus(), 1200);
    expect(second).toBe(first);

    const third = appendSample(first, printerStatus(), 2000);
    expect(third.series.extruder?.temperatures).toHaveLength(2);
  });

  it('keeps the buffer bounded', () => {
    let history = emptyHistory();
    for (let i = 0; i < TEMP_HISTORY_POINTS + 50; i++) {
      history = appendSample(history, printerStatus(), 1000 + i * 1000);
    }
    expect(history.series.extruder?.temperatures).toHaveLength(TEMP_HISTORY_POINTS);
    expect(history.length).toBe(TEMP_HISTORY_POINTS);
  });

  it('keeps series that are missing from a sparse status patch', () => {
    const first = appendSample(emptyHistory(), printerStatus(), 1000);
    const patch = appendSample(first, { extruder: { temperature: 249 } }, 2000);
    expect(patch.series.heater_bed?.temperatures).toHaveLength(1);
    expect(patch.series.extruder?.temperatures).toEqual([248.4, 249]);
  });

  it('does nothing when the status has no temperatures at all', () => {
    const history = emptyHistory();
    expect(appendSample(history, { toolhead: { homed_axes: 'xyz' } }, 5000)).toBe(history);
  });
});
