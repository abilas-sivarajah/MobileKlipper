/**
 * Mock Moonraker instance for development.
 *
 * Speaks enough of the real API — JSON-RPC over /websocket plus the HTTP file
 * endpoints — to drive the whole app without a printer: it simulates heating,
 * a running print with layer progress, temperature noise, gcode responses,
 * bed levelling, manual probing, SAVE_CONFIG, power devices and config files.
 *
 *   node tools/mock-moonraker.mjs [--port 7125] [--profile voron|ender3v2|neptune4]
 *
 * Profiles:
 *   voron     CoreXY with chamber heater, printing (the original mock)
 *   ender3v2  Bowden cartesian, Z endstop switch, [bed_screws], smart plug, idle
 *   neptune4  Neptune 4 Pro style: probe as Z endstop, 11x11 mesh, outer bed
 *             zone, [screws_tilt_adjust], exclude_object, printing
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { deflateSync, crc32 } from 'node:zlib';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', 7125)) || 7125;
const PROFILE = arg('--profile', 'voron');

// --- profiles ---------------------------------------------------------------

const MACROS = {
  'gcode_macro START_PRINT': { description: 'Heizt auf und macht ein Purge-Line' },
  'gcode_macro END_PRINT': { description: 'Fährt den Kopf weg und kühlt ab' },
  'gcode_macro _HELPER': { description: 'intern' },
};

const PROFILES = {
  voron: {
    hostname: 'voron-mock',
    axisMax: [350, 350, 330],
    printing: true,
    heaters: {
      extruder: { temperature: 248.4, target: 250 },
      heater_bed: { temperature: 99.8, target: 100 },
      'heater_generic chamber': { temperature: 47.2, target: 50 },
    },
    sensors: { 'temperature_sensor mcu': 41.3, 'temperature_sensor raspberry_pi': 52.7 },
    fans: { fan: 0.85, 'fan_generic filter': 0.4, 'heater_fan hotend_fan': 1 },
    pins: { 'output_pin caselight': 0.8 },
    config: {
      printer: { kinematics: 'corexy', max_velocity: 300, max_accel: 5000 },
      stepper_z: { endstop_pin: 'probe:z_virtual_endstop' },
      probe: { z_offset: 1.1 },
      extruder: { max_temp: 300, min_temp: 0, min_extrude_temp: 170, max_extrude_only_distance: 50 },
      heater_bed: { max_temp: 120, min_temp: 0 },
      'heater_generic chamber': { max_temp: 70, min_temp: 0 },
      quad_gantry_level: {},
      bed_mesh: { probe_count: [5, 5] },
      firmware_retraction: { retract_length: 0.5 },
      resonance_tester: {},
      adxl345: {},
      'output_pin caselight': { pwm: true, scale: 1 },
      ...MACROS,
      'gcode_macro LOAD_FILAMENT': { description: 'Filament laden' },
      'gcode_macro UNLOAD_FILAMENT': { description: 'Filament entladen' },
    },
    mesh: { size: [5, 5], min: [30, 30], max: [320, 320], tilt: 0.05 },
    power: [],
  },
  ender3v2: {
    hostname: 'ender3v2',
    axisMax: [235, 235, 250],
    printing: false,
    heaters: {
      extruder: { temperature: 23.1, target: 0 },
      heater_bed: { temperature: 22.4, target: 0 },
    },
    sensors: { 'temperature_sensor raspberry_pi': 46.2 },
    fans: { fan: 0, 'heater_fan hotend_fan': 0 },
    pins: {},
    config: {
      printer: { kinematics: 'cartesian', max_velocity: 300, max_accel: 3000, max_z_velocity: 5 },
      stepper_z: { endstop_pin: '^PA7', position_endstop: 0 },
      extruder: { max_temp: 260, min_temp: 0, min_extrude_temp: 170, max_extrude_only_distance: 100 },
      heater_bed: { max_temp: 110, min_temp: 0 },
      bed_screws: {
        screw1: [30.5, 37], screw1_name: 'vorne links',
        screw2: [200.5, 37], screw2_name: 'vorne rechts',
        screw3: [200.5, 207], screw3_name: 'hinten rechts',
        screw4: [30.5, 207], screw4_name: 'hinten links',
      },
      'filament_switch_sensor runout': {},
      ...MACROS,
      'gcode_macro M600': { description: 'Filamentwechsel' },
    },
    mesh: null,
    power: [{ device: 'drucker', status: 'on', locked_while_printing: true, type: 'tasmota' }],
  },
  neptune4: {
    hostname: 'mkspi',
    axisMax: [235, 235, 265],
    printing: true,
    heaters: {
      extruder: { temperature: 219.6, target: 220 },
      heater_bed: { temperature: 59.8, target: 60 },
      'heater_generic heater_bed_outer': { temperature: 59.1, target: 60 },
    },
    sensors: { 'temperature_sensor mcu_temp': 44.1 },
    fans: { fan: 1, 'fan_generic fan2': 0.5, 'heater_fan hotend_fan': 1, 'controller_fan board_fan': 1 },
    pins: { 'output_pin LED_light': 1 },
    config: {
      printer: { kinematics: 'cartesian', max_velocity: 500, max_accel: 5000, max_z_velocity: 15 },
      stepper_z: { endstop_pin: 'probe:z_virtual_endstop' },
      probe: { z_offset: 0.0 },
      extruder: { max_temp: 300, min_temp: 0, min_extrude_temp: 170, max_extrude_only_distance: 150 },
      heater_bed: { max_temp: 110, min_temp: 0 },
      'heater_generic heater_bed_outer': { max_temp: 110, min_temp: 0 },
      bed_mesh: { probe_count: [11, 11] },
      exclude_object: {},
      screws_tilt_adjust: {
        screw1: [27, 33], screw1_name: 'vorne links',
        screw2: [197, 33], screw2_name: 'vorne rechts',
        screw3: [197, 203], screw3_name: 'hinten rechts',
        screw4: [27, 203], screw4_name: 'hinten links',
        screw_thread: 'CW-M4',
      },
      'output_pin LED_light': { pwm: false, scale: 1 },
      'filament_switch_sensor filament_sensor': {},
      ...MACROS,
    },
    mesh: { size: [11, 11], min: [10, 10], max: [225, 225], tilt: 0.12 },
    objects: [
      { name: 'BENCHY_ID_0', center: [70, 70], polygon: [[45, 50], [95, 50], [95, 90], [45, 90]] },
      { name: 'BENCHY_ID_1', center: [165, 70], polygon: [[140, 50], [190, 50], [190, 90], [140, 90]] },
      { name: 'CALIBRATION_CUBE', center: [70, 165], polygon: [[60, 155], [80, 155], [80, 175], [60, 175]] },
      { name: 'BRACKET_V3', center: [165, 165], polygon: [[135, 150], [195, 150], [195, 180], [135, 180]] },
    ],
    power: [],
  },
};

const P = PROFILES[PROFILE] ?? PROFILES.voron;

// --- simulated printer state ------------------------------------------------

// startByte covers the embedded thumbnails, endByte excludes the slicer's
// config block at the end of the file - both matter for progress reporting.
const FILES = new Map(
  [
    { path: 'voron_cube.gcode', size: 4_812_340, time: 5040, filament: 12_400, height: 40, startByte: 128_000, endByte: 4_760_000, ext: 250, bed: 100 },
    { path: 'benchy.gcode', size: 2_145_998, time: 3120, filament: 8200, height: 48, startByte: 96_000, endByte: 2_112_000, ext: 215, bed: 60 },
    { path: 'bracket_v3.gcode', size: 812_004, time: 1260, filament: 3100, height: 12, startByte: 64_000, endByte: 798_000, ext: 240, bed: 70 },
    { path: 'archiv/vase.gcode', size: 312_004, time: 2600, filament: 6100, height: 120, startByte: 32_000, endByte: 300_000, ext: 210, bed: 60 },
  ].map((f) => [f.path, { ...f, modified: Date.now() / 1000 - Math.random() * 90000 }]),
);
const DIRS = new Set(['archiv']);

const CONFIG_FILES = new Map([
  ['printer.cfg', configText()],
  ['moonraker.conf', '[server]\nhost: 0.0.0.0\nport: 7125\n\n[authorization]\ncors_domains:\n    *\n\n[history]\n'],
  ['macros.cfg', '[gcode_macro START_PRINT]\ngcode:\n    G28\n    BED_MESH_PROFILE LOAD=default\n'],
]);

const state = {
  klippyReady: true,
  print: P.printing
    ? { state: 'printing', filename: PROFILE === 'neptune4' ? 'benchy.gcode' : 'voron_cube.gcode', printDuration: 1260, totalDuration: 1320, filamentUsed: 3100, currentLayer: 63, totalLayers: 200 }
    : { state: 'standby', filename: '', printDuration: 0, totalDuration: 0, filamentUsed: 0, currentLayer: 0, totalLayers: 0 },
  heaters: Object.fromEntries(Object.entries(P.heaters).map(([k, h]) => [k, { ...h, power: 0 }])),
  sensors: { ...P.sensors },
  fans: { ...P.fans },
  pins: { ...P.pins },
  toolhead: { position: P.printing ? [117.4, 96.2, 12.6, 812.4] : [0, 0, 0, 0], homed: P.printing ? 'xyz' : '' },
  gcodeMove: { speedFactor: 1, extrudeFactor: 1, zOffset: P.printing ? 0.03 : 0, absoluteExtrude: true },
  pressureAdvance: PROFILE === 'ender3v2' ? 0.55 : 0.04,
  retraction: { retract_length: 0.5, retract_speed: 35, unretract_extra_length: 0, unretract_speed: 35 },
  savePending: {},
  mesh: P.mesh ? { profile: 'default', probed: makeMesh(P.mesh), profiles: { default: {}, pla_60: {} } } : null,
  screwsTilt: { error: false, max_deviation: null, results: {} },
  bedScrews: { is_active: false, state: null, current_screw: 0, accepted_screws: 0, adjustedThisRound: false },
  manualProbe: { is_active: false, z_position: null, z_position_lower: null, z_position_upper: null, kind: null },
  excluded: [],
  currentObject: null,
  power: P.power.map((d) => ({ ...d })),
};

function makeMesh({ size: [cols, rows], tilt }) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      const v = r / (rows - 1) - 0.5;
      // A slight tilt plus a bowl, like a real heated bed.
      const z = tilt * u - tilt * 0.6 * v + 0.12 * (u * u + v * v) - 0.04 + (Math.random() - 0.5) * 0.01;
      row.push(round(z, 4));
    }
    out.push(row);
  }
  return out;
}

function configText() {
  const lines = [];
  for (const [section, values] of Object.entries(P.config)) {
    lines.push(`[${section}]`);
    for (const [k, v] of Object.entries(values)) {
      lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const clients = new Set();
const tempStore = {};

function configfile() {
  const settings = lowerKeys(P.config);
  const config = Object.fromEntries(
    Object.entries(P.config).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Array.isArray(b) ? b.join(', ') : String(b)]))]),
  );
  return {
    config,
    settings,
    save_config_pending: Object.keys(state.savePending).length > 0,
    save_config_pending_items: state.savePending,
    warnings: [],
  };
}

function printerStatus() {
  const printing = state.print.state === 'printing';
  const s = {
    webhooks: {
      state: state.klippyReady ? 'ready' : 'shutdown',
      state_message: state.klippyReady
        ? 'Printer is ready'
        : state.power.some((d) => d.status === 'off')
          ? "MCU 'mcu' shutdown: Lost communication with MCU 'mcu'"
          : 'Emergency stop',
    },
    print_stats: {
      filename: state.print.filename,
      state: state.print.state,
      print_duration: state.print.printDuration,
      total_duration: state.print.totalDuration,
      filament_used: state.print.filamentUsed,
      message: '',
      info: { current_layer: state.print.currentLayer, total_layer_count: state.print.totalLayers },
    },
    display_status: { progress: state.print.totalLayers ? state.print.currentLayer / state.print.totalLayers : 0, message: null },
    virtual_sdcard: {
      progress: currentFile() ? filePosition() / currentFile().size : 0,
      is_active: printing,
      file_position: currentFile() ? filePosition() : 0,
      file_size: currentFile()?.size ?? 0,
    },
    toolhead: {
      position: state.toolhead.position,
      homed_axes: state.toolhead.homed,
      axis_minimum: [0, 0, -2, 0],
      axis_maximum: [...P.axisMax, 0],
      extruder: 'extruder',
      max_velocity: P.config.printer.max_velocity,
      max_accel: P.config.printer.max_accel,
    },
    gcode_move: {
      speed_factor: state.gcodeMove.speedFactor,
      extrude_factor: state.gcodeMove.extrudeFactor,
      homing_origin: [0, 0, state.gcodeMove.zOffset, 0],
      gcode_position: state.toolhead.position,
      position: state.toolhead.position,
      speed: 7200,
      absolute_coordinates: true,
      absolute_extrude: state.gcodeMove.absoluteExtrude,
    },
    idle_timeout: { state: printing ? 'Printing' : 'Ready', printing_time: state.print.printDuration },
    pause_resume: { is_paused: state.print.state === 'paused' },
    fan: { speed: state.fans.fan ?? 0, rpm: null },
    configfile: configfile(),
    manual_probe: {
      is_active: state.manualProbe.is_active,
      z_position: state.manualProbe.z_position,
      z_position_lower: state.manualProbe.z_position_lower,
      z_position_upper: state.manualProbe.z_position_upper,
    },
  };
  for (const [key, h] of Object.entries(state.heaters)) {
    s[key] = { temperature: round(h.temperature), target: h.target, power: round(h.power, 2) };
    if (key === 'extruder') {
      s[key].can_extrude = h.temperature >= P.config.extruder.min_extrude_temp;
      s[key].pressure_advance = state.pressureAdvance;
      s[key].smooth_time = 0.04;
    }
  }
  for (const [key, value] of Object.entries(state.sensors)) {
    s[key] = { temperature: round(value), measured_min_temp: round(value - 12), measured_max_temp: round(value + 4) };
  }
  for (const [key, speed] of Object.entries(state.fans)) {
    if (key === 'fan') continue;
    s[key] = { speed, rpm: key.startsWith('heater_fan') && speed > 0 ? 6200 : null };
  }
  for (const [key, value] of Object.entries(state.pins)) s[key] = { value };
  for (const key of Object.keys(P.config)) {
    if (key.startsWith('filament_switch_sensor ')) s[key] = { filament_detected: true, enabled: true };
  }
  if ('firmware_retraction' in P.config) s.firmware_retraction = { ...state.retraction };
  if (state.mesh) {
    s.bed_mesh = {
      profile_name: state.mesh.profile ?? '',
      mesh_min: P.mesh.min,
      mesh_max: P.mesh.max,
      probed_matrix: state.mesh.profile ? state.mesh.probed : [[]],
      mesh_matrix: state.mesh.profile ? interpolate(state.mesh.probed) : [[]],
      profiles: Object.fromEntries(Object.keys(state.mesh.profiles).map((k) => [k, { points: [], mesh_params: {} }])),
    };
  }
  if ('screws_tilt_adjust' in P.config) s.screws_tilt_adjust = { ...state.screwsTilt };
  if ('bed_screws' in P.config) {
    const { adjustedThisRound: _ignored, ...tool } = state.bedScrews;
    s.bed_screws = tool;
  }
  if (P.objects) {
    s.exclude_object = { objects: P.objects, excluded_objects: state.excluded, current_object: printing ? state.currentObject : null };
  }
  return s;
}

/** Doubles the resolution, like Klipper's bicubic mesh_matrix. */
function interpolate(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const out = [];
  for (let r = 0; r < rows * 2 - 1; r++) {
    const row = [];
    for (let c = 0; c < cols * 2 - 1; c++) {
      const r0 = Math.floor(r / 2), c0 = Math.floor(c / 2);
      const r1 = Math.min(rows - 1, Math.ceil(r / 2)), c1 = Math.min(cols - 1, Math.ceil(c / 2));
      row.push(round((matrix[r0][c0] + matrix[r1][c0] + matrix[r0][c1] + matrix[r1][c1]) / 4, 4));
    }
    out.push(row);
  }
  return out;
}

