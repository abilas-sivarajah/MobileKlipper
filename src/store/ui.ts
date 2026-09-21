/** App-wide UI preferences, persisted locally. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setTheme: (theme: ThemeMode) => void;
  toggle: (key: 'confirmDestructive' | 'showHiddenMacros' | 'hideTemperatureReplies' | 'keepScreenAwake') => void;
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
      setTheme: (theme) => set({ theme }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UiState>),
      setChartMinutes: (chartMinutes) => set({ chartMinutes }),
    }),
    { name: 'mobileklipper.ui', version: 1 },
  ),
);
