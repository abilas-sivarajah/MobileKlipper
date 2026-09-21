/**
 * Mock Moonraker instance for development.
 *
 * Speaks enough of the real API — JSON-RPC over /websocket plus the HTTP file
 * endpoints — to drive the whole app without a printer: it simulates heating,
 * a running print with layer progress, temperature noise and gcode responses.
 *
 *   node tools/mock-moonraker.mjs [--port 7125]
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { deflateSync, crc32 } from 'node:zlib';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 7125;

// --- simulated printer state ------------------------------------------------

// startByte covers the embedded thumbnails, endByte excludes the slicer's
// config block at the end of the file - both matter for progress reporting.
const FILES = [
  { name: 'voron_cube.gcode', size: 4_812_340, time: 5040, filament: 12_400, height: 40, startByte: 128_000, endByte: 4_760_000 },
  { name: 'benchy.gcode', size: 2_145_998, time: 3120, filament: 8200, height: 48, startByte: 96_000, endByte: 2_112_000 },
  { name: 'bracket_v3.gcode', size: 812_004, time: 1260, filament: 3100, height: 12, startByte: 64_000, endByte: 798_000 },
];

const state = {
  klippyReady: true,
  print: {
    state: 'printing',
    filename: 'voron_cube.gcode',
    printDuration: 1260,
    totalDuration: 1320,
    filamentUsed: 3100,
    currentLayer: 63,
    totalLayers: 200,
  },
  heaters: {
    extruder: { temperature: 248.4, target: 250, power: 0.42 },
    heater_bed: { temperature: 99.8, target: 100, power: 0.31 },
    'heater_generic chamber': { temperature: 47.2, target: 50, power: 0.2 },
  },
  sensors: {
    'temperature_sensor mcu': 41.3,
    'temperature_sensor raspberry_pi': 52.7,
  },
  fans: { fan: 0.85, 'fan_generic filter': 0.4, 'heater_fan hotend_fan': 1 },
  toolhead: { position: [117.4, 96.2, 12.6, 812.4], homed: 'xyz' },
  gcodeMove: { speedFactor: 1, extrudeFactor: 1, zOffset: 0.03 },
};

const CONFIG = {
  extruder: { max_temp: 300, min_temp: 0 },
  heater_bed: { max_temp: 120, min_temp: 0 },
  'heater_generic chamber': { max_temp: 70, min_temp: 0 },
  'gcode_macro START_PRINT': { description: 'Heizt auf und macht ein Purge-Line' },
  'gcode_macro END_PRINT': { description: 'Fährt den Kopf weg und kühlt ab' },
  'gcode_macro LOAD_FILAMENT': { description: 'Filament laden' },
  'gcode_macro UNLOAD_FILAMENT': { description: 'Filament entladen' },
  'gcode_macro _HELPER': { description: 'intern' },
  'output_pin caselight': { pwm: 'True', scale: '1' },
  printer: { kinematics: 'corexy', max_velocity: '300' },
};

const clients = new Set();
const tempStore = {};

function printerStatus() {
  const s = {
    webhooks: { state: state.klippyReady ? 'ready' : 'shutdown', state_message: state.klippyReady ? 'Printer is ready' : 'Shutdown' },
    print_stats: {
      filename: state.print.filename,
      state: state.print.state,
      print_duration: state.print.printDuration,
      total_duration: state.print.totalDuration,
      filament_used: state.print.filamentUsed,
      message: '',
      info: { current_layer: state.print.currentLayer, total_layer_count: state.print.totalLayers },
    },
    display_status: { progress: state.print.currentLayer / state.print.totalLayers, message: null },
    virtual_sdcard: {
      // Klipper reports the raw byte position over the whole file; the printable
      // span is what a front-end has to derive from the metadata.
      progress: filePosition() / currentFile().size,
      is_active: state.print.state === 'printing',
      file_position: filePosition(),
      file_size: currentFile().size,
    },
    toolhead: {
      position: state.toolhead.position,
      homed_axes: state.toolhead.homed,
      axis_minimum: [0, 0, -2, 0],
      axis_maximum: [350, 350, 330, 0],
      extruder: 'extruder',
      max_velocity: 300,
      max_accel: 5000,
    },
    gcode_move: {
      speed_factor: state.gcodeMove.speedFactor,
      extrude_factor: state.gcodeMove.extrudeFactor,
      homing_origin: [0, 0, state.gcodeMove.zOffset, 0],
      gcode_position: state.toolhead.position,
      position: state.toolhead.position,
      speed: 7200,
      absolute_coordinates: true,
    },
    idle_timeout: { state: state.print.state === 'printing' ? 'Printing' : 'Ready', printing_time: 1260 },
    pause_resume: { is_paused: state.print.state === 'paused' },
    fan: { speed: state.fans.fan, rpm: null },
    configfile: { config: CONFIG, settings: lowerKeys(CONFIG), save_config_pending: false, warnings: [] },
    'output_pin caselight': { value: 0.8 },
    'filament_switch_sensor runout': { filament_detected: true, enabled: true },
  };
  for (const [key, h] of Object.entries(state.heaters)) {
    s[key] = { temperature: round(h.temperature), target: h.target, power: round(h.power, 2) };
    if (key === 'extruder') s[key].can_extrude = h.temperature > 170;
  }
  for (const [key, value] of Object.entries(state.sensors)) {
    s[key] = { temperature: round(value), measured_min_temp: round(value - 12), measured_max_temp: round(value + 4) };
  }
  for (const [key, speed] of Object.entries(state.fans)) {
    if (key === 'fan') continue;
    s[key] = { speed, rpm: key.startsWith('heater_fan') ? 6200 : null };
  }
  return s;
}

function currentFile() {
  return FILES.find((f) => f.name === state.print.filename.split('/').pop()) ?? FILES[0];
}

function filePosition() {
  const f = currentFile();
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
    h.temperature += delta * 0.08 + (Math.random() - 0.5) * 0.35;
    h.power = Math.max(0, Math.min(1, delta * 0.05 + 0.15 + (Math.random() - 0.5) * 0.05));
    if (h.target === 0) h.temperature = Math.max(22, h.temperature - 0.4);
    (tempStore[key] ??= { temperatures: [], targets: [], powers: [] });
  }
  for (const key of Object.keys(state.sensors)) {
    state.sensors[key] += (Math.random() - 0.5) * 0.3;
    tempStore[key] ??= { temperatures: [] };
  }

  if (state.print.state === 'printing') {
    state.print.printDuration += 0.25;
    state.print.totalDuration += 0.25;
    state.print.filamentUsed += 0.9;
    if (Math.random() < 0.05 && state.print.currentLayer < state.print.totalLayers) {
      state.print.currentLayer += 1;
      state.toolhead.position[2] = round(state.print.currentLayer * 0.2, 2);
    }
    state.toolhead.position[0] = round(120 + Math.sin(Date.now() / 900) * 60, 1);
    state.toolhead.position[1] = round(110 + Math.cos(Date.now() / 1100) * 55, 1);
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
    entry.temperatures.push(round(24 + (h.target - 24) * warmup + (Math.random() - 0.5) * 1.2));
    entry.targets.push(i < 60 ? 0 : h.target);
    entry.powers.push(round(Math.random() * 0.4, 2));
  }
  for (const [key, value] of Object.entries(state.sensors)) {
    const entry = (tempStore[key] ??= { temperatures: [] });
    entry.temperatures.push(round(value + (Math.random() - 0.5) * 3));
  }
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

// --- JSON-RPC ---------------------------------------------------------------

const handlers = {
  'server.info': () => ({
    klippy_connected: true,
    klippy_state: state.klippyReady ? 'ready' : 'shutdown',
    components: ['server', 'file_manager', 'klippy_apis', 'webcam', 'history'],
    moonraker_version: 'v0.9.3-mock',
    api_version: [1, 5, 0],
    websocket_count: clients.size,
    warnings: [],
  }),
  'printer.info': () => ({
    state: state.klippyReady ? 'ready' : 'shutdown',
    state_message: 'Printer is ready',
    hostname: 'mock-printer',
    software_version: 'v0.12.0-mock',
  }),
  'printer.objects.list': () => ({
    objects: [
      'webhooks', 'print_stats', 'display_status', 'virtual_sdcard', 'toolhead', 'gcode_move',
      'idle_timeout', 'pause_resume', 'configfile', 'fan', 'extruder', 'heater_bed',
      ...Object.keys(state.heaters).filter((k) => k.startsWith('heater_generic')),
      ...Object.keys(state.sensors), ...Object.keys(state.fans).filter((k) => k !== 'fan'),
      'output_pin caselight', 'filament_switch_sensor runout',
      ...Object.keys(CONFIG).filter((k) => k.startsWith('gcode_macro ')),
    ],
  }),
  'printer.objects.subscribe': () => ({ eventtime: Date.now() / 1000, status: printerStatus() }),
  'printer.objects.query': () => ({ eventtime: Date.now() / 1000, status: printerStatus() }),
  'server.temperature_store': () => tempStore,
  'server.gcode_store': () => ({ gcode_store: gcodeLog }),
  'server.webcams.list': () => ({
    webcams: [{
      name: 'Kamera', location: 'printer', service: 'mjpegstreamer-adaptive', enabled: true,
      target_fps: 15, stream_url: '/webcam/?action=stream', snapshot_url: '/webcam/?action=snapshot',
      flip_horizontal: false, flip_vertical: false, rotation: 0, uid: 'cam1',
    }],
  }),
  'server.files.get_directory': ({ path = 'gcodes' } = {}) => ({
    dirs: path === 'gcodes' ? [{ dirname: 'archiv', modified: Date.now() / 1000 - 90000, size: 4096 }] : [],
    files: FILES.map((f, i) => ({
      filename: f.name, modified: Date.now() / 1000 - i * 8000, size: f.size,
      estimated_time: f.time, filament_total: f.filament, object_height: f.height,
      layer_height: 0.2, first_layer_height: 0.24, slicer: 'OrcaSlicer', slicer_version: '2.1.0',
      gcode_start_byte: f.startByte, gcode_end_byte: f.endByte,
      filament_weight_total: Math.round(f.filament * 0.003 * 10) / 10,
      filament_type: 'PLA', filament_name: 'Prusament Galaxy Black', nozzle_diameter: 0.4,
      thumbnails: [{ width: 300, height: 300, size: 8000, relative_path: `.thumbs/${f.name.replace('.gcode', '')}-300x300.png` }],
    })),
    disk_usage: { total: 30_000_000_000, used: 12_000_000_000, free: 18_000_000_000 },
    root_info: { name: 'gcodes', permissions: 'rw' },
  }),
  'server.files.metadata': ({ filename }) => {
    const f = FILES.find((x) => x.name === filename.split('/').pop()) ?? FILES[0];
    return {
      filename, size: f.size, modified: Date.now() / 1000, estimated_time: f.time,
      filament_total: f.filament, object_height: f.height, layer_height: 0.2,
      first_layer_height: 0.24, slicer: 'OrcaSlicer', filament_type: 'PLA',
      gcode_start_byte: f.startByte, gcode_end_byte: f.endByte,
      filament_weight_total: Math.round(f.filament * 0.003 * 10) / 10,
      thumbnails: [{ width: 300, height: 300, size: 8000, relative_path: `.thumbs/${f.name.replace('.gcode', '')}-300x300.png` }],
    };
  },
  'server.history.list': () => ({
    count: 3,
    jobs: FILES.map((f, i) => ({
      job_id: `0000${i}`, filename: f.name, status: i === 1 ? 'cancelled' : 'completed',
      start_time: Date.now() / 1000 - (i + 1) * 90000, end_time: Date.now() / 1000 - (i + 1) * 90000 + f.time,
      print_duration: f.time, total_duration: f.time + 120, filament_used: f.filament, exists: true,
    })),
  }),
  'server.history.totals': () => ({
    job_totals: {
      total_jobs: 42, total_time: 486000, total_print_time: 460000,
      total_filament_used: 812000, longest_job: 54000, longest_print: 52000,
    },
  }),
  'machine.system_info': () => ({ system_info: { cpu_info: { cpu_desc: 'ARM Cortex-A72', model: 'Raspberry Pi 4' } } }),
  'machine.proc_stats': () => ({ cpu_temp: 52.4, system_uptime: 184000, websocket_connections: clients.size }),
  'printer.gcode.script': ({ script }) => {
    gcodeLog.push({ message: script, time: Date.now() / 1000, type: 'command' });
    applyGcode(script);
    return 'ok';
  },
  'printer.emergency_stop': () => {
    state.klippyReady = false;
    broadcast('notify_klippy_shutdown', []);
    return 'ok';
  },
  'printer.firmware_restart': () => {
    state.klippyReady = true;
    setTimeout(() => broadcast('notify_klippy_ready', []), 300);
    return 'ok';
  },
  'printer.print.start': ({ filename }) => {
    Object.assign(state.print, { state: 'printing', filename, printDuration: 0, currentLayer: 1 });
    return 'ok';
  },
  'printer.print.pause': () => { state.print.state = 'paused'; return 'ok'; },
  'printer.print.resume': () => { state.print.state = 'printing'; return 'ok'; },
  'printer.print.cancel': () => { state.print.state = 'cancelled'; return 'ok'; },
  'server.files.delete_file': () => ({ item: { path: 'x', root: 'gcodes' } }),
  'access.oneshot_token': () => 'mock-token',
};

function applyGcode(script) {
  const upper = script.toUpperCase();
  let reply = null;
  const heater = /SET_HEATER_TEMPERATURE\s+HEATER=(\S+)\s+TARGET=([\d.]+)/i.exec(script);
  if (heater && state.heaters[heater[1]]) state.heaters[heater[1]].target = Number(heater[2]);
  if (/^M104/.test(upper)) {
    const s = /S([\d.]+)/i.exec(script);
    if (s) state.heaters.extruder.target = Number(s[1]);
  }
  if (/^M140/.test(upper)) {
    const s = /S([\d.]+)/i.exec(script);
    if (s) state.heaters.heater_bed.target = Number(s[1]);
  }
  if (/^M106/.test(upper)) {
    const s = /S([\d.]+)/i.exec(script);
    state.fans.fan = s ? Number(s[1]) / 255 : 1;
  }
  if (/^M107/.test(upper)) state.fans.fan = 0;
  if (/^M220/.test(upper)) {
    const s = /S([\d.]+)/i.exec(script);
    if (s) state.gcodeMove.speedFactor = Number(s[1]) / 100;
  }
  if (/^M221/.test(upper)) {
    const s = /S([\d.]+)/i.exec(script);
    if (s) state.gcodeMove.extrudeFactor = Number(s[1]) / 100;
  }
  if (/^SET_GCODE_OFFSET/.test(upper)) {
    const z = /Z_ADJUST=(-?[\d.]+)/i.exec(script);
    const abs = /Z=(-?[\d.]+)/i.exec(script);
    if (z) state.gcodeMove.zOffset = round(state.gcodeMove.zOffset + Number(z[1]), 3);
    else if (abs) state.gcodeMove.zOffset = Number(abs[1]);
  }
  if (/^TURN_OFF_HEATERS/.test(upper)) for (const h of Object.values(state.heaters)) h.target = 0;
  if (/^G28/.test(upper)) {
    state.toolhead.homed = 'xyz';
    reply = '// Homing complete';
  }
  if (/^M84|^M18/.test(upper)) {
    state.toolhead.homed = '';
    reply = '// Motors off';
  }
  if (/^STATUS|^HELP/.test(upper)) reply = '// mock-printer ready';
  if (reply) {
    gcodeLog.push({ message: reply, time: Date.now() / 1000, type: 'response' });
    setTimeout(() => broadcast('notify_gcode_response', [reply]), 50);
  }
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

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  if (url.pathname.endsWith('.png')) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(THUMB);
  }
  if (url.pathname === '/webcam/') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(THUMB);
  }
  if (url.pathname === '/server/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: handlers['server.info']() }));
  }
  if (url.pathname === '/access/oneshot_token') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: 'mock-token' }));
  }
  if (url.pathname === '/server/files/upload') {
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: { item: { path: 'upload.gcode', root: 'gcodes' }, print_started: false } }));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 404, message: 'not found' } }));
});

const wss = new WebSocketServer({ server, path: '/websocket' });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const handler = handlers[msg.method];
    const respond = (body) => ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body }));
    if (!handler) return respond({ error: { code: -32601, message: `Unknown method ${msg.method}` } });
    try {
      respond({ result: handler(msg.params ?? {}) });
    } catch (err) {
      respond({ error: { code: -32000, message: String(err) } });
    }
  });
});

server.listen(port, () => {
  console.log(`Mock Moonraker läuft auf http://localhost:${port} (ws: /websocket)`);
});
