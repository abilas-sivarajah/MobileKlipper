/**
 * Rolling temperature history for the dashboard chart.
 *
 * Moonraker's `server.temperature_store` hands out the last ~20 minutes at 1 Hz,
 * which seeds the buffer; live status updates then extend it, throttled to one
 * sample per second so all series stay index-aligned on a shared time base.
 */
import type { PrinterStatus, TemperatureStore } from '@/moonraker/types';

export const TEMP_HISTORY_POINTS = 1200;
export const SAMPLE_INTERVAL_MS = 1000;

export interface TempSeries {
  temperatures: number[];
  targets: number[];
  /** True for heaters and temperature_fans, i.e. series that have a setpoint. */
  hasTarget: boolean;
}

export interface TempHistory {
  series: Record<string, TempSeries>;
  /** Epoch ms of the newest sample. */
  lastSampleAt: number;
  length: number;
}

export function emptyHistory(): TempHistory {
  return { series: {}, lastSampleAt: 0, length: 0 };
}

function isTrackedObject(key: string): boolean {
  return (
    key === 'heater_bed' ||
    /^extruder\d*$/.test(key) ||
    key.startsWith('heater_generic ') ||
    key.startsWith('temperature_sensor ') ||
    key.startsWith('temperature_fan ')
  );
}

function hasTargetField(key: string): boolean {
  return !key.startsWith('temperature_sensor ');
}

/** Builds history from a `server.temperature_store` response. */
export function seedHistory(store: TemperatureStore, now = Date.now()): TempHistory {
  const series: Record<string, TempSeries> = {};
  let length = 0;
  for (const [key, entry] of Object.entries(store)) {
    if (!entry?.temperatures) continue;
    const temperatures = entry.temperatures.slice(-TEMP_HISTORY_POINTS);
    const targets = (entry.targets ?? []).slice(-TEMP_HISTORY_POINTS);
    series[key] = {
      temperatures,
      targets: targets.length === temperatures.length ? targets : temperatures.map(() => 0),
      hasTarget: hasTargetField(key) && (entry.targets?.length ?? 0) > 0,
    };
    length = Math.max(length, temperatures.length);
  }
  return { series, lastSampleAt: now, length };
}

/**
 * Appends one sample per tracked object. Returns the unchanged history when the
 * throttle window has not elapsed, so callers can pass it straight into state.
 */
export function appendSample(
  history: TempHistory,
  status: PrinterStatus,
  now = Date.now(),
  intervalMs = SAMPLE_INTERVAL_MS,
): TempHistory {
  if (now - history.lastSampleAt < intervalMs) return history;

  const series: Record<string, TempSeries> = {};
  let length = history.length;
  let touched = false;

  for (const [key, value] of Object.entries(status)) {
    if (!value || !isTrackedObject(key)) continue;
    const obj = value as Record<string, unknown>;
    const temperature = obj.temperature;
    if (typeof temperature !== 'number') continue;
    touched = true;

    const prev = history.series[key];
    const target = typeof obj.target === 'number' ? obj.target : 0;
    const temperatures = prev ? [...prev.temperatures, temperature] : [temperature];
    const targets = prev ? [...prev.targets, target] : [target];
    if (temperatures.length > TEMP_HISTORY_POINTS) {
      temperatures.splice(0, temperatures.length - TEMP_HISTORY_POINTS);
      targets.splice(0, targets.length - TEMP_HISTORY_POINTS);
    }
    series[key] = {
      temperatures,
      targets,
      hasTarget: hasTargetField(key) && typeof obj.target === 'number',
    };
    length = Math.max(length, temperatures.length);
  }

  if (!touched) return history;

  // Keep series that exist in history but were absent from this status patch.
  for (const [key, prev] of Object.entries(history.series)) {
    if (!series[key]) series[key] = prev;
  }

  return { series, lastSampleAt: now, length: Math.min(length, TEMP_HISTORY_POINTS) };
}
