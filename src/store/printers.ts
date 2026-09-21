/** Persisted printer configuration and per-printer UI preferences. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeBaseUrl } from '@/moonraker/client';

export interface TempPreset {
  id: string;
  name: string;
  extruder: number;
  bed: number;
  chamber?: number;
}

export interface PrinterConfig {
  id: string;
  name: string;
  /** Normalized HTTP base URL, e.g. http://printer.local:7125 */
  baseUrl: string;
  apiKey?: string;
  token?: string;
  /** Overrides the webcam Moonraker reports, for reverse-proxy setups. */
  webcamUrlOverride?: string;
  moveSteps: number[];
  babyStepSizes: number[];
  extrudeLengths: number[];
  extrudeFeedrate: number;
  feedrateXY: number;
  feedrateZ: number;
  invertJogX: boolean;
  invertJogY: boolean;
  tempPresets: TempPreset[];
  /** Macros pinned to the dashboard, by macro name. */
  favoriteMacros: string[];
}

export const DEFAULT_PRINTER: Omit<PrinterConfig, 'id' | 'name' | 'baseUrl'> = {
  moveSteps: [0.1, 1, 10, 50],
  babyStepSizes: [0.005, 0.01, 0.05, 0.1],
  extrudeLengths: [5, 10, 25, 50],
  extrudeFeedrate: 5,
  feedrateXY: 100,
  feedrateZ: 25,
  invertJogX: false,
  invertJogY: false,
  tempPresets: [
    { id: 'pla', name: 'PLA', extruder: 210, bed: 60 },
    { id: 'petg', name: 'PETG', extruder: 240, bed: 80 },
    { id: 'abs', name: 'ABS', extruder: 255, bed: 100 },
    { id: 'tpu', name: 'TPU', extruder: 225, bed: 50 },
  ],
  favoriteMacros: [],
};

export interface PrintersState {
  printers: PrinterConfig[];
  activeId: string | null;
  addPrinter: (input: { name: string; baseUrl: string; apiKey?: string }) => PrinterConfig;
  updatePrinter: (id: string, patch: Partial<PrinterConfig>) => void;
  removePrinter: (id: string) => void;
  setActive: (id: string) => void;
  toggleFavoriteMacro: (id: string, macro: string) => void;
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p${Date.now().toString(36)}`;
}

export const usePrintersStore = create<PrintersState>()(
  persist(
    (set, get) => ({
      printers: [],
      activeId: null,

      addPrinter: ({ name, baseUrl, apiKey }) => {
        const printer: PrinterConfig = {
          ...DEFAULT_PRINTER,
          id: makeId(),
          name: name.trim() || 'Drucker',
          baseUrl: normalizeBaseUrl(baseUrl),
          ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
          tempPresets: DEFAULT_PRINTER.tempPresets.map((p) => ({ ...p })),
        };
        set((state) => ({
          printers: [...state.printers, printer],
          activeId: state.activeId ?? printer.id,
        }));
        return printer;
      },

      updatePrinter: (id, patch) =>
        set((state) => ({
          printers: state.printers.map((p) =>
            p.id === id
              ? { ...p, ...patch, baseUrl: patch.baseUrl ? normalizeBaseUrl(patch.baseUrl) : p.baseUrl }
              : p,
          ),
        })),

      removePrinter: (id) =>
        set((state) => {
          const printers = state.printers.filter((p) => p.id !== id);
          const activeId =
            state.activeId === id ? (printers[0]?.id ?? null) : state.activeId;
          return { printers, activeId };
        }),

      setActive: (id) => {
        if (get().printers.some((p) => p.id === id)) set({ activeId: id });
      },

      toggleFavoriteMacro: (id, macro) =>
        set((state) => ({
          printers: state.printers.map((p) => {
            if (p.id !== id) return p;
            const has = p.favoriteMacros.includes(macro);
            return {
              ...p,
              favoriteMacros: has
                ? p.favoriteMacros.filter((m) => m !== macro)
                : [...p.favoriteMacros, macro],
            };
          }),
        })),
    }),
    {
      name: 'mobileklipper.printers',
      version: 1,
      // Older configs may lack fields added later; backfill from defaults.
      merge: (persisted, current) => {
        const state = persisted as Partial<PrintersState> | undefined;
        if (!state?.printers) return current;
        return {
          ...current,
          ...state,
          printers: state.printers.map((p) => ({ ...DEFAULT_PRINTER, ...p })),
        };
      },
    },
  ),
);

export function useActivePrinter(): PrinterConfig | null {
  return usePrintersStore((s) => s.printers.find((p) => p.id === s.activeId) ?? null);
}