function currentFile() {
  return FILES.get(state.print.filename) ?? null;
}

function filePosition() {
  const f = currentFile();
  if (!f || !state.print.totalLayers) return 0;
  const fraction = state.print.currentLayer / state.print.totalLayers;
  return Math.round(f.startByte + fraction * (f.endByte - f.startByte));
}

function lowerKeys(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
}

function round(v, digits = 1) {
  return Number(v.toFixed(digits));
}

// --- simulation loop --------------------------------------------------------

setInterval(() => {
  for (const [key, h] of Object.entries(state.heaters)) {
    const delta = h.target - h.temperature;
    if (h.target === 0) {
      h.temperature = Math.max(22, h.temperature - 0.4 + (Math.random() - 0.5) * 0.1);
      h.power = 0;
    } else {
      // Heat at a realistic rate rather than snapping to the target.
      h.temperature += Math.max(-1, Math.min(key === 'extruder' ? 2.2 : 0.6, delta * 0.08)) + (Math.random() - 0.5) * 0.3;
      h.power = Math.max(0, Math.min(1, delta * 0.05 + 0.15 + (Math.random() - 0.5) * 0.05));
    }
  }
  for (const key of Object.keys(state.sensors)) state.sensors[key] += (Math.random() - 0.5) * 0.3;

  if (state.print.state === 'printing') {
    state.print.printDuration += 0.25;
    state.print.totalDuration += 0.25;
    state.print.filamentUsed += 0.9;
    if (Math.random() < 0.05 && state.print.currentLayer < state.print.totalLayers) {
      state.print.currentLayer += 1;
      state.toolhead.position[2] = round(state.print.currentLayer * 0.2, 2);
    }
    state.toolhead.position[0] = round(P.axisMax[0] / 2 + Math.sin(Date.now() / 900) * 60, 1);
    state.toolhead.position[1] = round(P.axisMax[1] / 2 + Math.cos(Date.now() / 1100) * 55, 1);
    if (P.objects) {
      const live = P.objects.filter((o) => !state.excluded.includes(o.name));
      state.currentObject = live.length ? live[Math.floor(Date.now() / 7000) % live.length].name : null;
    }
  }

  broadcast('notify_status_update', [printerStatus(), Date.now() / 1000]);
}, 250);

