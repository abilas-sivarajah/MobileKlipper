import { describe, expect, it } from 'vitest';
import {
  getEtaEstimates,
  getFans,
  getFileAbsoluteProgress,
  getFileRelativeProgress,
  getFilamentSensors,
  getFilamentUsage,
  getHeaters,
  getHomedAxes,
  getLayerInfo,
  getMacros,
  getOutputPins,
  getPrintObjects,
  getProgress,
  getSensors,
  isPrinting,
} from '@/lib/derive';
import { printerStatus } from './fixtures';

describe('getHeaters', () => {
  it('finds extruder, bed and generic heaters with their config limits', () => {
    const heaters = getHeaters(printerStatus());
    expect(heaters.map((h) => h.key)).toEqual(['extruder', 'heater_bed', 'heater_generic chamber']);
    expect(heaters[0]).toMatchObject({ kind: 'extruder', target: 250, maxTemp: 300 });
    expect(heaters[1]).toMatchObject({ kind: 'bed', maxTemp: 120, name: 'Heizbett' });
    expect(heaters[2]).toMatchObject({ kind: 'generic', name: 'Chamber', maxTemp: 70 });
  });

  it('ignores temperature sensors, which have no target', () => {
    const heaters = getHeaters(printerStatus());
    expect(heaters.some((h) => h.key.startsWith('temperature_sensor'))).toBe(false);
  });

  it('falls back to a sane max when the config is not loaded yet', () => {
    const heaters = getHeaters({ extruder: { temperature: 20, target: 0 } });
    expect(heaters[0]?.maxTemp).toBe(300);
  });
});

describe('getSensors and getFans', () => {
  it('lists sensors with their measured range', () => {
    const sensors = getSensors(printerStatus());
    expect(sensors).toHaveLength(1);
    expect(sensors[0]).toMatchObject({ name: 'Mcu', temperature: 41, min: 30, max: 45 });
  });

  it('marks heater fans as not controllable', () => {
    const fans = getFans(printerStatus());
    expect(fans.map((f) => f.key)).toEqual(['fan', 'fan_generic filter', 'heater_fan hotend_fan']);
    expect(fans[0]).toMatchObject({ kind: 'part', controllable: true });
    expect(fans[2]).toMatchObject({ kind: 'monitored', controllable: false, rpm: 6200 });
  });

  it('reads output pin scale and pwm flag from the config', () => {
    const pins = getOutputPins(printerStatus());
    expect(pins[0]).toMatchObject({ name: 'Caselight', value: 0.5, isPwm: true, scale: 1 });
  });
});

describe('getMacros', () => {
  it('hides underscore-prefixed helpers unless asked', () => {
    const visible = getMacros(printerStatus());
    expect(visible.map((m) => m.name)).toEqual(['START_PRINT']);
    expect(visible[0]?.description).toBe('Heizt auf');

    const all = getMacros(printerStatus(), true);
    expect(all.map((m) => m.name)).toEqual(['_HELPER', 'START_PRINT']);
  });

  it('returns nothing when the config has not arrived', () => {
    expect(getMacros({})).toEqual([]);
  });
});

