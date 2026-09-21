/**
 * High-level Moonraker client: owns the JSON-RPC connection, keeps printer
 * object subscriptions alive across reconnects, and exposes typed API calls.
 */
import { RpcConnection, RpcError, type JsonRpcNotification, type SocketState } from './rpc';
import type {
  DirectoryInfo,
  FileEntry,
  GcodeMetadata,
  GcodeStoreEntry,
  HistoryJob,
  HistoryTotals,
  KlippyState,
  PrinterInfo,
  PrinterStatus,
  ProcStats,
  ServerInfo,
  SystemInfo,
  TemperatureStore,
  WebcamConfig,
} from './types';

export type FileRoot = 'gcodes' | 'config' | 'logs' | 'timelapse';

export interface MoonrakerEndpoint {
  /** Base HTTP URL without trailing slash, e.g. http://printer.local:7125 */
  baseUrl: string;
  apiKey?: string;
  /** Moonraker user JWT, when the instance uses accounts instead of API keys. */
  token?: string;
}

export interface ClientEvents {
  onConnectionState?: (state: SocketState, detail?: string) => void;
  onKlippyState?: (state: KlippyState, message?: string) => void;
  onStatusUpdate?: (patch: PrinterStatus, eventtime: number) => void;
  onGcodeResponse?: (line: string) => void;
  onFileListChanged?: (payload: unknown) => void;
  onHistoryChanged?: (payload: unknown) => void;
  onProcStats?: (payload: ProcStats) => void;
  onError?: (err: Error) => void;
  /** Fires once the printer objects have been (re)subscribed. */
  onReady?: (status: PrinterStatus, objects: string[]) => void;
}

/** Printer objects we always want when the printer exposes them. */
const CORE_OBJECTS = [
  'webhooks',
  'print_stats',
  'display_status',
  'virtual_sdcard',
  'toolhead',
  'gcode_move',
  'extruder',
  'heater_bed',
  'fan',
  'idle_timeout',
  'pause_resume',
  'motion_report',
  'configfile',
  'bed_mesh',
  'exclude_object',
  'firmware_retraction',
  'mcu',
];

/** Object name prefixes worth subscribing to wholesale (heaters, fans, sensors). */
const DYNAMIC_PREFIXES = [
  'extruder',
  'heater_generic ',
  'heater_fan ',
  'controller_fan ',
  'temperature_fan ',
  'temperature_sensor ',
  'fan_generic ',
  'output_pin ',
  'led ',
  'neopixel ',
  'dotstar ',
  'pwm_cycle_time ',
  'filament_switch_sensor ',
  'filament_motion_sensor ',
  'gcode_macro ',
  'z_thermal_adjust',
  'screws_tilt_adjust',
  'quad_gantry_level',
  'z_tilt',
  'manual_probe',
  'probe',
  'bed_screws',
];

export function pickSubscribedObjects(available: string[]): string[] {
  const wanted = new Set<string>();
  for (const name of available) {
    if (CORE_OBJECTS.includes(name)) {
      wanted.add(name);
      continue;
    }
    if (DYNAMIC_PREFIXES.some((p) => (p.endsWith(' ') ? name.startsWith(p) : name === p))) {
      wanted.add(name);
    }
  }
  return [...wanted].sort();
}

/** Moonraker sends sparse patches; merge them one level deep. */
export function mergeStatus(base: PrinterStatus, patch: PrinterStatus): PrinterStatus {
  const next: PrinterStatus = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) continue;
    const prev = next[key];
    next[key] = prev ? { ...prev, ...value } : { ...value };
  }
  return next;
}

export function websocketUrlFor(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = url.pathname.replace(/\/+$/, '');
  url.pathname = `${base}/websocket`;
  return url.toString();
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  if (!url.port && url.protocol === 'http:' && url.pathname === '/') url.port = '7125';
  return url.toString().replace(/\/+$/, '');
}

