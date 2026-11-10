/** Persisted printer configuration and per-printer UI preferences. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeBaseUrl } from '@/moonraker/client';
import {
  profileDefaults,
  type FilamentSettings,
  type PrinterModel,
  type TempPreset,
} from '@/lib/profiles';

export type { FilamentSettings, PrinterModel, TempPreset };

export interface PrinterConfig {
  id: string;
  name: string;
  /** Normalized HTTP base URL, e.g. http://printer.local:7125 */
  baseUrl: string;
  apiKey?: string;
  token?: string;
  /** Overrides the webcam Moonraker reports, for reverse-proxy setups. */
  webcamUrlOverride?: string;
  /** Which profile seeded the defaults; also selects model-specific tips. */
  model: PrinterModel;
  moveSteps: number[];
  babyStepSizes: number[];
  extrudeLengths: number[];
  extrudeFeedrate: number;
  feedrateXY: number;
  feedrateZ: number;
  invertJogX: boolean;
  invertJogY: boolean;
  tempPresets: TempPreset[];
  filament: FilamentSettings;
  /** Macros pinned to the dashboard, by macro name. */
  favoriteMacros: string[];
}

export const DEFAULT_PRINTER: Omit<PrinterConfig, 'id' | 'name' | 'baseUrl'> = {
  model: 'generic',
  invertJogX: false,
  invertJogY: false,
  favoriteMacros: [],
  ...profileDefaults('generic'),
};

export interface PrintersState {
  printers: PrinterConfig[];
  activeId: string | null;
  addPrinter: (input: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    model?: PrinterModel;
  }) => PrinterConfig;
  updatePrinter: (id: string, patch: Partial<PrinterConfig>) => void;
  /** Resets steps, speeds, presets and filament path to a model's defaults. */
  applyProfile: (id: string, model: PrinterModel) => void;
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

      addPrinter: ({ name, baseUrl, apiKey, model = 'generic' }) => {
        const printer: PrinterConfig = {
          ...DEFAULT_PRINTER,
          ...profileDefaults(model),
          model,
          id: makeId(),
          name: name.trim() || 'Drucker',
          baseUrl: normalizeBaseUrl(baseUrl),
          ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
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

      applyProfile: (id, model) =>
        set((state) => ({
          printers: state.printers.map((p) =>
            p.id === id ? { ...p, ...profileDefaults(model), model } : p,
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
          printers: state.printers.map((p) => ({
            ...DEFAULT_PRINTER,
            ...p,
            // Nested settings added later need their own backfill.
            filament: { ...DEFAULT_PRINTER.filament, ...(p.filament ?? {}) },
          })),
        };
      },
    },
  ),
);

export function useActivePrinter(): PrinterConfig | null {
  return usePrintersStore((s) => s.printers.find((p) => p.id === s.activeId) ?? null);
}