describe('progress and state', () => {
  const meta = { filename: 'prints/voron_cube.gcode' };

  it('measures progress over the printable part of the file', () => {
    // 1 MB of thumbnails up front and a config block at the end are bytes the
    // printer streams but does not print, so they must not count as progress.
    const status = printerStatus({
      virtual_sdcard: { progress: 0.5, file_position: 6_000_000, file_size: 12_000_000 },
    });
    const metadata = { ...meta, gcode_start_byte: 1_000_000, gcode_end_byte: 11_000_000 };
    expect(getFileRelativeProgress(status, metadata)).toBeCloseTo(0.5, 5);
    expect(getFileAbsoluteProgress(status)).toBeCloseTo(0.5, 5);

    // Same position, but the printable span sits later in the file.
    const shifted = { ...meta, gcode_start_byte: 2_000_000, gcode_end_byte: 10_000_000 };
    expect(getFileRelativeProgress(status, shifted)).toBeCloseTo(0.5, 5);
    const trailing = { ...meta, gcode_start_byte: 0, gcode_end_byte: 8_000_000 };
    expect(getFileRelativeProgress(status, trailing)).toBeCloseTo(0.75, 5);
  });

  it('clamps to the ends of the printable span', () => {
    const metadata = { ...meta, gcode_start_byte: 1000, gcode_end_byte: 2000 };
    expect(
      getFileRelativeProgress(printerStatus({ virtual_sdcard: { file_position: 500 } }), metadata),
    ).toBe(0);
    expect(
      getFileRelativeProgress(printerStatus({ virtual_sdcard: { file_position: 9000 } }), metadata),
    ).toBe(1);
  });

  it('falls back to the raw progress without byte metadata', () => {
    expect(getFileRelativeProgress(printerStatus(), null)).toBeCloseTo(0.3);
  });

  it('ignores metadata belonging to a different file', () => {
    const status = printerStatus({
      virtual_sdcard: { progress: 0.3, file_position: 6_000_000 },
    });
    const stale = {
      filename: 'prints/something_else.gcode',
      gcode_start_byte: 0,
      gcode_end_byte: 8_000_000,
    };
    expect(getFileRelativeProgress(status, stale)).toBeCloseTo(0.3);
  });

  it('selects the source the user configured', () => {
    const status = printerStatus({
      virtual_sdcard: { progress: 0.3, file_position: 6_000_000 },
      display_status: { progress: 0.42 },
      print_stats: { filename: 'prints/voron_cube.gcode', filament_used: 2000 },
    });
    const metadata = { ...meta, filament_total: 8000 };
    expect(getProgress(status, metadata, 'file-absolute')).toBeCloseTo(0.3);
    expect(getProgress(status, metadata, 'slicer')).toBeCloseTo(0.42);
    expect(getProgress(status, metadata, 'filament')).toBeCloseTo(0.25);
  });

  it('clamps out-of-range values', () => {
    expect(getProgress(printerStatus({ virtual_sdcard: { progress: 1.4 } }))).toBe(1);
    expect(getProgress(printerStatus({ virtual_sdcard: { progress: -2 } }))).toBe(0);
  });

  it('treats paused as printing', () => {
    expect(isPrinting(printerStatus())).toBe(true);
    expect(isPrinting(printerStatus({ print_stats: { state: 'paused' } }))).toBe(true);
    expect(isPrinting(printerStatus({ print_stats: { state: 'complete' } }))).toBe(false);
  });

  it('reports which axes are homed', () => {
    expect(getHomedAxes(printerStatus())).toEqual({ x: true, y: true, z: false });
    expect(getHomedAxes({})).toEqual({ x: false, y: false, z: false });
  });

  it('reads filament sensors', () => {
    expect(getFilamentSensors(printerStatus())[0]).toMatchObject({
      name: 'Runout',
      detected: true,
      enabled: true,
    });
  });
});

describe('getEtaEstimates', () => {
  const meta = { filename: 'prints/voron_cube.gcode' };

  it('extrapolates remaining time from elapsed time over progress', () => {
    // 1200 s spent for 30 % done implies 4000 s total, so 2800 s remain.
    const { file } = getEtaEstimates(printerStatus());
    expect(file).toBeCloseTo(2800, 0);
  });

  it('subtracts elapsed time from the slicer estimate', () => {
    const { slicer } = getEtaEstimates(printerStatus(), { ...meta, estimated_time: 5000 });
    expect(slicer).toBe(3800);
  });

  it('derives an estimate from filament consumed', () => {
    // 3100 mm of 10 000 mm used (31 %) after 1200 s.
    const { filament } = getEtaEstimates(printerStatus(), { ...meta, filament_total: 10_000 });
    expect(filament).toBeCloseTo(2670.97, 1);
  });

  it('drops a slicer estimate the print has already overrun', () => {
    const { slicer, remaining } = getEtaEstimates(printerStatus(), {
      ...meta,
      estimated_time: 600,
    });
    expect(slicer).toBeNull();
    // A zero would drag the average towards "almost done"; it is left out.
    expect(remaining).toBeCloseTo(2800, 0);
  });

  it('leaves the slicer estimate out of the headline, as Mainsail does', () => {
    const metadata = { ...meta, estimated_time: 5000, filament_total: 10_000 };
    const { file, filament, slicer, remaining, eta } = getEtaEstimates(printerStatus(), metadata);
    expect(remaining).toBeCloseTo((file! + filament!) / 2, 0);
    expect(eta).toBeCloseTo((file! + filament! + slicer!) / 3, 0);
    expect(remaining).not.toBeCloseTo(eta!, 0);
  });

  it('honours a custom source selection', () => {
    const metadata = { ...meta, estimated_time: 5000, filament_total: 10_000 };
    const { slicer, remaining } = getEtaEstimates(printerStatus(), metadata, {
      remainingSources: ['slicer'],
    });
    expect(remaining).toBe(slicer);
  });

  it('returns nulls before anything has been printed', () => {
    const status = printerStatus({
      print_stats: { print_duration: 0, filament_used: 0 },
      virtual_sdcard: { progress: 0 },
      display_status: { progress: 0 },
    });
    expect(getEtaEstimates(status)).toEqual({
      file: null,
      slicer: null,
      filament: null,
      remaining: null,
      eta: null,
    });
  });

  it('reproduces the values Mainsail showed for a real print', () => {
    // Captured from a Mainsail dashboard mid-print (GOKU SSJ4_PLA_12h41m.gcode):
    // Estimate 15:40:23, Slicer 12:01:44, Total 0:42:06, ETA 04:36 +1.
    // print_duration and estimated_time follow exactly from the Slicer field and
    // the filename; the byte offsets are reconstructed to land on the observed
    // file estimate, so the expectations allow a few seconds of slack.
    const status = printerStatus({
      print_stats: {
        filename: 'GOKU SSJ4_PLA_12h41m.gcode',
        state: 'printing',
        print_duration: 2385,
        total_duration: 2526,
        filament_used: 2350,
      },
      virtual_sdcard: { progress: 0.038372, file_position: 2_310_000, file_size: 60_200_000 },
    });
    const metadata = {
      filename: 'GOKU SSJ4_PLA_12h41m.gcode',
      estimated_time: 45_689,
      filament_total: 52_085,
      gcode_start_byte: 100_000,
      gcode_end_byte: 60_100_000,
    };

    const { file, filament, slicer, remaining, eta } = getEtaEstimates(status, metadata);
    expect(slicer).toBe(43_304); // 12:01:44, exactly as shown
    expect(file).toBeCloseTo(62_369, -1);
    expect(filament).toBeCloseTo(50_477, -1);
    expect(remaining).toBeCloseTo(56_423, -1); // 15:40:23, the "Estimate" field
    expect(eta).toBeCloseTo(52_050, -1); // 14:27:30 before the 04:36 finish time

    // Averaging all three into the headline is what made us show 14:18 instead.
    const allThree = getEtaEstimates(status, metadata, {
      remainingSources: ['file', 'filament', 'slicer'],
    });
    expect(allThree.remaining).toBeCloseTo(52_050, -1);
  });
});