// One temperature-store sample per second, like the real component.
setInterval(() => {
  for (const [key, h] of Object.entries(state.heaters)) {
    const entry = (tempStore[key] ??= { temperatures: [], targets: [], powers: [] });
    push(entry.temperatures, round(h.temperature));
    push(entry.targets, h.target);
    push(entry.powers, round(h.power, 2));
  }
  for (const [key, value] of Object.entries(state.sensors)) {
    const entry = (tempStore[key] ??= { temperatures: [] });
    push(entry.temperatures, round(value));
  }
  broadcast('notify_proc_stat_update', [procStats(true)]);
}, 1000);

function push(arr, value) {
  arr.push(value);
  if (arr.length > 1200) arr.shift();
}

// Seed 20 minutes of plausible history so the chart is populated at startup.
for (let i = 0; i < 1200; i++) {
  for (const [key, h] of Object.entries(state.heaters)) {
    const entry = (tempStore[key] ??= { temperatures: [], targets: [], powers: [] });
    const warmup = Math.min(1, i / 240);
    const target = h.target;
    entry.temperatures.push(round(target ? 24 + (target - 24) * warmup + (Math.random() - 0.5) * 1.2 : h.temperature + (Math.random() - 0.5) * 0.4));
    entry.targets.push(i < 60 ? 0 : target);
    entry.powers.push(round(Math.random() * 0.4, 2));
  }
  for (const [key, value] of Object.entries(state.sensors)) {
    const entry = (tempStore[key] ??= { temperatures: [] });
    entry.temperatures.push(round(value + (Math.random() - 0.5) * 3));
  }
}

