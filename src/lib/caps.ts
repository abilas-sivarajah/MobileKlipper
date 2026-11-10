/**
 * What the connected printer can do, read from its live configuration.
 *
 * Nothing here is hardcoded per printer model: an Ender 3 V2 without a probe,
 * one with a CR Touch and a Neptune 4 all expose different sections, and the
 * same model can differ between firmware versions. The UI asks these
 * capabilities instead of guessing.
 */
import type { PrinterStatus } from '@/moonraker/types';

export type ProbeKind =
  | 'probe'
  | 'bltouch'
  | 'smart_effector'
  | 'probe_eddy_current'
  | 'beacon'
  | 'cartographer'
  | 'scanner';

export interface ScrewPosition {
  /** Config key, e.g. "screw1". */
  key: string;
  name: string;
  x: number;
  y: number;
}

export interface Capabilities {
  probe: ProbeKind | null;
  /** Z homes against the probe (virtual endstop) rather than a switch. */
  zEndstopIsProbe: boolean;
  bedMesh: boolean;
  bedScrews: boolean;
  screwsTilt: boolean;
  zTilt: boolean;
  quadGantryLevel: boolean;
  /** An accelerometer is configured, so SHAPER_CALIBRATE can run. */
  resonance: boolean;
  excludeObject: boolean;
  firmwareRetraction: boolean;
  kinematics: string | null;
  /** Klipper rejects extrude-only moves longer than this (default 50 mm). */
  maxExtrudeOnlyDistance: number;
  /** mm/s; null when Klipper derives it and the config does not say. */
  maxExtrudeOnlyVelocity: number | null;
  minExtrudeTemp: number;
  axisMin: [number, number, number];
  axisMax: [number, number, number];
  /** Upper-cased macro names, for "does LOAD_FILAMENT exist?" checks. */
  macros: Set<string>;
}

const PROBE_SECTIONS: ProbeKind[] = [
  'probe',
  'bltouch',
  'smart_effector',
  'beacon',
  'cartographer',
  'scanner',
];

const ACCELEROMETER_PREFIXES = ['adxl345', 'lis2dw', 'lis3dh', 'mpu9250', 'icm20948', 'beacon'];

/** Lower-cased section name -> parsed settings, falling back to raw config. */
export function configSections(status: PrinterStatus): Record<string, Record<string, unknown>> {
  const settings = status.configfile?.settings;
  if (settings && Object.keys(settings).length) {
    return settings as Record<string, Record<string, unknown>>;
  }
  const raw = status.configfile?.config ?? {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) out[key.toLowerCase()] = value;
  return out;
}

export function sectionSetting(
  status: PrinterStatus,
  section: string,
  option: string,
): unknown {
  return configSections(status)[section.toLowerCase()]?.[option];
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** "30, 40" or [30, 40] -> [30, 40] */
export function parsePoint(value: unknown): [number, number] | null {
  let parts: unknown[] | null = null;
  if (Array.isArray(value)) parts = value;
  else if (typeof value === 'string') parts = value.split(',');
  if (!parts || parts.length < 2) return null;
  const x = asNumber(typeof parts[0] === 'string' ? parts[0].trim() : parts[0]);
  const y = asNumber(typeof parts[1] === 'string' ? parts[1].trim() : parts[1]);
  return x != null && y != null ? [x, y] : null;
}

export function getCapabilities(status: PrinterStatus): Capabilities {
  const sections = configSections(status);
  const names = Object.keys(sections);
  const has = (name: string) => name in sections;

  let probe: ProbeKind | null = PROBE_SECTIONS.find((p) => has(p)) ?? null;
  if (!probe && names.some((n) => n.startsWith('probe_eddy_current '))) probe = 'probe_eddy_current';

  const endstopPin = String(sections.stepper_z?.endstop_pin ?? '');
  const zEndstopIsProbe = endstopPin
    ? endstopPin.includes('z_virtual_endstop')
    : probe != null && !has('stepper_z');

  const extruder = sections.extruder ?? {};
  const toolhead = status.toolhead;
  const min = toolhead?.axis_minimum;
  const max = toolhead?.axis_maximum;

  const macros = new Set<string>();
  for (const name of names) {
    if (name.startsWith('gcode_macro ')) macros.add(name.slice(12).toUpperCase());
  }

  return {
    probe,
    zEndstopIsProbe,
    bedMesh: has('bed_mesh'),
    bedScrews: has('bed_screws'),
    screwsTilt: has('screws_tilt_adjust'),
    zTilt: has('z_tilt') || has('z_tilt_ng'),
    quadGantryLevel: has('quad_gantry_level'),
    resonance:
      has('resonance_tester') &&
      names.some((n) => ACCELEROMETER_PREFIXES.some((p) => n === p || n.startsWith(`${p} `))),
    excludeObject: has('exclude_object'),
    firmwareRetraction: has('firmware_retraction'),
    kinematics: typeof sections.printer?.kinematics === 'string' ? sections.printer.kinematics : null,
    maxExtrudeOnlyDistance: asNumber(extruder.max_extrude_only_distance) ?? 50,
    maxExtrudeOnlyVelocity: asNumber(extruder.max_extrude_only_velocity),
    minExtrudeTemp: asNumber(extruder.min_extrude_temp) ?? 170,
    axisMin: [min?.[0] ?? 0, min?.[1] ?? 0, min?.[2] ?? 0],
    axisMax: [max?.[0] ?? 0, max?.[1] ?? 0, max?.[2] ?? 0],
    macros,
  };
}

/** Which command makes a babystepped offset permanent on this printer. */
export function zOffsetApplyCommand(caps: Pick<Capabilities, 'probe' | 'zEndstopIsProbe'>):
  | 'Z_OFFSET_APPLY_PROBE'
  | 'Z_OFFSET_APPLY_ENDSTOP' {
  return caps.probe && caps.zEndstopIsProbe ? 'Z_OFFSET_APPLY_PROBE' : 'Z_OFFSET_APPLY_ENDSTOP';
}

/**
 * Screw positions from [bed_screws] or [screws_tilt_adjust]. Both sections use
 * screw1, screw1_name, screw2, ... and Klipper numbers them from 1.
 */
export function getScrews(status: PrinterStatus, section: 'bed_screws' | 'screws_tilt_adjust'): ScrewPosition[] {
  const cfg = configSections(status)[section];
  if (!cfg) return [];
  const out: ScrewPosition[] = [];
  for (let i = 1; i <= 99; i++) {
    const key = `screw${i}`;
    if (!(key in cfg)) break;
    const point = parsePoint(cfg[key]);
    if (!point) continue;
    const name = cfg[`${key}_name`];
    out.push({
      key,
      name: typeof name === 'string' && name.trim() ? name : `Schraube ${i}`,
      x: point[0],
      y: point[1],
    });
  }
  return out;
}
