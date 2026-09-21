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

/** Relative extrusion; negative lengths retract. */
export function extrude(lengthMm: number, speedMmS: number): string {
  const value = Number(lengthMm.toFixed(2));
  return `M83\nG1 E${value} F${feedrate(speedMmS)}`;
}

export function setHeaterTarget(heaterKey: string, target: number): string {
  return `SET_HEATER_TEMPERATURE HEATER=${heaterKey} TARGET=${Math.round(target)}`;
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
