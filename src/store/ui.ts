/** App-wide UI preferences, persisted locally. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_ETA_SOURCES,
  DEFAULT_REMAINING_SOURCES,
  type EstimateSource,
  type ProgressSource,
} from '@/lib/derive';

export type ThemeMode = 'dark' | 'light' | 'system';

interface UiState {
  theme: ThemeMode;
  /** Ask before emergency stop / cancelling a print. */
  confirmDestructive: boolean;
  /** Show macros whose name starts with "_". */
  showHiddenMacros: boolean;
  /** Hide periodic "B:60.0 /60.0" temperature reports in the console. */
  hideTemperatureReplies: boolean;
  /** Minutes of temperature history shown in the chart. */
  chartMinutes: number;
  keepScreenAwake: boolean;
  /** System notifications for print end, errors and pauses while the app runs. */
  notifications: boolean;
  /** How print progress is measured; Mainsail's "calcPrintProgress". */
  progressSource: ProgressSource;
  /** Sources averaged into the headline remaining time. */
  remainingSources: EstimateSource[];
  /** Sources averaged into the finish time. */
  etaSources: EstimateSource[];
  setTheme: (theme: ThemeMode) => void;
  setProgressSource: (source: ProgressSource) => void;
  toggleEstimateSource: (field: 'remainingSources' | 'etaSources', source: EstimateSource) => void;
  toggle: (
    key:
      | 'confirmDestructive'
      | 'showHiddenMacros'
      | 'hideTemperatureReplies'
      | 'keepScreenAwake'
      | 'notifications',
  ) => void;
  setChartMinutes: (minutes: number) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      confirmDestructive: true,
      showHiddenMacros: false,
      hideTemperatureReplies: true,
      chartMinutes: 10,
      keepScreenAwake: false,
      notifications: false,
      progressSource: 'file-relative',
      remainingSources: DEFAULT_REMAINING_SOURCES,
      etaSources: DEFAULT_ETA_SOURCES,
      setTheme: (theme) => set({ theme }),
      setProgressSource: (progressSource) => set({ progressSource }),
      toggleEstimateSource: (field, source) =>
        set((s) => {
          const current = s[field];
          const next = current.includes(source)
            ? current.filter((entry) => entry !== source)
            : [...current, source];
          // Dropping the last source would leave no estimate at all.
          return next.length ? ({ [field]: next } as Partial<UiState>) : {};
        }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UiState>),
      setChartMinutes: (chartMinutes) => set({ chartMinutes }),
    }),
    {
      name: 'mobileklipper.ui',
      version: 2,
      // Without a migrate function zustand discards everything persisted under
      // an older version; the settings carry over unchanged and merge below
      // backfills whatever the new version added.
      migrate: (persisted) => persisted as UiState,
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...state,
          // Settings added in v2 are absent from older persisted state.
          progressSource: state.progressSource ?? current.progressSource,
          remainingSources: state.remainingSources?.length
            ? state.remainingSources
            : current.remainingSources,
          etaSources: state.etaSources?.length ? state.etaSources : current.etaSources,
          notifications: state.notifications ?? current.notifications,
        };
      },
    },
  ),
);
