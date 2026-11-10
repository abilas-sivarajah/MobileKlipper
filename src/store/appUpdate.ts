/**
 * State of the app's own updates, modelled on GX Tube's Updater: check GitHub
 * on open (at most every 15 minutes), "Später" hides a version for 12 hours,
 * a manual check is always possible.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  APP_VERSION,
  CHECK_INTERVAL_MS,
  fetchLatestRelease,
  isNewerVersion,
  MOONRAKER_UPDATER_NAME,
  SNOOZE_MS,
  type AppRelease,
} from '@/lib/appUpdate';
import { isPrinting } from '@/lib/derive';
import { reloadToLatest } from '@/lib/sw';
import { usePrinterStore } from './printer';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'installing'
  | 'reloading'
  | 'failed';

interface AppUpdateState {
  phase: UpdatePhase;
  release: AppRelease | null;
  error: string | null;
  /** Show the "Update verfügbar" dialog (false after "Später" or a background check that was snoozed). */
  dialogOpen: boolean;
  /**
   * Whether the connected printer's Moonraker manages this app
   * ([update_manager mobileklipper]); null until asked.
   */
  moonrakerManaged: boolean | null;
  /** A new service worker is waiting: the files on the server already changed. */
  swUpdateReady: boolean;

  // Persisted
  autoCheck: boolean;
  lastCheck: number;
  snoozedVersion: string | null;
  snoozedAt: number;

  checkOnOpen: (now?: number) => Promise<void>;
  checkNow: () => Promise<void>;
  detectMoonrakerUpdater: () => Promise<boolean | null>;
  install: () => Promise<void>;
  snooze: (now?: number) => void;
  dismiss: () => void;
  openDialog: () => void;
  toggleAutoCheck: () => void;
  setSwUpdateReady: (ready: boolean) => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useAppUpdateStore = create<AppUpdateState>()(
  persist(
    (set, get) => ({
      phase: 'idle',
      release: null,
      error: null,
      dialogOpen: false,
      moonrakerManaged: null,
      swUpdateReady: false,
      autoCheck: true,
      lastCheck: 0,
      snoozedVersion: null,
      snoozedAt: 0,

      checkOnOpen: async (now = Date.now()) => {
        const state = get();
        if (!state.autoCheck) return;
        if (now - state.lastCheck < CHECK_INTERVAL_MS) return;
        if (state.phase !== 'idle' && state.phase !== 'up-to-date' && state.phase !== 'failed') return;
        set({ lastCheck: now });
        try {
          const release = await fetchLatestRelease();
          if (!isNewerVersion(release.version, APP_VERSION)) {
            set({ phase: 'up-to-date', release, error: null });
            return;
          }
          const { snoozedVersion, snoozedAt } = get();
          const snoozed = snoozedVersion === release.version && now - snoozedAt < SNOOZE_MS;
          set({ phase: 'available', release, error: null, dialogOpen: !snoozed });
          void get().detectMoonrakerUpdater();
        } catch {
          // A background check stays silent; the manual one reports errors.
        }
      },

      checkNow: async () => {
        set({ phase: 'checking', error: null, lastCheck: Date.now() });
        try {
          const release = await fetchLatestRelease();
          if (isNewerVersion(release.version, APP_VERSION)) {
            set({ phase: 'available', release, dialogOpen: true });
            void get().detectMoonrakerUpdater();
          } else {
            set({ phase: 'up-to-date', release });
          }
        } catch (err) {
          set({ phase: 'failed', error: `Update-Prüfung fehlgeschlagen: ${message(err)}` });
        }
      },

      detectMoonrakerUpdater: async () => {
        const { client, connection, serverInfo } = usePrinterStore.getState();
        if (!client || connection !== 'open') return get().moonrakerManaged;
        if (serverInfo && !serverInfo.components.includes('update_manager')) {
          set({ moonrakerManaged: false });
          return false;
        }
        try {
          const status = await client.updateStatus(false);
          const managed = MOONRAKER_UPDATER_NAME in (status.version_info ?? {});
          set({ moonrakerManaged: managed });
          return managed;
        } catch {
          return get().moonrakerManaged;
        }
      },

      install: async () => {
        const { client, status } = usePrinterStore.getState();
        if (get().swUpdateReady) {
          // The server already has the new files; switching over is enough.
          set({ phase: 'reloading' });
          await reloadToLatest();
          return;
        }
        if (!client) {
          set({ phase: 'failed', error: 'Keine Verbindung zum Drucker – Moonraker installiert das Update.' });
          return;
        }
        if (isPrinting(status)) {
          set({ phase: 'failed', error: 'Während eines Drucks sperrt Moonraker Updates – danach erneut versuchen.' });
          return;
        }
        set({ phase: 'installing', error: null, dialogOpen: true });
        try {
          const managed = await get().detectMoonrakerUpdater();
          if (!managed) {
            set({ phase: 'available', moonrakerManaged: false });
            return;
          }
          // Moonraker caches what GitHub said; without a refresh it may think
          // it is already up to date.
          await client.refreshUpdate(MOONRAKER_UPDATER_NAME);
          await client.upgrade(MOONRAKER_UPDATER_NAME);
          set({ phase: 'reloading' });
          await reloadToLatest();
        } catch (err) {
          set({ phase: 'failed', error: `Update fehlgeschlagen: ${message(err)}` });
        }
      },

      snooze: (now = Date.now()) => {
        const release = get().release;
        set({
          dialogOpen: false,
          ...(release ? { snoozedVersion: release.version, snoozedAt: now } : {}),
        });
      },

      dismiss: () =>
        set((s) => ({
          dialogOpen: false,
          // Keep knowing about a pending update after closing an error.
          phase: s.phase === 'failed' && s.release && isNewerVersion(s.release.version, APP_VERSION) ? 'available' : s.phase,
          error: null,
        })),

      openDialog: () => {
        set({ dialogOpen: true });
        void get().detectMoonrakerUpdater();
      },

      toggleAutoCheck: () => set((s) => ({ autoCheck: !s.autoCheck })),

      setSwUpdateReady: (ready) => set({ swUpdateReady: ready }),
    }),
    {
      name: 'mobileklipper.appUpdate',
      version: 1,
      partialize: (s) => ({
        autoCheck: s.autoCheck,
        lastCheck: s.lastCheck,
        snoozedVersion: s.snoozedVersion,
        snoozedAt: s.snoozedAt,
      }),
    },
  ),
);