export class MoonrakerClient {
  private rpc: RpcConnection | null = null;
  private subscribed: string[] = [];
  private initializing = false;
  private klippyState: KlippyState = 'disconnected';

  constructor(
    private endpoint: MoonrakerEndpoint,
    private events: ClientEvents = {},
  ) {}

  get connectionState(): SocketState {
    return this.rpc?.getState() ?? 'idle';
  }

  get isConnected(): boolean {
    return this.rpc?.isOpen ?? false;
  }

  get klippy(): KlippyState {
    return this.klippyState;
  }

  get subscribedObjects(): string[] {
    return this.subscribed;
  }

  async connect(): Promise<void> {
    this.disconnect();
    let wsUrl = websocketUrlFor(this.endpoint.baseUrl);

    // Browsers cannot set headers on a WebSocket handshake, so an API key has to
    // be exchanged for a single-use token passed in the query string.
    const oneshot = await this.fetchOneshotToken();
    if (oneshot) {
      const url = new URL(wsUrl);
      url.searchParams.set('token', oneshot);
      wsUrl = url.toString();
    }

    this.rpc = new RpcConnection({
      url: wsUrl,
      timeoutMs: 20_000,
      idleTimeoutMs: 60_000,
      onStateChange: (state, detail) => {
        if (state !== 'open') {
          this.subscribed = [];
          this.setKlippyState('disconnected');
        }
        this.events.onConnectionState?.(state, detail);
      },
      onOpen: () => {
        void this.initialize();
      },
      onNotification: (n) => this.handleNotification(n),
    });
    this.rpc.connect();
  }

  disconnect(reason = 'disconnected by user'): void {
    this.rpc?.dispose(reason);
    this.rpc = null;
    this.subscribed = [];
    this.setKlippyState('disconnected');
  }

  updateEndpoint(endpoint: MoonrakerEndpoint): void {
    this.endpoint = endpoint;
  }

  setEvents(events: ClientEvents): void {
    this.events = events;
  }

  // --- connection bootstrap ---------------------------------------------

  private async initialize(): Promise<void> {
    if (this.initializing) return;
    this.initializing = true;
    try {
      const info = await this.serverInfo();
      this.setKlippyState(info.klippy_connected ? info.klippy_state : 'disconnected');
      if (!info.klippy_connected || info.klippy_state !== 'ready') {
        // Klipper is down; notify_klippy_ready will re-trigger this.
        return;
      }
      await this.subscribePrinterObjects();
    } catch (err) {
      this.reportError(err);
    } finally {
      this.initializing = false;
    }
  }

  private async subscribePrinterObjects(): Promise<void> {
    const { objects } = await this.call<{ objects: string[] }>('printer.objects.list');
    const wanted = pickSubscribedObjects(objects);
    const request: Record<string, null> = {};
    for (const name of wanted) request[name] = null;
    const res = await this.call<{ eventtime: number; status: PrinterStatus }>(
      'printer.objects.subscribe',
      { objects: request },
    );
    this.subscribed = wanted;
    this.events.onStatusUpdate?.(res.status, res.eventtime);
    this.events.onReady?.(res.status, objects);
  }

  private handleNotification(n: JsonRpcNotification): void {
    switch (n.method) {
      case 'notify_status_update': {
        const [status, eventtime] = n.params as [PrinterStatus, number];
        if (status) this.events.onStatusUpdate?.(status, eventtime ?? 0);
        break;
      }
      case 'notify_gcode_response': {
        const [line] = n.params as [string];
        if (typeof line === 'string') this.events.onGcodeResponse?.(line);
        break;
      }
      case 'notify_klippy_ready':
        this.setKlippyState('ready');
        void this.subscribePrinterObjects().catch((err) => this.reportError(err));
        break;
      case 'notify_klippy_shutdown':
        this.setKlippyState('shutdown');
        break;
      case 'notify_klippy_disconnected':
        this.setKlippyState('disconnected');
        break;
      case 'notify_filelist_changed':
        this.events.onFileListChanged?.(n.params[0]);
        break;
      case 'notify_history_changed':
        this.events.onHistoryChanged?.(n.params[0]);
        break;
      case 'notify_proc_stat_update':
        this.events.onProcStats?.(n.params[0] as ProcStats);
        break;
      default:
        break;
    }
  }