const startedAt = Date.now();
function procStats(notification = false) {
  const moon = { time: Date.now() / 1000, cpu_usage: round(2 + Math.random() * 3, 2), memory: 48_000, mem_units: 'kB' };
  return {
    moonraker_stats: notification ? moon : [moon],
    cpu_temp: round(48 + Math.random() * 4, 1),
    network: { wlan0: { rx_bytes: 1e8, tx_bytes: 4e7, bandwidth: 3200 } },
    system_cpu_usage: { cpu: round(12 + Math.random() * 10, 1), cpu0: 10, cpu1: 14, cpu2: 9, cpu3: 18 },
    system_memory: { total: 3_884_816, available: 2_964_200, used: 920_616 },
    system_uptime: 184_000 + (Date.now() - startedAt) / 1000,
    websocket_connections: clients.size,
    // An Ender 3 V2 on a weak Pi supply is the classic under-voltage case.
    throttled_state: PROFILE === 'ender3v2'
      ? { bits: 0x50000, flags: ['Previously Under-Volted', 'Previously Throttled'] }
      : { bits: 0, flags: [] },
  };
}

const gcodeLog = [
  { message: 'Klipper state: Ready', time: Date.now() / 1000 - 600, type: 'response' },
  { message: 'START_PRINT EXTRUDER=250 BED=100', time: Date.now() / 1000 - 580, type: 'command' },
  { message: '// Heating bed to 100C', time: Date.now() / 1000 - 578, type: 'response' },
];

