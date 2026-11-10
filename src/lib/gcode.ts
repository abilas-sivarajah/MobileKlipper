/**
 * G-code builders. Pure string functions so the command each control sends can
 * be unit tested without a printer.
 */
import type { FanView } from './derive';

/** Klipper expects feedrates in mm/min; the UI works in mm/s. */
export function feedrate(mmPerSecond: number): number {
  return Math.round(mmPerSecond * 60);
}

/** A relative jog that restores absolute positioning afterwards. */
export function jog(axis: 'X' | 'Y' | 'Z', distance: number, speedMmS: number): string {
  const value = Number(distance.toFixed(3));
  return `G91\nG1 ${axis}${value} F${feedrate(speedMmS)}\nG90`;
}

export function home(axes?: Array<'X' | 'Y' | 'Z'>): string {
  return axes?.length ? `G28 ${axes.join(' ')}` : 'G28';
}

/**
 * Relative extrusion; negative lengths retract.
 *
 * Klipper rejects any single extrude-only move longer than the extruder's
 * `max_extrude_only_distance` (50 mm unless configured), so longer lengths are
 * split into several moves that each stay within the limit.
 */
export function extrude(lengthMm: number, speedMmS: number, maxPerMove = Infinity): string {
  return ['M83', ...extrudeMoves(lengthMm, speedMmS, maxPerMove)].join('\n');
}

/** The G1 moves for an extrusion, without the M83 preamble. */
export function extrudeMoves(lengthMm: number, speedMmS: number, maxPerMove = Infinity): string[] {
  const total = Math.abs(lengthMm);
  if (total === 0) return [];
  const sign = lengthMm < 0 ? -1 : 1;
  const limit = Number.isFinite(maxPerMove) && maxPerMove > 0 ? maxPerMove : total;
  const count = Math.ceil(total / limit - 1e-9);
  const each = total / count;
  const f = feedrate(speedMmS);
  const moves: string[] = [];
  let done = 0;
  for (let i = 0; i < count; i++) {
    // Floor each chunk so rounding never pushes one over the limit; the last
    // move takes the remainder.
    const step = i === count - 1 ? total - done : Math.floor(each * 100) / 100;
    done += step;
    moves.push(`G1 E${Number((sign * step).toFixed(2))} F${f}`);
  }
  return moves;
}

/**
 * Klipper names heaters by the last word of their config section:
 * [heater_generic heater_bed_outer] is addressed as HEATER=heater_bed_outer.
 */
export function heaterName(objectKey: string): string {
  const trimmed = objectKey.trim();
  return trimmed.includes(' ') ? trimmed.slice(trimmed.lastIndexOf(' ') + 1) : trimmed;
}

export function setHeaterTarget(heaterKey: string, target: number): string {
  return `SET_HEATER_TEMPERATURE HEATER=${heaterName(heaterKey)} TARGET=${Math.max(0, Math.round(target))}`;
}

export function setSpeedFactor(percent: number): string {
  return `M220 S${Math.round(percent)}`;
}

export function setExtrudeFactor(percent: number): string {
  return `M221 S${Math.round(percent)}`;
}

/**
 * Nudges the live Z offset. During a print MOVE=1 applies it immediately;
 * outside a print there is nothing to move, and MOVE=1 would error.
 */
export function adjustZOffset(deltaMm: number, applyNow: boolean): string {
  const value = Number(deltaMm.toFixed(3));
  return `SET_GCODE_OFFSET Z_ADJUST=${value}${applyNow ? ' MOVE=1' : ''}`;
}

export function resetZOffset(): string {
  return 'SET_GCODE_OFFSET Z=0';
}

/**
 * Makes the babystepped offset permanent. SAVE_CONFIG restarts Klipper, which
 * would kill a running print, so during a print only the apply step runs and
 * the save is left pending.
 */
export function persistZOffset(
  apply: 'Z_OFFSET_APPLY_PROBE' | 'Z_OFFSET_APPLY_ENDSTOP',
  printing: boolean,
): string {
  return printing ? apply : `${apply}\nSAVE_CONFIG`;
}

export function pidCalibrate(heaterKey: string, target: number): string {
  return `PID_CALIBRATE HEATER=${heaterName(heaterKey)} TARGET=${Math.round(target)}`;
}

/** TESTZ during manual probing; "+"/"-" bisect towards the last good height. */
export function testZ(delta: number | '+' | '-' | '++' | '--'): string {
  return `TESTZ Z=${typeof delta === 'number' ? Number(delta.toFixed(3)) : delta}`;
}

export function excludeObject(name: string): string {
  return `EXCLUDE_OBJECT NAME=${name}`;
}

export function setPressureAdvance(advance: number, extruder = 'extruder'): string {
  const value = Math.max(0, Number(advance.toFixed(4)));
  return `SET_PRESSURE_ADVANCE EXTRUDER=${extruder} ADVANCE=${value}`;
}

export function setRetraction(params: {
  length?: number;
  speed?: number;
  unretractExtra?: number;
  unretractSpeed?: number;
}): string {
  const parts = ['SET_RETRACTION'];
  if (params.length != null) parts.push(`RETRACT_LENGTH=${Number(params.length.toFixed(2))}`);
  if (params.speed != null) parts.push(`RETRACT_SPEED=${Math.round(params.speed)}`);
  if (params.unretractExtra != null) {
    parts.push(`UNRETRACT_EXTRA_LENGTH=${Number(params.unretractExtra.toFixed(2))}`);
  }
  if (params.unretractSpeed != null) parts.push(`UNRETRACT_SPEED=${Math.round(params.unretractSpeed)}`);
  return parts.join(' ');
}

/** Bed mesh profile names may not contain spaces in a gcode parameter. */
export function bedMeshProfile(action: 'LOAD' | 'SAVE' | 'REMOVE', name: string): string {
  return `BED_MESH_PROFILE ${action}=${name.trim().replace(/\s+/g, '_')}`;
}

/** Each fan type has its own command; the part fan still uses M106. */
export function setFanSpeed(fan: Pick<FanView, 'key' | 'kind'>, speed: number): string {
  const clamped = Math.min(1, Math.max(0, speed));
  if (fan.kind === 'part') {
    return clamped === 0 ? 'M107' : `M106 S${Math.round(clamped * 255)}`;
  }
  const name = fan.key.slice(fan.key.indexOf(' ') + 1);
  if (fan.kind === 'temperature') {
    return `SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${name} TARGET=${Math.round(clamped * 100)}`;
  }
  return `SET_FAN_SPEED FAN=${name} SPEED=${clamped.toFixed(2)}`;
}

export function setOutputPin(objectKey: string, value: number): string {
  const name = objectKey.slice(objectKey.indexOf(' ') + 1);
  return `SET_PIN PIN=${name} VALUE=${Number(value.toFixed(2))}`;
}

export function setVelocityLimit(limits: {
  velocity?: number;
  accel?: number;
  squareCornerVelocity?: number;
}): string {
  const parts = ['SET_VELOCITY_LIMIT'];
  if (limits.velocity != null) parts.push(`VELOCITY=${Math.round(limits.velocity)}`);
  if (limits.accel != null) parts.push(`ACCEL=${Math.round(limits.accel)}`);
  if (limits.squareCornerVelocity != null) {
    parts.push(`SQUARE_CORNER_VELOCITY=${limits.squareCornerVelocity}`);
  }
  return parts.join(' ');
}
