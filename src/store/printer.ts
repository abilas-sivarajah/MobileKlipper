/**
 * Live printer runtime: owns the MoonrakerClient for the active printer and
 * mirrors everything the UI needs (status, console, temperature history,
 * webcams, metadata of the running job).
 */
import { create } from 'zustand';
import { MoonrakerClient, mergeStatus } from '@/moonraker/client';
import type { SocketState } from '@/moonraker/rpc';
import type {
  GcodeMetadata,
  GcodeStoreEntry,
  KlippyState,
  PowerDevice,
  PrinterInfo,
  PrinterStatus,
  ProcStats,
  ServerInfo,
  WebcamConfig,
} from '@/moonraker/types';
import { appendSample, emptyHistory, seedHistory, type TempHistory } from '@/lib/tempHistory';
import type { PrinterConfig } from './printers';
import { toast } from './toast';

export type ConsoleLineKind = 'command' | 'response' | 'error' | 'info';

export interface ConsoleLine {
  id: number;
  kind: ConsoleLineKind;
  message: string;
  time: number;
}

const CONSOLE_LIMIT = 400;
let consoleId = 1;

function classify(message: string): ConsoleLineKind {
  if (message.startsWith('!!')) return 'error';
  if (message.startsWith('//') || message.startsWith('echo:')) return 'info';
  return 'response';
}

function makeLine(message: string, kind?: ConsoleLineKind, time?: number): ConsoleLine {
  return {
    id: consoleId++,
    kind: kind ?? classify(message),
    message,
    time: time ?? Date.now() / 1000,
  };
}

interface PrinterRuntimeState {
  printerId: string | null;
  client: MoonrakerClient | null;
  connection: SocketState;
  connectionDetail: string | null;
  klippy: KlippyState;
  klippyMessage: string | null;
  status: PrinterStatus;
  availableObjects: string[];
  serverInfo: ServerInfo | null;
  printerInfo: PrinterInfo | null;
  tempHistory: TempHistory;
  console: ConsoleLine[];
  webcams: WebcamConfig[];
  metadata: GcodeMetadata | null;
  metadataFor: string | null;
  lastError: string | null;
  /** Host load, temperature and throttling; pushed by Moonraker every second. */
  procStats: ProcStats | null;
  /** Moonraker [power] devices, e.g. the smart plug the printer hangs on. */
  powerDevices: PowerDevice[];
  /** Bumped by notify_filelist_changed / notify_history_changed so views reload. */
  fileListVersion: number;
  historyVersion: number;

  connect: (printer: PrinterConfig) => void;
  disconnect: () => void;
  reconnect: () => void;
  sendGcode: (script: string, echo?: boolean) => Promise<boolean>;
  appendConsole: (message: string, kind?: ConsoleLineKind) => void;
  clearConsole: () => void;
  loadMetadata: (filename: string | null | undefined) => Promise<void>;
  refreshWebcams: () => Promise<void>;
  refreshPower: () => Promise<void>;
  setPower: (device: string, action: 'on' | 'off') => Promise<boolean>;
}

const initial = {
  printerId: null,
  client: null,
  connection: 'idle' as SocketState,
  connectionDetail: null,
  klippy: 'disconnected' as KlippyState,
  klippyMessage: null,
  status: {} as PrinterStatus,
  availableObjects: [],
  serverInfo: null,
  printerInfo: null,
  tempHistory: emptyHistory(),
  console: [],
  webcams: [],
  metadata: null,
  metadataFor: null,
  lastError: null,
  procStats: null,
  powerDevices: [],
  fileListVersion: 0,
  historyVersion: 0,
};

