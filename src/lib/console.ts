/** Console line filtering and command completion. */

/**
 * Periodic temperature reports ("ok B:60.0 /60.0 T0:210.0 /210.0") drown out
 * everything else, so the console hides them by default.
 */
const TEMPERATURE_REPLY = /^(ok\s+)?([BTC]\d*:\s*-?\d+(\.\d+)?\s*(\/\s*-?\d+(\.\d+)?)?\s*)+$/;

export function isTemperatureReply(message: string): boolean {
  return TEMPERATURE_REPLY.test(message.trim());
}

/** Commands offered for completion on top of the printer's own macros. */
export const COMMON_COMMANDS = [
  'STATUS',
  'HELP',
  'RESTART',
  'FIRMWARE_RESTART',
  'G28',
  'G32',
  'M84',
  'M112',
  'M117',
  'BED_MESH_CALIBRATE',
  'BED_MESH_PROFILE LOAD=default',
  'BED_MESH_CLEAR',
  'QUAD_GANTRY_LEVEL',
  'Z_TILT_ADJUST',
  'SCREWS_TILT_CALCULATE',
  'PROBE_CALIBRATE',
  'PID_CALIBRATE HEATER=extruder TARGET=',
  'PID_CALIBRATE HEATER=heater_bed TARGET=',
  'SAVE_CONFIG',
  'TURN_OFF_HEATERS',
  'SET_GCODE_OFFSET Z=0',
  'SET_VELOCITY_LIMIT',
  'ACCELEROMETER_QUERY',
  'SHAPER_CALIBRATE',
  'QUERY_PROBE',
  'QUERY_ENDSTOPS',
  'GET_POSITION',
  'DUMP_TMC STEPPER=',
];

export function completionsFor(input: string, macros: string[], limit = 8): string[] {
  const needle = input.trim().toUpperCase();
  if (!needle) return [];
  const pool = [...macros, ...COMMON_COMMANDS];
  const seen = new Set<string>();
  const out: string[] = [];
  // Prefix matches first; they are what someone is usually typing towards.
  for (const pass of [0, 1]) {
    for (const candidate of pool) {
      const upper = candidate.toUpperCase();
      const matches = pass === 0 ? upper.startsWith(needle) : upper.includes(needle);
      if (!matches || seen.has(upper) || upper === needle) continue;
      seen.add(upper);
      out.push(candidate);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
