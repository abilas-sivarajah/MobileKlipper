/**
 * Selectors that turn the raw printer-object map into view models.
 * Kept pure so they can be unit tested without a printer.
 */
import type { GcodeMetadata, PrinterStatus } from '@/moonraker/types';
import { prettyObjectName } from './format';

export type PrintState = 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error';

export interface HeaterView {
  key: string;
  name: string;
  temperature: number;
  target: number;
  power: number;
  minTemp: number;
  maxTemp: number;
  kind: 'extruder' | 'bed' | 'generic';
  canExtrude?: boolean;
}

export interface SensorView {
  key: string;
  name: string;
  temperature: number;
  min?: number;
  max?: number;
}

export interface FanView {
  key: string;
  name: string;
  speed: number;
  rpm: number | null;
  controllable: boolean;
  /** Fan-specific gcode target, e.g. "M106 S" or "SET_FAN_SPEED FAN=x SPEED=" */
  kind: 'part' | 'generic' | 'temperature' | 'monitored';
}

export interface OutputPinView {
  key: string;
  name: string;
  value: number;
  isPwm: boolean;
  scale: number;
}

export interface MacroView {
  key: string;
  name: string;
  description?: string;
}

const EXTRUDER_RE = /^extruder\d*$/;

function settingsFor(status: PrinterStatus, objectKey: string): Record<string, unknown> {
  const settings = status.configfile?.settings;
  if (!settings) return {};
  return (settings[objectKey.toLowerCase()] ?? {}) as Record<string, unknown>;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function getHeaters(status: PrinterStatus): HeaterView[] {
  const out: HeaterView[] = [];
  for (const [key, value] of Object.entries(status)) {
    if (!value) continue;
    const isExtruder = EXTRUDER_RE.test(key);
    const isBed = key === 'heater_bed';
    const isGeneric = key.startsWith('heater_generic ');
    if (!isExtruder && !isBed && !isGeneric) continue;
    const obj = value as Record<string, unknown>;
    if (typeof obj.temperature !== 'number') continue;
    const cfg = settingsFor(status, key);
    out.push({
      key,
      name: isExtruder
        ? key === 'extruder'
          ? 'Extruder'
          : `Extruder ${key.slice(8)}`
        : isBed
          ? 'Heizbett'
          : genericHeaterName(key),
      temperature: obj.temperature,
      target: num(obj.target, 0),
      power: num(obj.power, 0),
      minTemp: num(cfg.min_temp, 0),
      maxTemp: num(cfg.max_temp, isBed ? 120 : 300),
      kind: isExtruder ? 'extruder' : isBed ? 'bed' : 'generic',
      canExtrude: typeof obj.can_extrude === 'boolean' ? obj.can_extrude : undefined,
    });
  }
  // Extruder first, then the bed and its extra zones, then everything else.
  const rank = (h: HeaterView) =>
    h.kind === 'extruder' ? 0 : h.kind === 'bed' ? 1 : h.name.startsWith('Heizbett') ? 1.5 : 2;
  return out.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/**
 * Segmented beds (Neptune 4 Pro/Plus/Max) expose the second zone as a
 * heater_generic; give it a name that says what it is.
 */
function genericHeaterName(key: string): string {
  const name = key.slice(key.indexOf(' ') + 1).toLowerCase();
  if (/bed.*(outer|aussen|außen)|(outer|aussen|außen).*bed/.test(name)) return 'Heizbett außen';
  if (/^heater_bed_?\d+$|^bed_?\d+$/.test(name)) return `Heizbett ${name.match(/\d+$/)![0]}`;
  return prettyObjectName(key);
}

export function getSensors(status: PrinterStatus): SensorView[] {
  const out: SensorView[] = [];
  for (const [key, value] of Object.entries(status)) {
    if (!value) continue;
    if (!key.startsWith('temperature_sensor ') && !key.startsWith('temperature_fan ')) continue;
    const obj = value as Record<string, unknown>;
    if (typeof obj.temperature !== 'number') continue;
    out.push({
      key,
      name: prettyObjectName(key),
      temperature: obj.temperature,
      min: typeof obj.measured_min_temp === 'number' ? obj.measured_min_temp : undefined,
      max: typeof obj.measured_max_temp === 'number' ? obj.measured_max_temp : undefined,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getFans(status: PrinterStatus): FanView[] {
  const out: FanView[] = [];
  for (const [key, value] of Object.entries(status)) {
    if (!value) continue;
    const obj = value as Record<string, unknown>;
    if (typeof obj.speed !== 'number') continue;
    if (key === 'fan') {
      out.push({ key, name: 'Bauteillüfter', speed: obj.speed, rpm: rpmOf(obj), controllable: true, kind: 'part' });
    } else if (key.startsWith('fan_generic ')) {
      out.push({ key, name: prettyObjectName(key), speed: obj.speed, rpm: rpmOf(obj), controllable: true, kind: 'generic' });
    } else if (key.startsWith('temperature_fan ')) {
      out.push({ key, name: prettyObjectName(key), speed: obj.speed, rpm: rpmOf(obj), controllable: true, kind: 'temperature' });
    } else if (key.startsWith('heater_fan ') || key.startsWith('controller_fan ')) {
      out.push({ key, name: prettyObjectName(key), speed: obj.speed, rpm: rpmOf(obj), controllable: false, kind: 'monitored' });
    }
  }
  const rank = (f: FanView) => (f.kind === 'part' ? 0 : f.controllable ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function rpmOf(obj: Record<string, unknown>): number | null {
  return typeof obj.rpm === 'number' ? obj.rpm : null;
}

export function getOutputPins(status: PrinterStatus): OutputPinView[] {
  const out: OutputPinView[] = [];
  for (const [key, value] of Object.entries(status)) {
    if (!value || !key.startsWith('output_pin ')) continue;
    const obj = value as Record<string, unknown>;
    if (typeof obj.value !== 'number') continue;
    const cfg = settingsFor(status, key);
    out.push({
      key,
      name: prettyObjectName(key),
      value: obj.value,
      isPwm: cfg.pwm === true,
      scale: num(cfg.scale, 1),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Macros come from the config, not from a status field: every `[gcode_macro X]`
 * section becomes an object named "gcode_macro X". Macros whose name starts with
 * an underscore are internal helpers by convention and stay hidden.
 */
export function getMacros(status: PrinterStatus, includeHidden = false): MacroView[] {
  const config = status.configfile?.config ?? {};
  const settings = status.configfile?.settings ?? {};
  const out: MacroView[] = [];
  for (const section of Object.keys(config)) {
    if (!section.toLowerCase().startsWith('gcode_macro ')) continue;
    const name = section.slice(section.indexOf(' ') + 1);
    if (!includeHidden && name.startsWith('_')) continue;
    const desc = (settings[section.toLowerCase()] as Record<string, unknown> | undefined)
      ?.description;
    const description = typeof desc === 'string' && desc !== 'G-Code macro' ? desc : undefined;
    out.push({ key: section, name, description });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getPrintState(status: PrinterStatus): PrintState {
  return (status.print_stats?.state ?? 'standby') as PrintState;
}

export function isPrinting(status: PrinterStatus): boolean {
  const state = getPrintState(status);
  return state === 'printing' || state === 'paused';
}

/** Where a progress or time estimate is derived from. Mirrors Mainsail's options. */
export type ProgressSource = 'file-relative' | 'file-absolute' | 'slicer' | 'filament';
export type EstimateSource = 'file' | 'filament' | 'slicer';

/**
 * Metadata only applies while it belongs to the file actually being printed;
 * a stale record would silently skew every estimate.
 */
function metadataForCurrentPrint(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
): Partial<GcodeMetadata> | null {
  if (!metadata) return null;
  const printing = status.print_stats?.filename;
  if (!printing || !metadata.filename) return null;
  return metadata.filename === printing ? metadata : null;
}

/**
 * Progress measured over the printable part of the file only.
 *
 * `virtual_sdcard.progress` is the raw byte position over the whole file, so
 * embedded thumbnails and the slicer's config block at the end count as print
 * progress. Excluding them is what Mainsail and Fluidd both do by default.
 */
export function getFileRelativeProgress(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
): number {
  const meta = metadataForCurrentPrint(status, metadata);
  const position = status.virtual_sdcard?.file_position;
  const start = meta?.gcode_start_byte;
  const end = meta?.gcode_end_byte;

  if (position != null && start != null && end != null && end > start) {
    if (position <= start) return 0;
    if (position >= end) return 1;
    return (position - start) / (end - start);
  }
  return getFileAbsoluteProgress(status);
}

/** Raw byte position over the whole file, exactly as Klipper reports it. */
export function getFileAbsoluteProgress(status: PrinterStatus): number {
  const value = status.virtual_sdcard?.progress;
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : 0;
}

/** Progress the slicer itself reported through M73. */
export function getSlicerProgress(status: PrinterStatus): number {
  const value = status.display_status?.progress;
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : 0;
}

export function getFilamentProgress(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
): number {
  const meta = metadataForCurrentPrint(status, metadata);
  const used = status.print_stats?.filament_used;
  const total = meta?.filament_total;
  if (used != null && total != null && total > 0) return clamp01(used / total);
  return getFileAbsoluteProgress(status);
}

/** 0..1 print progress from the configured source. */
export function getProgress(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
  source: ProgressSource = 'file-relative',
): number {
  switch (source) {
    case 'file-absolute':
      return getFileAbsoluteProgress(status);
    case 'slicer':
      return getSlicerProgress(status);
    case 'filament':
      return getFilamentProgress(status, metadata);
    default:
      return getFileRelativeProgress(status, metadata);
  }
}

export interface EtaEstimates {
  /** Remaining seconds from extrapolating elapsed print time over progress. */
  file: number | null;
  /** Remaining seconds from the slicer's own estimate. */
  slicer: number | null;
  /** Remaining seconds from filament consumed vs. filament total. */
  filament: number | null;
  /** Headline remaining time: the mean of the sources enabled for it. */
  remaining: number | null;
  /** Seconds used for the finish time, averaged over its own source list. */
  eta: number | null;
}

export interface EstimateOptions {
  progressSource?: ProgressSource;
  /** Sources feeding the headline remaining time. Mainsail omits the slicer here. */
  remainingSources?: EstimateSource[];
  /** Sources feeding the finish time. */
  etaSources?: EstimateSource[];
}

/** Mainsail's defaults, so both apps agree out of the box. */
export const DEFAULT_REMAINING_SOURCES: EstimateSource[] = ['file', 'filament'];
export const DEFAULT_ETA_SOURCES: EstimateSource[] = ['file', 'filament', 'slicer'];

/**
 * The three independent remaining-time estimates plus the two aggregates.
 *
 * Only positive estimates take part in an average: a slicer estimate that a
 * print has already overrun says nothing useful, and averaging in a zero would
 * drag the result towards "almost done".
 */
export function getEtaEstimates(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
  options: EstimateOptions = {},
): EtaEstimates {
  const meta = metadataForCurrentPrint(status, metadata);
  const printDuration = status.print_stats?.print_duration ?? 0;
  const progress = getProgress(status, metadata, options.progressSource ?? 'file-relative');

  let file: number | null = null;
  if (progress > 0 && printDuration > 0) {
    file = positiveOrNull(printDuration / progress - printDuration);
  }

  let slicer: number | null = null;
  const estimated = meta?.estimated_time;
  if (typeof estimated === 'number' && estimated > 0 && printDuration > 0) {
    slicer = positiveOrNull(estimated - printDuration);
  }

  let filament: number | null = null;
  const used = status.print_stats?.filament_used ?? 0;
  const total = meta?.filament_total;
  if (typeof total === 'number' && total > used && used > 0 && printDuration > 0) {
    filament = positiveOrNull(printDuration / (used / total) - printDuration);
  }

  const bySource = { file, filament, slicer };
  const mean = (sources: EstimateSource[]): number | null => {
    const values = sources.map((key) => bySource[key]).filter((v): v is number => v != null);
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  return {
    file,
    slicer,
    filament,
    remaining: mean(options.remainingSources ?? DEFAULT_REMAINING_SOURCES),
    eta: mean(options.etaSources ?? DEFAULT_ETA_SOURCES),
  };
}

function positiveOrNull(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface FilamentUsage {
  lengthMm: number;
  grams: number | null;
  /** True when the weight had to be guessed from an assumed density. */
  estimated: boolean;
}

/**
 * Filament consumed so far. Slicers record the total weight alongside the total
 * length, so scaling by the used fraction gives a real figure for whatever
 * material is loaded; without it the weight falls back to a PLA assumption.
 */
export function getFilamentUsage(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
): FilamentUsage {
  const meta = metadataForCurrentPrint(status, metadata);
  const lengthMm = status.print_stats?.filament_used ?? 0;
  const total = meta?.filament_total;
  const totalWeight = meta?.filament_weight_total;

  if (total != null && total > 0 && totalWeight != null && totalWeight > 0) {
    return { lengthMm, grams: totalWeight * (lengthMm / total), estimated: false };
  }
  return { lengthMm, grams: null, estimated: true };
}

export interface LayerInfo {
  current: number | null;
  total: number | null;
}

/**
 * Layer numbers, from Klipper's SET_PRINT_STATS_INFO when the slicer emits it,
 * otherwise derived from Z height and the slicer metadata.
 */
export function getLayerInfo(
  status: PrinterStatus,
  metadata?: Partial<GcodeMetadata> | null,
): LayerInfo {
  const info = status.print_stats?.info;
  if (typeof info?.current_layer === 'number' && typeof info?.total_layer_count === 'number') {
    return { current: info.current_layer, total: info.total_layer_count };
  }

  const layerHeight = metadata?.layer_height;
  const firstLayer = metadata?.first_layer_height ?? layerHeight;
  const objectHeight = metadata?.object_height;
  if (!layerHeight || !firstLayer) return { current: null, total: null };

  const total =
    objectHeight != null
      ? Math.ceil((objectHeight - firstLayer) / layerHeight + 1)
      : (info?.total_layer_count ?? null);

  const z = status.gcode_move?.gcode_position?.[2];
  const current =
    typeof z === 'number' ? Math.max(0, Math.ceil((z - firstLayer) / layerHeight + 1)) : null;
  return {
    current: current != null && total != null ? Math.min(current, total) : current,
    total,
  };
}

export function getHomedAxes(status: PrinterStatus): { x: boolean; y: boolean; z: boolean } {
  const homed = (status.toolhead?.homed_axes ?? '').toLowerCase();
  return { x: homed.includes('x'), y: homed.includes('y'), z: homed.includes('z') };
}

export function isKlippyIdle(status: PrinterStatus): boolean {
  return status.idle_timeout?.state !== 'Printing';
}

/** Filament sensors, with their runout state. */
export function getFilamentSensors(
  status: PrinterStatus,
): Array<{ key: string; name: string; detected: boolean; enabled: boolean }> {
  const out: Array<{ key: string; name: string; detected: boolean; enabled: boolean }> = [];
  for (const [key, value] of Object.entries(status)) {
    if (!value) continue;
    if (!key.startsWith('filament_switch_sensor ') && !key.startsWith('filament_motion_sensor '))
      continue;
    const obj = value as Record<string, unknown>;
    out.push({
      key,
      name: prettyObjectName(key),
      detected: obj.filament_detected === true,
      enabled: obj.enabled !== false,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