function broadcast(method, params) {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

function respond(message) {
  gcodeLog.push({ message, time: Date.now() / 1000, type: 'response' });
  broadcast('notify_gcode_response', [message]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- JSON-RPC ---------------------------------------------------------------

function fileMeta(f) {
  return {
    filename: f.path.split('/').pop(), modified: f.modified, size: f.size,
    estimated_time: f.time, filament_total: f.filament, object_height: f.height,
    layer_height: 0.2, first_layer_height: 0.24, slicer: 'OrcaSlicer', slicer_version: '2.1.0',
    gcode_start_byte: f.startByte, gcode_end_byte: f.endByte,
    filament_weight_total: Math.round(f.filament * 0.003 * 10) / 10,
    filament_type: 'PLA', filament_name: 'Generic PLA', nozzle_diameter: 0.4,
    first_layer_extr_temp: f.ext, first_layer_bed_temp: f.bed,
    thumbnails: [{ width: 300, height: 300, size: 8000, relative_path: `.thumbs/${f.path.split('/').pop().replace('.gcode', '')}-300x300.png` }],
  };
}

function stripRoot(path) {
  return String(path ?? '').replace(/^gcodes\/?/, '');
}

const history = [...FILES.values()].slice(0, 3).map((f, i) => ({
  job_id: `0000${i}`, filename: f.path, status: i === 1 ? 'cancelled' : 'completed',
  start_time: Date.now() / 1000 - (i + 1) * 90000, end_time: Date.now() / 1000 - (i + 1) * 90000 + f.time,
  print_duration: f.time, total_duration: f.time + 120, filament_used: f.filament, exists: true,
  metadata: fileMeta(f),
}));

const handlers = {
  'server.info': () => ({
    klippy_connected: true,
    klippy_state: state.klippyReady ? 'ready' : 'shutdown',
    components: ['server', 'file_manager', 'klippy_apis', 'webcam', 'history', 'machine', 'update_manager', ...(state.power.length ? ['power'] : [])],
    moonraker_version: 'v0.9.3-mock',
    api_version: [1, 5, 0],
    websocket_count: clients.size,
    warnings: [],
  }),
  'printer.info': () => ({
    state: state.klippyReady ? 'ready' : 'shutdown',
    state_message: 'Printer is ready',
    hostname: P.hostname,
    software_version: 'v0.12.0-mock',
  }),
  'printer.objects.list': () => ({ objects: Object.keys(printerStatus()) }),
  'printer.objects.subscribe': () => ({ eventtime: Date.now() / 1000, status: printerStatus() }),
  'printer.objects.query': () => ({ eventtime: Date.now() / 1000, status: printerStatus() }),
  'server.temperature_store': () => tempStore,
  'server.gcode_store': () => ({ gcode_store: gcodeLog.slice(-150) }),
  'server.webcams.list': () => ({
    webcams: [{
      name: 'Kamera', location: 'printer', service: 'mjpegstreamer-adaptive', enabled: true,
      target_fps: 15, stream_url: '/webcam/?action=stream', snapshot_url: '/webcam/?action=snapshot',
      flip_horizontal: false, flip_vertical: false, rotation: 0, uid: 'cam1',
    }],
  }),
  'server.files.list': ({ root = 'gcodes' } = {}) => {
    if (root === 'config') return [...CONFIG_FILES].map(([path, text]) => ({ path, size: text.length, modified: Date.now() / 1000, permissions: 'rw' }));
    if (root === 'logs') return [
      { path: 'klippy.log', size: 4_200_000, modified: Date.now() / 1000, permissions: 'r' },
      { path: 'moonraker.log', size: 820_000, modified: Date.now() / 1000, permissions: 'r' },
    ];
    return [...FILES.values()].map((f) => ({ path: f.path, size: f.size, modified: f.modified }));
  },
  'server.files.get_directory': ({ path = 'gcodes' } = {}) => {
    if (path === 'config') {
      return {
        dirs: [],
        files: [...CONFIG_FILES].map(([filename, text]) => ({ filename, size: text.length, modified: Date.now() / 1000, permissions: 'rw' })),
        root_info: { name: 'config', permissions: 'rw' },
      };
    }
    const dir = stripRoot(path);
    const prefix = dir ? `${dir}/` : '';
    return {
      dirs: [...DIRS]
        .filter((d) => d.startsWith(prefix) && !d.slice(prefix.length).includes('/') && d !== dir)
        .map((d) => ({ dirname: d.slice(prefix.length), modified: Date.now() / 1000 - 90000, size: 4096 })),
      files: [...FILES.values()]
        .filter((f) => f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/'))
        .map(fileMeta),
      disk_usage: { total: 30_000_000_000, used: 12_000_000_000, free: 18_000_000_000 },
      root_info: { name: 'gcodes', permissions: 'rw' },
    };
  },
  'server.files.metadata': ({ filename }) => {
    const f = FILES.get(filename) ?? [...FILES.values()][0];
    return { ...fileMeta(f), filename };
  },
  'server.files.delete_file': ({ path }) => {
    const rel = stripRoot(path);
    if (!FILES.delete(rel)) throw new Error(`File ${path} does not exist`);
    broadcast('notify_filelist_changed', [{ action: 'delete_file', item: { path: rel, root: 'gcodes' } }]);
    return { item: { path: rel, root: 'gcodes' }, action: 'delete_file' };
  },
  'server.files.move': ({ source, dest }) => {
    const from = stripRoot(source);
    let to = stripRoot(dest);
    if (DIRS.has(to)) to = `${to}/${from.split('/').pop()}`;
    const f = FILES.get(from);
    if (f) {
      FILES.delete(from);
      FILES.set(to, { ...f, path: to });
    } else if (DIRS.has(from)) {
      DIRS.delete(from);
      DIRS.add(to);
      for (const [p, file] of [...FILES]) {
        if (p.startsWith(`${from}/`)) {
          FILES.delete(p);
          const np = to + p.slice(from.length);
          FILES.set(np, { ...file, path: np });
        }
      }
    } else throw new Error(`${source} does not exist`);
    broadcast('notify_filelist_changed', [{ action: 'move_file', item: { path: to, root: 'gcodes' } }]);
    return { item: { path: to, root: 'gcodes' }, action: 'move_file' };
  },
  'server.files.post_directory': ({ path }) => {
    const rel = stripRoot(path);
    if (DIRS.has(rel)) throw new Error('Directory already exists');
    DIRS.add(rel);
    broadcast('notify_filelist_changed', [{ action: 'create_dir', item: { path: rel, root: 'gcodes' } }]);
    return { item: { path: rel, root: 'gcodes' }, action: 'create_dir' };
  },
  'server.files.delete_directory': ({ path, force }) => {
    const rel = stripRoot(path);
    const contents = [...FILES.keys()].filter((p) => p.startsWith(`${rel}/`));
    if (contents.length && !force) throw new Error('Directory is not empty');
    for (const p of contents) FILES.delete(p);
    DIRS.delete(rel);
    broadcast('notify_filelist_changed', [{ action: 'delete_dir', item: { path: rel, root: 'gcodes' } }]);
    return { item: { path: rel, root: 'gcodes' }, action: 'delete_dir' };
  },
  'server.history.list': () => ({ count: history.length, jobs: history }),
  'server.history.totals': () => ({
    job_totals: {
      total_jobs: 42, total_time: 486000, total_print_time: 460000,
      total_filament_used: 812000, longest_job: 54000, longest_print: 52000,
    },
  }),
  'server.history.delete_job': ({ uid }) => {
    const i = history.findIndex((j) => j.job_id === uid);
    if (i >= 0) history.splice(i, 1);
    broadcast('notify_history_changed', [{ action: 'deleted', job: { job_id: uid } }]);
    return { deleted_jobs: [uid] };
  },
  'machine.system_info': () => ({
    system_info: {
      cpu_info: { cpu_count: 4, cpu_desc: 'ARMv7 Processor rev 3 (v7l)', model: PROFILE === 'neptune4' ? 'Rockchip RK3328' : 'Raspberry Pi 3 Model B Rev 1.2', total_memory: 3_884_816, memory_units: 'kB' },
      distribution: { name: PROFILE === 'neptune4' ? 'Armbian 22.05 Bullseye' : 'Debian GNU/Linux 11 (bullseye)' },
      available_services: ['klipper', 'moonraker', 'crowsnest'],
      service_state: {
        klipper: { active_state: 'active', sub_state: 'running' },
        moonraker: { active_state: 'active', sub_state: 'running' },
        crowsnest: { active_state: 'active', sub_state: 'running' },
      },
    },
  }),
  'machine.proc_stats': () => procStats(false),
  'machine.services.restart': ({ service }) => { respond(`// ${service} restarted`); return 'ok'; },
  'machine.device_power.devices': () => ({ devices: state.power }),
  'machine.device_power.post_device': ({ device, action }) => {
    const d = state.power.find((p) => p.device === device);
    if (!d) throw new Error(`Unknown device ${device}`);
    if (d.locked_while_printing && state.print.state === 'printing' && action !== 'on') {
      throw new Error(`Power device ${device} is locked while printing`);
    }
    d.status = action === 'toggle' ? (d.status === 'on' ? 'off' : 'on') : action;
    broadcast('notify_power_changed', [{ ...d }]);
    // The printer hangs on this plug: without power the MCU is gone, and
    // restart_klipper_when_powered brings Klipper back once it returns.
    if (d.status === 'off') {
      state.klippyReady = false;
      for (const h of Object.values(state.heaters)) h.target = 0;
      broadcast('notify_klippy_shutdown', []);
    } else {
      restartKlippy();
    }
    return { [device]: d.status };
  },
  'machine.update.status': () => ({
    busy: false,
    github_rate_limit: 60,
    version_info: {
      system: { package_count: 4, package_list: ['libc6', 'openssl', 'tzdata', 'curl'] },
      klipper: { name: 'klipper', configured_type: 'git_repo', version: 'v0.12.0-245', remote_version: 'v0.12.0-301', is_dirty: PROFILE === 'neptune4', is_valid: PROFILE !== 'neptune4', commits_behind: new Array(12).fill({}) },
      moonraker: { name: 'moonraker', configured_type: 'git_repo', version: 'v0.9.3-12', remote_version: 'v0.9.3-12', is_dirty: false, is_valid: true, commits_behind: [] },
      mainsail: { name: 'mainsail', configured_type: 'web', version: 'v2.13.1', remote_version: 'v2.14.0' },
    },
  }),
  'machine.update.refresh': () => handlers['machine.update.status'](),
  'machine.update.upgrade': async ({ name }) => {
    await sleep(3000);
    return 'ok';
  },
  'printer.gcode.script': ({ script }) => {
    gcodeLog.push({ message: script, time: Date.now() / 1000, type: 'command' });
    return runScript(script);
  },
  'printer.emergency_stop': () => {
    state.klippyReady = false;
    broadcast('notify_klippy_shutdown', []);
    return 'ok';
  },
  'printer.firmware_restart': () => restartKlippy(),
  'printer.restart': () => restartKlippy(),
  'printer.print.start': ({ filename }) => {
    Object.assign(state.print, { state: 'printing', filename, printDuration: 0, totalDuration: 0, filamentUsed: 0, currentLayer: 1, totalLayers: 200 });
    state.excluded = [];
    return 'ok';
  },
  'printer.print.pause': () => { state.print.state = 'paused'; return 'ok'; },
  'printer.print.resume': () => { state.print.state = 'printing'; return 'ok'; },
  'printer.print.cancel': () => { state.print.state = 'cancelled'; return 'ok'; },
  'access.oneshot_token': () => 'mock-token',
};

function restartKlippy() {
  state.klippyReady = false;
  broadcast('notify_klippy_disconnected', []);
  setTimeout(() => {
    state.klippyReady = true;
    broadcast('notify_klippy_ready', []);
  }, 1200);
  return 'ok';
}

async function runScript(script) {
  for (const line of String(script).split('\n')) {
    if (!line.trim()) continue;
    await applyGcode(line.trim());
  }
  return 'ok';
}

function param(line, name) {
  const m = new RegExp(`${name}=(\\S+)`, 'i').exec(line);
  return m ? m[1] : null;
}

function requireHomed() {
  if (state.toolhead.homed !== 'xyz') throw new Error('Must home axis first: 0.000 0.000 0.000 [0.000]');
}

async function applyGcode(line) {
  const upper = line.toUpperCase();
  const cmd = upper.split(/\s+/)[0];
  const s = /\bS([\d.]+)/i.exec(line);

  switch (cmd) {
    case 'SET_HEATER_TEMPERATURE': {
      // Klipper addresses heaters by the last word of their section name.
      const name = param(line, 'HEATER');
      const key = Object.keys(state.heaters).find((k) => k.split(' ').pop() === name);
      if (!key) throw new Error(`Unknown heater "${name}"`);
      state.heaters[key].target = Number(param(line, 'TARGET') ?? 0);
      return;
    }
    case 'M104': if (s) state.heaters.extruder.target = Number(s[1]); return;
    case 'M140': if (s) state.heaters.heater_bed.target = Number(s[1]); return;
    case 'M106': state.fans.fan = s ? Number(s[1]) / 255 : 1; return;
    case 'M107': state.fans.fan = 0; return;
    case 'M220': if (s) state.gcodeMove.speedFactor = Number(s[1]) / 100; return;
    case 'M221': if (s) state.gcodeMove.extrudeFactor = Number(s[1]) / 100; return;
    case 'M82': state.gcodeMove.absoluteExtrude = true; return;
    case 'M83': state.gcodeMove.absoluteExtrude = false; return;
    case 'M400': await sleep(300); return;
    case 'SET_GCODE_OFFSET': {
      const adjust = param(line, 'Z_ADJUST');
      const abs = param(line, 'Z');
      if (adjust) state.gcodeMove.zOffset = round(state.gcodeMove.zOffset + Number(adjust), 3);
      else if (abs) state.gcodeMove.zOffset = Number(abs);
      return;
    }
    case 'Z_OFFSET_APPLY_PROBE':
    case 'Z_OFFSET_APPLY_ENDSTOP': {
      const section = cmd === 'Z_OFFSET_APPLY_PROBE' ? 'probe' : 'stepper_z';
      if (cmd === 'Z_OFFSET_APPLY_PROBE' && !('probe' in P.config)) throw new Error('Unknown command:"Z_OFFSET_APPLY_PROBE"');
      state.savePending[section] = { [section === 'probe' ? 'z_offset' : 'position_endstop']: (-state.gcodeMove.zOffset).toFixed(3) };
      respond(`// ${section}: offset updated. Use SAVE_CONFIG to save it.`);
      return;
    }
    case 'TURN_OFF_HEATERS': for (const h of Object.values(state.heaters)) h.target = 0; return;
    case 'G28':
      await sleep(PROFILE === 'ender3v2' ? 2500 : 1200);
      state.toolhead.homed = 'xyz';
      state.toolhead.position = [P.axisMax[0] / 2, P.axisMax[1] / 2, 10, state.toolhead.position[3]];
      return;
    case 'M84':
    case 'M18':
      state.toolhead.homed = '';
      return;
    case 'G90':
    case 'G91':
      return;
    case 'G1':
    case 'G0': {
      const e = /\bE(-?[\d.]+)/i.exec(line);
      if (e) {
        // The mock assumes relative E (M83), which is all the app sends.
        const len = Math.abs(Number(e[1]));
        const max = P.config.extruder.max_extrude_only_distance;
        if (!/\b[XYZ]-?[\d.]/i.test(line) && len > max) {
          throw new Error(`Extrude only move too long (${len.toFixed(3)}mm vs ${max.toFixed(3)}mm)`);
        }
        if (state.heaters.extruder.temperature < P.config.extruder.min_extrude_temp) {
          throw new Error('Extrude below minimum temp');
        }
        const f = Number(/\bF([\d.]+)/i.exec(line)?.[1] ?? 300) / 60;
        await sleep(Math.min(4000, (len / Math.max(1, f)) * 1000 * 0.3));
      }
      const pos = state.toolhead.position;
      for (const [i, axis] of ['X', 'Y', 'Z'].entries()) {
        const m = new RegExp(`\\b${axis}(-?[\\d.]+)`, 'i').exec(line);
        if (m) {
          requireHomed();
          pos[i] = Number(m[1]);
        }
      }
      return;
    }
    case 'BED_MESH_CALIBRATE': {
      if (!state.mesh) throw new Error('Unknown command:"BED_MESH_CALIBRATE"');
      requireHomed();
      respond('// Probing mesh ...');
      await sleep(3500);
      state.mesh.probed = makeMesh(P.mesh);
      state.mesh.profile = 'default';
      state.mesh.profiles.default = {};
      state.savePending['bed_mesh default'] = { version: '1', points: '…' };
      respond('// Mesh Bed Leveling Complete');
      respond('// Bed Mesh state has been saved to profile [default]');
      return;
    }
    case 'BED_MESH_PROFILE': {
      if (!state.mesh) throw new Error('Unknown command');
      const load = param(line, 'LOAD');
      const save = param(line, 'SAVE');
      const remove = param(line, 'REMOVE');
      if (load) {
        if (!(load in state.mesh.profiles)) throw new Error(`bed_mesh: Unknown profile [${load}]`);
        state.mesh.profile = load;
        state.mesh.probed = makeMesh(P.mesh);
      }
      if (save) {
        state.mesh.profiles[save] = {};
        state.savePending[`bed_mesh ${save}`] = { version: '1' };
        respond(`// Bed Mesh state has been saved to profile [${save}]`);
      }
      if (remove) {
        delete state.mesh.profiles[remove];
        state.savePending[`bed_mesh ${remove}`] = { removed: 'true' };
        if (state.mesh.profile === remove) state.mesh.profile = null;
      }
      return;
    }
    case 'BED_MESH_CLEAR': if (state.mesh) state.mesh.profile = null; return;
    case 'SCREWS_TILT_CALCULATE': {
      if (!('screws_tilt_adjust' in P.config)) throw new Error('Unknown command:"SCREWS_TILT_CALCULATE"');
      requireHomed();
      await sleep(2500);
      const base = 2.5;
      const results = {};
      for (let i = 1; i <= 4; i++) {
        const z = i === 1 ? base : round(base + (Math.random() - 0.5) * 0.4, 4);
        const turns = Math.abs(z - base) / 0.7; // M4: 0.7 mm per turn
        const minutes = Math.round(turns * 60);
        results[`screw${i}`] = {
          z, sign: z > base ? 'CCW' : 'CW',
          adjust: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
          is_base: i === 1,
        };
        respond(`// ${P.config.screws_tilt_adjust[`screw${i}_name`]} : z=${z} : adjust ${results[`screw${i}`].sign} ${results[`screw${i}`].adjust}`);
      }
      state.screwsTilt = { error: false, max_deviation: null, results };
      return;
    }
    case 'BED_SCREWS_ADJUST':
      if (!('bed_screws' in P.config)) throw new Error('Unknown command:"BED_SCREWS_ADJUST"');
      requireHomed();
      Object.assign(state.bedScrews, { is_active: true, state: 'adjust', current_screw: 0, accepted_screws: 0, adjustedThisRound: false });
      respond('// Adjust bed screw "vorne links" ... then run ACCEPT, ADJUSTED, or ABORT');
      return;
    case 'ADJUSTED':
    case 'ACCEPT':
    case 'ABORT':
    case 'TESTZ':
      return handleToolCommand(cmd, line);
    case 'PROBE_CALIBRATE':
    case 'Z_ENDSTOP_CALIBRATE':
      if (cmd === 'PROBE_CALIBRATE' && !('probe' in P.config)) throw new Error('Unknown command:"PROBE_CALIBRATE"');
      requireHomed();
      await sleep(800);
      Object.assign(state.manualProbe, { is_active: true, z_position: 5, z_position_lower: null, z_position_upper: null, kind: cmd });
      respond('// Starting manual Z probe. Use TESTZ to adjust position.');
      return;
    case 'PID_CALIBRATE': {
      const heater = param(line, 'HEATER');
      const target = Number(param(line, 'TARGET') ?? 0);
      const key = Object.keys(state.heaters).find((k) => k.split(' ').pop() === heater);
      if (!key) throw new Error(`Unknown heater "${heater}"`);
      state.heaters[key].target = target;
      await sleep(6000);
      state.heaters[key].target = 0;
      respond('PID parameters: pid_Kp=22.865 pid_Ki=1.292 pid_Kd=101.178');
      respond('The SAVE_CONFIG command will update the printer config file with these parameters and restart the printer.');
      state.savePending[key] = { control: 'pid', pid_kp: '22.865', pid_ki: '1.292', pid_kd: '101.178' };
      return;
    }
    case 'SHAPER_CALIBRATE':
      if (!('resonance_tester' in P.config)) throw new Error('Unknown command:"SHAPER_CALIBRATE"');
      requireHomed();
      await sleep(4000);
      respond('Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz');
      respond('Recommended shaper_type_y = ei, shaper_freq_y = 41.2 Hz');
      state.savePending.input_shaper = { shaper_type_x: 'mzv', shaper_freq_x: '53.8', shaper_type_y: 'ei', shaper_freq_y: '41.2' };
      return;
    case 'ACCELEROMETER_QUERY':
      respond('// adxl345 values (x, y, z): 470.719200, 941.438400, 9728.196800');
      return;
    case 'SAVE_CONFIG':
      if (state.print.state === 'printing') throw new Error('SAVE_CONFIG would interrupt the print');
      state.savePending = {};
      respond('// Saving config and restarting');
      restartKlippy();
      return;
    case 'EXCLUDE_OBJECT': {
      const name = param(line, 'NAME');
      if (!P.objects?.some((o) => o.name === name)) throw new Error(`Unknown object ${name}`);
      if (!state.excluded.includes(name)) state.excluded.push(name);
      respond(`// Excluding object ${name}`);
      return;
    }
    case 'SET_PRESSURE_ADVANCE': state.pressureAdvance = Number(param(line, 'ADVANCE') ?? state.pressureAdvance); return;
    case 'SET_RETRACTION': {
      for (const k of ['RETRACT_LENGTH', 'RETRACT_SPEED', 'UNRETRACT_EXTRA_LENGTH', 'UNRETRACT_SPEED']) {
        const v = param(line, k);
        if (v != null) state.retraction[k.toLowerCase()] = Number(v);
      }
      return;
    }
    case 'SET_PIN': {
      const key = `output_pin ${param(line, 'PIN')}`;
      if (key in state.pins) state.pins[key] = Number(param(line, 'VALUE') ?? 0);
      return;
    }
    case 'SET_FAN_SPEED': {
      const key = `fan_generic ${param(line, 'FAN')}`;
      if (key in state.fans) state.fans[key] = Number(param(line, 'SPEED') ?? 0);
      return;
    }
    case 'SDCARD_RESET_FILE':
      Object.assign(state.print, { state: 'standby', filename: '', printDuration: 0, totalDuration: 0, filamentUsed: 0, currentLayer: 0, totalLayers: 0 });
      return;
    case 'STATUS':
    case 'HELP':
      respond(`// ${P.hostname} ready`);
      return;
    default:
      if (Object.keys(P.config).some((k) => k.toUpperCase() === `GCODE_MACRO ${cmd}`)) {
        respond(`// ${cmd} ausgeführt`);
        return;
      }
      if (/^[A-Z_]+$/.test(cmd)) throw new Error(`Unknown command:"${cmd}"`);
  }
}

function handleToolCommand(cmd, line) {
  const probe = state.manualProbe;
  if (probe.is_active) {
    if (cmd === 'TESTZ') {
      const z = param(line, 'Z') ?? '0';
      const current = probe.z_position;
      if (z === '+' || z === '-') {
        const bound = z === '+' ? (probe.z_position_upper ?? current + 1) : (probe.z_position_lower ?? 0);
        probe.z_position = round((current + bound) / 2, 3);
      } else {
        probe.z_position = round(current + Number(z), 3);
      }
      if (probe.z_position < current) probe.z_position_upper = current;
      else probe.z_position_lower = current;
      respond(`// Z position: ${probe.z_position_lower ?? '?'} --> ${probe.z_position} <-- ${probe.z_position_upper ?? '?'}`);
      return;
    }
    if (cmd === 'ACCEPT') {
      const section = probe.kind === 'PROBE_CALIBRATE' ? 'probe' : 'stepper_z';
      state.savePending[section] = { [section === 'probe' ? 'z_offset' : 'position_endstop']: String(probe.z_position) };
      respond(`// ${section}: ${section === 'probe' ? 'z_offset' : 'position_endstop'}: ${probe.z_position}. Use SAVE_CONFIG to save it.`);
    } else if (cmd === 'ABORT') {
      respond('// Manual probe aborted');
    } else {
      throw new Error(`Unknown command:"${cmd}"`);
    }
    Object.assign(probe, { is_active: false, z_position: null, z_position_lower: null, z_position_upper: null, kind: null });
    return;
  }

  const tool = state.bedScrews;
  if (tool.is_active) {
    const count = 4;
    if (cmd === 'ABORT') {
      Object.assign(tool, { is_active: false, state: null });
      respond('// Bed screws tool aborted');
      return;
    }
    if (cmd === 'ADJUSTED') tool.adjustedThisRound = true;
    if (cmd === 'ACCEPT') tool.accepted_screws += 1;
    if (cmd === 'TESTZ') throw new Error('Unknown command:"TESTZ"');
    tool.current_screw += 1;
    if (tool.current_screw >= count) {
      if (!tool.adjustedThisRound) {
        Object.assign(tool, { is_active: false, state: null });
        respond('// Bed screws tool completed successfully');
        return;
      }
      Object.assign(tool, { current_screw: 0, accepted_screws: 0, adjustedThisRound: false, state: 'fine' });
    }
    respond(`// Adjust bed screw "${P.config.bed_screws[`screw${tool.current_screw + 1}_name`]}"`);
    return;
  }
  throw new Error(`Unknown command:"${cmd}"`);
}

// --- HTTP + WebSocket -------------------------------------------------------

function thumbnailPng() {
  // Minimal 300x300 PNG drawn without any image library.
  const size = 300;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const inCube = x > 70 && x < 230 && y > 70 && y < 230;
      const shade = inCube ? 40 + ((x + y) % 40) : 18;
      raw[o++] = inCube ? shade : 11;
      raw[o++] = inCube ? shade + 60 : 15;
      raw[o++] = inCube ? shade + 110 : 20;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const THUMB = thumbnailPng();

/** Just enough multipart parsing for the upload endpoint. */
function parseMultipart(body, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType ?? '')?.[1];
  if (!boundary) return {};
  const fields = {};
  for (const part of body.toString('binary').split(`--${boundary}`)) {
    const [head, ...rest] = part.split('\r\n\r\n');
    const name = /name="([^"]+)"/.exec(head ?? '')?.[1];
    if (!name) continue;
    const value = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    fields[name] = filename != null ? { filename, content: Buffer.from(value, 'binary') } : value;
  }
  return fields;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (url.pathname.endsWith('.png') || url.pathname === '/webcam/') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(THUMB);
  }
  if (url.pathname === '/server/info') return json(200, { result: handlers['server.info']() });
  if (url.pathname === '/access/oneshot_token') return json(200, { result: 'mock-token' });

  const configMatch = /^\/server\/files\/config\/(.+)$/.exec(url.pathname);
  if (req.method === 'GET' && configMatch) {
    const text = CONFIG_FILES.get(decodeURIComponent(configMatch[1]));
    if (text == null) return json(404, { error: { code: 404, message: 'not found' } });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(text);
  }
  const logMatch = /^\/server\/files\/logs\/(.+)$/.exec(url.pathname);
  if (req.method === 'GET' && logMatch) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`Mock ${logMatch[1]}\nStarting Klippy...\nPrinter is ready\n`);
  }

  if (url.pathname === '/server/files/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const fields = parseMultipart(Buffer.concat(chunks), req.headers['content-type']);
      const root = fields.root ?? 'gcodes';
      const file = fields.file;
      const name = file?.filename ?? 'upload.gcode';
      const path = fields.path ? `${fields.path}/${name}` : name;
      if (root === 'config') {
        CONFIG_FILES.set(path, file?.content.toString('utf8') ?? '');
      } else {
        FILES.set(path, { path, size: file?.content.length ?? 0, time: 1800, filament: 4000, height: 20, startByte: 0, endByte: file?.content.length ?? 0, ext: 210, bed: 60, modified: Date.now() / 1000 });
        broadcast('notify_filelist_changed', [{ action: 'create_file', item: { path, root } }]);
      }
      let printStarted = false;
      if (fields.print === 'true' && root === 'gcodes') {
        handlers['printer.print.start']({ filename: path });
        printStarted = true;
      }
      json(201, { result: { item: { path, root }, print_started: printStarted, action: 'create_file' } });
    });
    return;
  }
  json(404, { error: { code: 404, message: 'not found' } });
});

const wss = new WebSocketServer({ server, path: '/websocket' });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const handler = handlers[msg.method];
    const reply = (body) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body }));
    };
    if (!handler) return reply({ error: { code: -32601, message: `Method not found: ${msg.method}` } });
    try {
      reply({ result: await handler(msg.params ?? {}) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (msg.method === 'printer.gcode.script') respond(`!! ${message}`);
      reply({ error: { code: 400, message } });
    }
  });
});

server.listen(port, () => {
  console.log(`Mock Moonraker (${PROFILE}) läuft auf http://localhost:${port} (ws: /websocket)`);
});