export const usePrinterStore = create<PrinterRuntimeState>((set, get) => ({
  ...initial,

  connect: (printer) => {
    const previous = get().client;
    previous?.disconnect('switching printer');

    let client: MoonrakerClient;
    const isCurrent = () => get().client === client;

    client = new MoonrakerClient(
      {
        baseUrl: printer.baseUrl,
        ...(printer.apiKey ? { apiKey: printer.apiKey } : {}),
        ...(printer.token ? { token: printer.token } : {}),
      },
      {
        onConnectionState: (connection, detail) => {
          if (isCurrent()) set({ connection, connectionDetail: detail ?? null });
        },

        onKlippyState: (klippy, message) => {
          if (!isCurrent()) return;
          set({ klippy, klippyMessage: message ?? null });
          if (klippy === 'shutdown' || klippy === 'error') {
            const msg = get().status.webhooks?.state_message;
            set((s) => ({
              console: [...s.console, makeLine(msg ?? `Klipper: ${klippy}`, 'error')].slice(
                -CONSOLE_LIMIT,
              ),
            }));
          }
        },

        onStatusUpdate: (patch) => {
          if (!isCurrent()) return;
          const state = get();
          const status = mergeStatus(state.status, patch);
          set({
            status,
            tempHistory: appendSample(state.tempHistory, status),
          });
          const filename = status.print_stats?.filename;
          if (filename && filename !== state.metadataFor) {
            void get().loadMetadata(filename);
          } else if (!filename && state.metadataFor) {
            set({ metadata: null, metadataFor: null });
          }
        },

        onGcodeResponse: (line) => {
          if (isCurrent()) {
            set((s) => ({ console: [...s.console, makeLine(line)].slice(-CONSOLE_LIMIT) }));
          }
        },

        onServerInfo: (info) => {
          if (!isCurrent()) return;
          set({ serverInfo: info });
          // Power devices matter most while Klipper is down because the
          // printer itself is switched off.
          void get().refreshPower();
          void client
            .procStats()
            .then((procStats) => isCurrent() && set({ procStats }))
            .catch(() => undefined);
        },

        onReady: (status, objects) => {
          if (!isCurrent()) return;
          set({ availableObjects: objects, lastError: null });
          void hydrate(client, set, get);
          const filename = status.print_stats?.filename;
          if (filename) void get().loadMetadata(filename);
        },

        onFileListChanged: () => {
          if (isCurrent()) set((s) => ({ fileListVersion: s.fileListVersion + 1 }));
        },

        onHistoryChanged: () => {
          if (isCurrent()) set((s) => ({ historyVersion: s.historyVersion + 1 }));
        },

        onError: (err) => {
          if (isCurrent()) set({ lastError: err.message });
        },

        onProcStats: (stats) => {
          if (!isCurrent()) return;
          // The push carries one moonraker_stats sample, the query an array.
          set((s) => ({ procStats: { ...(s.procStats ?? {}), ...stats } }));
        },

        onPowerChanged: (device) => {
          if (!isCurrent()) return;
          set((s) => ({
            powerDevices: s.powerDevices.some((d) => d.device === device.device)
              ? s.powerDevices.map((d) => (d.device === device.device ? { ...d, ...device } : d))
              : [...s.powerDevices, device],
          }));
        },
      },
    );

    set({
      ...initial,
      tempHistory: emptyHistory(),
      printerId: printer.id,
      client,
      connection: 'connecting',
    });

    void client.connect().catch((err: unknown) => {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : String(err);
      set({ lastError: message, connection: 'closed', connectionDetail: message });
    });
  },

  disconnect: () => {
    get().client?.disconnect();
    set({ ...initial, tempHistory: emptyHistory() });
  },

  reconnect: () => {
    const { client } = get();
    if (!client) return;
    void client.connect();
  },

  sendGcode: async (script, echo = true) => {
    const { client } = get();
    if (!client) {
      toast.error('Keine Verbindung zum Drucker');
      return false;
    }
    if (echo) {
      set((s) => ({ console: [...s.console, makeLine(script, 'command')].slice(-CONSOLE_LIMIT) }));
    }
    try {
      await client.gcode(script);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({
        console: [...s.console, makeLine(`!! ${message}`, 'error')].slice(-CONSOLE_LIMIT),
      }));
      toast.error(message);
      return false;
    }
  },

  appendConsole: (message, kind) =>
    set((s) => ({ console: [...s.console, makeLine(message, kind)].slice(-CONSOLE_LIMIT) })),

  clearConsole: () => set({ console: [] }),

  loadMetadata: async (filename) => {
    const { client } = get();
    if (!client || !filename) {
      set({ metadata: null, metadataFor: null });
      return;
    }
    set({ metadataFor: filename });
    try {
      const metadata = await client.metadata(filename);
      // Guard against a print that changed while the request was in flight.
      if (get().metadataFor === filename) set({ metadata });
    } catch {
      if (get().metadataFor === filename) set({ metadata: null });
    }
  },

  refreshPower: async () => {
    const { client, serverInfo } = get();
    if (!client || !serverInfo?.components.includes('power')) return;
    try {
      const { devices } = await client.powerDevices();
      set({ powerDevices: devices ?? [] });
    } catch {
      set({ powerDevices: [] });
    }
  },

  setPower: async (device, action) => {
    const { client } = get();
    if (!client) return false;
    try {
      const result = await client.setPowerDevice(device, action);
      const status = result[device];
      if (status === 'on' || status === 'off') {
        set((s) => ({
          powerDevices: s.powerDevices.map((d) => (d.device === device ? { ...d, status } : d)),
        }));
      }
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Schalten fehlgeschlagen');
      return false;
    }
  },

  refreshWebcams: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { webcams } = await client.listWebcams();
      set({ webcams: webcams.filter((w) => w.enabled !== false) });
    } catch {
      set({ webcams: [] });
    }
  },
}));

/** Pulls the one-off data that is not delivered through subscriptions. */
async function hydrate(
  client: MoonrakerClient,
  set: (partial: Partial<PrinterRuntimeState>) => void,
  get: () => PrinterRuntimeState,
): Promise<void> {
  const [info, printerInfo, temps, gcodeStore] = await Promise.allSettled([
    client.serverInfo(),
    client.printerInfo(),
    client.temperatureStore(true),
    client.gcodeStore(150),
  ]);

  if (get().client !== client) return; // printer switched mid-flight

  if (info.status === 'fulfilled') set({ serverInfo: info.value });
  if (printerInfo.status === 'fulfilled') set({ printerInfo: printerInfo.value });
  if (temps.status === 'fulfilled') set({ tempHistory: seedHistory(temps.value) });
  if (gcodeStore.status === 'fulfilled') {
    const entries: GcodeStoreEntry[] = gcodeStore.value.gcode_store ?? [];
    set({
      console: entries
        .slice(-CONSOLE_LIMIT)
        .map((e) => makeLine(e.message, e.type === 'command' ? 'command' : undefined, e.time)),
    });
  }
  await Promise.all([get().refreshWebcams(), get().refreshPower()]);
}