  private setKlippyState(state: KlippyState, message?: string): void {
    if (this.klippyState === state) return;
    this.klippyState = state;
    this.events.onKlippyState?.(state, message);
  }

  private reportError(err: unknown): void {
    this.events.onError?.(err instanceof Error ? err : new Error(String(err)));
  }

  // --- raw call ---------------------------------------------------------

  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.rpc) throw new RpcError('Client not connected', -32000, method);
    return this.rpc.call<T>(method, params);
  }

  // --- server / printer -------------------------------------------------

  serverInfo(): Promise<ServerInfo> {
    return this.call<ServerInfo>('server.info');
  }

  printerInfo(): Promise<PrinterInfo> {
    return this.call<PrinterInfo>('printer.info');
  }

  queryObjects(objects: Record<string, string[] | null>): Promise<{
    eventtime: number;
    status: PrinterStatus;
  }> {
    return this.call('printer.objects.query', { objects });
  }

  gcode(script: string): Promise<string> {
    return this.call<string>('printer.gcode.script', { script });
  }

  emergencyStop(): Promise<string> {
    return this.call<string>('printer.emergency_stop');
  }

  firmwareRestart(): Promise<string> {
    return this.call<string>('printer.firmware_restart');
  }

  klipperRestart(): Promise<string> {
    return this.call<string>('printer.restart');
  }

  hostReboot(): Promise<string> {
    return this.call<string>('machine.reboot');
  }

  hostShutdown(): Promise<string> {
    return this.call<string>('machine.shutdown');
  }

  restartService(service: string): Promise<string> {
    return this.call<string>('machine.services.restart', { service });
  }

  systemInfo(): Promise<{ system_info: SystemInfo }> {
    return this.call('machine.system_info');
  }

  procStats(): Promise<ProcStats> {
    return this.call<ProcStats>('machine.proc_stats');
  }

  // --- print jobs -------------------------------------------------------

  startPrint(filename: string): Promise<string> {
    return this.call<string>('printer.print.start', { filename });
  }

  pausePrint(): Promise<string> {
    return this.call<string>('printer.print.pause');
  }

  resumePrint(): Promise<string> {
    return this.call<string>('printer.print.resume');
  }

  cancelPrint(): Promise<string> {
    return this.call<string>('printer.print.cancel');
  }

  // --- files ------------------------------------------------------------

  listFiles(root: FileRoot = 'gcodes'): Promise<FileEntry[]> {
    return this.call<FileEntry[]>('server.files.list', { root });
  }

  getDirectory(path: string, extended = true): Promise<DirectoryInfo> {
    return this.call<DirectoryInfo>('server.files.get_directory', { path, extended });
  }

  metadata(filename: string): Promise<GcodeMetadata> {
    return this.call<GcodeMetadata>('server.files.metadata', { filename });
  }

  deleteFile(path: string): Promise<unknown> {
    return this.call('server.files.delete_file', { path });
  }

  moveFile(source: string, dest: string): Promise<unknown> {
    return this.call('server.files.move', { source, dest });
  }

  copyFile(source: string, dest: string): Promise<unknown> {
    return this.call('server.files.copy', { source, dest });
  }

  createDirectory(path: string): Promise<unknown> {
    return this.call('server.files.post_directory', { path });
  }

  deleteDirectory(path: string, force = false): Promise<unknown> {
    return this.call('server.files.delete_directory', { path, force });
  }

  // --- history ----------------------------------------------------------

  historyList(limit = 50, start = 0): Promise<{ count: number; jobs: HistoryJob[] }> {
    return this.call('server.history.list', { limit, start, order: 'desc' });
  }

  historyTotals(): Promise<{ job_totals: HistoryTotals }> {
    return this.call('server.history.totals');
  }

  deleteHistoryJob(uid: string): Promise<unknown> {
    return this.call('server.history.delete_job', { uid });
  }

  // --- misc -------------------------------------------------------------

  temperatureStore(includeMonitors = false): Promise<TemperatureStore> {
    return this.call<TemperatureStore>('server.temperature_store', {
      include_monitors: includeMonitors,
    });
  }

  gcodeStore(count = 100): Promise<{ gcode_store: GcodeStoreEntry[] }> {
    return this.call('server.gcode_store', { count });
  }

  listWebcams(): Promise<{ webcams: WebcamConfig[] }> {
    return this.call('server.webcams.list');
  }

  databaseGet<T = unknown>(namespace: string, key?: string): Promise<{ value: T }> {
    return this.call('server.database.get_item', key ? { namespace, key } : { namespace });
  }

  databaseSet<T = unknown>(namespace: string, key: string, value: T): Promise<unknown> {
    return this.call('server.database.post_item', { namespace, key, value });
  }

  // --- HTTP helpers -----------------------------------------------------

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.endpoint.apiKey) headers['X-Api-Key'] = this.endpoint.apiKey;
    if (this.endpoint.token) headers['Authorization'] = `Bearer ${this.endpoint.token}`;
    return headers;
  }

  private async fetchOneshotToken(): Promise<string | null> {
    if (!this.endpoint.apiKey && !this.endpoint.token) return null;
    try {
      const res = await fetch(`${this.endpoint.baseUrl}/access/oneshot_token`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { result?: string };
      return body.result ?? null;
    } catch {
      // Unauthenticated instances simply reject this; connecting without a
      // token is then the correct behaviour.
      return null;
    }
  }

  /** Absolute URL for a file inside a Moonraker root, usable in <img>/<a>. */
  fileUrl(root: FileRoot, relativePath: string): string {
    // Encode per segment: a filename may legitimately contain "#", "?" or "+".
    const clean = relativePath
      .replace(/^\/+/, '')
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const url = `${this.endpoint.baseUrl}/server/files/${root}/${clean}`;
    if (!this.endpoint.apiKey) return url;
    // <img> cannot send headers; Moonraker accepts the key as a query param.
    return `${url}${url.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(this.endpoint.apiKey)}`;
  }

  /** Resolves a thumbnail path (relative to the gcode file) to a URL. */
  thumbnailUrl(gcodePath: string, relativePath: string): string {
    // relative_path is always relative to the gcode file's own directory.
    const dir = gcodePath.includes('/') ? gcodePath.slice(0, gcodePath.lastIndexOf('/')) : '';
    return this.fileUrl('gcodes', joinPath(dir, relativePath));
  }

  /** Makes an absolute URL out of a Moonraker-relative webcam URL. */
  resolveUrl(maybeRelative: string): string {
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return `${this.endpoint.baseUrl}/${maybeRelative.replace(/^\/+/, '')}`;
  }

  async uploadFile(
    file: File,
    options: { root?: FileRoot; path?: string; startPrint?: boolean } = {},
    onProgress?: (fraction: number) => void,
  ): Promise<{ item: { path: string; root: string }; print_started: boolean }> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('root', options.root ?? 'gcodes');
    if (options.path) form.append('path', options.path);
    if (options.startPrint) form.append('print', 'true');

    // XHR rather than fetch: it reports upload progress, which matters for
    // multi-megabyte gcode files on a phone connection.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.endpoint.baseUrl}/server/files/upload`);
      for (const [k, v] of Object.entries(this.authHeaders())) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText).result);
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Invalid upload response'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed: network error'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(form);
    });
  }
}

export function joinPath(dir: string, name: string): string {
  const parts = `${dir}/${name}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}
