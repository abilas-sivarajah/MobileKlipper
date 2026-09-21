import type { PrinterStatus } from '@/moonraker/types';

/** A status map shaped like a real Voron with a chamber heater and sensors. */
export function printerStatus(overrides: PrinterStatus = {}): PrinterStatus {
  return {
    webhooks: { state: 'ready', state_message: 'Printer is ready' },
    print_stats: {
      filename: 'prints/voron_cube.gcode',
      state: 'printing',
      print_duration: 1200,
      total_duration: 1260,
      filament_used: 3100,
      info: { current_layer: 60, total_layer_count: 200 },
    },
    display_status: { progress: 0.3 },
    virtual_sdcard: { progress: 0.3, is_active: true },
    toolhead: {
      position: [10, 20, 5, 100],
      homed_axes: 'xy',
      max_velocity: 300,
      max_accel: 5000,
      extruder: 'extruder',
    },
    gcode_move: {
      speed_factor: 1,
      extrude_factor: 1,
      homing_origin: [0, 0, 0.05, 0],
      gcode_position: [10, 20, 12.24, 100],
    },
    extruder: { temperature: 248.4, target: 250, power: 0.4, can_extrude: true },
    heater_bed: { temperature: 99.5, target: 100, power: 0.3 },
    'heater_generic chamber': { temperature: 47, target: 50, power: 0.2 },
    'temperature_sensor mcu': { temperature: 41, measured_min_temp: 30, measured_max_temp: 45 },
    fan: { speed: 0.8, rpm: null },
    'fan_generic filter': { speed: 0.4, rpm: null },
    'heater_fan hotend_fan': { speed: 1, rpm: 6200 },
    'output_pin caselight': { value: 0.5 },
    'filament_switch_sensor runout': { filament_detected: true, enabled: true },
    configfile: {
      config: {
        'gcode_macro START_PRINT': { gcode: '...' },
        'gcode_macro _HELPER': { gcode: '...' },
        extruder: { max_temp: '300' },
      },
      settings: {
        extruder: { max_temp: 300, min_temp: 0 },
        heater_bed: { max_temp: 120, min_temp: 0 },
        'heater_generic chamber': { max_temp: 70, min_temp: 0 },
        'gcode_macro start_print': { description: 'Heizt auf' },
        'output_pin caselight': { pwm: true, scale: 1 },
      },
      save_config_pending: false,
    },
    ...overrides,
  };
}
