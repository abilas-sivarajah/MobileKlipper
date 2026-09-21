import { describe, expect, it } from 'vitest';
import {
  getEtaEstimates,
  getFans,
  getFilamentSensors,
  getHeaters,
  getHomedAxes,
  getLayerInfo,
  getMacros,
  getOutputPins,
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
  it('prefers the file position over the display progress', () => {
    const status = printerStatus({
      virtual_sdcard: { progress: 0.42 },
      display_status: { progress: 0.9 },
    });
    expect(getProgress(status)).toBeCloseTo(0.42);
  });

  it('falls back to display progress when no file is loaded', () => {
    expect(getProgress({ display_status: { progress: 0.25 } })).toBeCloseTo(0.25);
  });

  it('clamps out-of-range values', () => {
    expect(getProgress({ virtual_sdcard: { progress: 1.4 } })).toBe(1);
    expect(getProgress({ virtual_sdcard: { progress: -2 } })).toBe(0);
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
  it('extrapolates remaining time from elapsed time over progress', () => {
    // 1200 s spent for 30 % done implies 4000 s total, so 2800 s remain.
    const { file } = getEtaEstimates(printerStatus());
    expect(file).toBeCloseTo(2800, 0);
  });

  it('subtracts elapsed time from the slicer estimate', () => {
    const { slicer } = getEtaEstimates(printerStatus(), { estimated_time: 5000 });
    expect(slicer).toBe(3800);
  });

  it('derives an estimate from filament consumed', () => {
    // 3100 mm of 10 000 mm used (31 %) after 1200 s.
    const { filament } = getEtaEstimates(printerStatus(), { filament_total: 10_000 });
    expect(filament).toBeCloseTo(2670.97, 1);
  });

  it('averages the estimates it has', () => {
    const { best } = getEtaEstimates(printerStatus(), { estimated_time: 5000 });
    expect(best).toBeCloseTo((2800 + 3800) / 2, 0);
  });

  it('returns nulls before anything has been printed', () => {
    const status = printerStatus({
      print_stats: { print_duration: 0, filament_used: 0 },
      virtual_sdcard: { progress: 0 },
      display_status: { progress: 0 },
    });
    expect(getEtaEstimates(status)).toEqual({ file: null, slicer: null, filament: null, best: null });
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