describe('getLayerInfo', () => {
  it('uses the values Klipper reports when the slicer sets them', () => {
    expect(getLayerInfo(printerStatus())).toEqual({ current: 60, total: 200 });
  });

  it('derives layers from Z height and slicer metadata otherwise', () => {
    const status = printerStatus({ print_stats: { state: 'printing' } });
    // First layer 0.24, then 0.2 steps: Z 12.24 is layer 61 of a 40 mm object.
    expect(getLayerInfo(status, {
      layer_height: 0.2,
      first_layer_height: 0.24,
      object_height: 40,
    })).toEqual({ current: 61, total: 200 });
  });

  it('gives up when there is no metadata to work with', () => {
    const status = printerStatus({ print_stats: { state: 'printing' } });
    expect(getLayerInfo(status)).toEqual({ current: null, total: null });
  });
});

describe('getFilamentUsage', () => {
  const filename = 'prints/voron_cube.gcode';

  it('scales the slicer weight by the fraction used', () => {
    // 3100 of 10 000 mm used, and the slicer recorded 30 g for the whole print.
    const usage = getFilamentUsage(printerStatus(), {
      filename,
      filament_total: 10_000,
      filament_weight_total: 30,
    });
    expect(usage.lengthMm).toBe(3100);
    expect(usage.grams).toBeCloseTo(9.3, 3);
    expect(usage.estimated).toBe(false);
  });

  it('reports no weight when the slicer did not record one', () => {
    const usage = getFilamentUsage(printerStatus(), { filename, filament_total: 10_000 });
    expect(usage.grams).toBeNull();
    expect(usage.estimated).toBe(true);
  });

  it('ignores a weight from another file', () => {
    const usage = getFilamentUsage(printerStatus(), {
      filename: 'prints/other.gcode',
      filament_total: 10_000,
      filament_weight_total: 30,
    });
    expect(usage.grams).toBeNull();
  });
});

describe('segmented bed naming', () => {
  it('names the outer zone of a Neptune 4 Pro bed', () => {
    const heaters = getHeaters({
      heater_bed: { temperature: 60, target: 60 },
      'heater_generic heater_bed_outer': { temperature: 59, target: 60 },
      'heater_generic heater_bed1': { temperature: 20, target: 0 },
      'heater_generic chamber': { temperature: 30, target: 0 },
    });
    expect(heaters.map((h) => h.name)).toEqual(['Heizbett', 'Heizbett außen', 'Heizbett 1', 'Chamber']);
  });
});

describe('getPrintObjects', () => {
  it('marks excluded and current objects', () => {
    const objects = getPrintObjects({
      exclude_object: {
        objects: [
          { name: 'A', center: [10, 20], polygon: [[0, 0], [20, 0], [20, 40]] },
          { name: 'B', center: [50, 50] },
          { name: 'C' },
        ],
        excluded_objects: ['B'],
        current_object: 'A',
      },
    });
    expect(objects).toEqual([
      { name: 'A', center: [10, 20], polygon: [[0, 0], [20, 0], [20, 40]], excluded: false, current: true },
      { name: 'B', center: [50, 50], polygon: [], excluded: true, current: false },
      { name: 'C', center: null, polygon: [], excluded: false, current: false },
    ]);
  });

  it('is empty without exclude_object', () => {
    expect(getPrintObjects({})).toEqual([]);
  });
});
