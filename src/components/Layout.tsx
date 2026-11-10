import { NavLink, useLocation } from 'react-router-dom';
import {
  Camera,
  ChevronDown,
  Ellipsis,
  Files,
  Gauge,
  Gamepad2,
  Octagon,
  Save,
  Settings,
  Terminal,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { KlippyState } from '@/moonraker/types';
import { usePrinterStore } from '@/store/printer';
import { usePrintersStore } from '@/store/printers';
import { useUiStore } from '@/store/ui';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';
import { Badge, Button } from './ui';
import { ConnectionBanner } from './ConnectionBanner';
import { ManualProbePanel } from './ManualProbePanel';
import { useSaveConfig } from '@/features/calibrate/useSaveConfig';
import { useAppUpdateStore } from '@/store/appUpdate';
import { reloadToLatest } from '@/lib/sw';

const NAV = [
  { to: '/', label: 'Status', icon: Gauge },
  { to: '/control', label: 'Steuern', icon: Gamepad2 },
  { to: '/files', label: 'Dateien', icon: Files },
  { to: '/cam', label: 'Kamera', icon: Camera },
  { to: '/console', label: 'Konsole', icon: Terminal },
  { to: '/more', label: 'Mehr', icon: Ellipsis },
];

const KLIPPY_LABELS: Record<KlippyState, string> = {
  ready: 'bereit',
  startup: 'startet',
  shutdown: 'gestoppt',
  error: 'Fehler',
  disconnected: 'getrennt',
};

/** Pages reached through "Mehr" keep that tab highlighted. */
const MORE_ROUTES = ['/more', '/calibrate', '/config', '/system', '/history', '/settings'];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const printers = usePrintersStore((s) => s.printers);
  const activeId = usePrintersStore((s) => s.activeId);
  const setActive = usePrintersStore((s) => s.setActive);
  const connection = usePrinterStore((s) => s.connection);
  const klippy = usePrinterStore((s) => s.klippy);
  const client = usePrinterStore((s) => s.client);
  const confirmDestructive = useUiStore((s) => s.confirmDestructive);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const savePending = usePrinterStore((s) => s.status.configfile?.save_config_pending === true);
  const saveConfig = useSaveConfig();
  const swUpdateReady = useAppUpdateStore((s) => s.swUpdateReady);

  const active = printers.find((p) => p.id === activeId);
  const online = connection === 'open';
  const tone = online ? (klippy === 'ready' ? 'ok' : 'warn') : 'danger';
  const stateLabel = !online
    ? connection === 'connecting' || connection === 'reconnecting'
      ? 'verbinde'
      : 'offline'
    : KLIPPY_LABELS[klippy];

  const onEmergencyStop = async () => {
    if (confirmDestructive) {
      const ok = await confirmAction({
        title: 'Notaus auslösen?',
        message:
          'Klipper wird sofort gestoppt. Heizungen und Motoren gehen aus, ein laufender Druck ist verloren. Danach ist ein Firmware-Restart nötig.',
        confirmLabel: 'Notaus',
      });
      if (!ok) return;
    }
    try {
      await client?.emergencyStop();
      toast.warning('Notaus gesendet – Firmware-Restart erforderlich');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Notaus fehlgeschlagen');
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="flex max-w-full items-center gap-1.5"
              onClick={() => printers.length > 1 && setSwitcherOpen((v) => !v)}
            >
              <span className="truncate text-base font-semibold">
                {active?.name ?? 'MobileKlipper'}
              </span>
              {printers.length > 1 && <ChevronDown className="size-4 shrink-0 text-muted" />}
            </button>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge tone={tone}>
                <span
                  className={`size-1.5 rounded-full ${
                    tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-danger'
                  }`}
                />
                {stateLabel}
              </Badge>
            </div>
          </div>

          {savePending && (
            <Button
              tone="accent"
              size="sm"
              onClick={() => void saveConfig()}
              title="Ungespeicherte Konfiguration – SAVE_CONFIG"
            >
              <Save className="size-4" />
              <span className="hidden min-[380px]:inline">Speichern</span>
            </Button>
          )}

          <Button
            tone="danger"
            size="sm"
            onClick={() => void onEmergencyStop()}
            aria-label="Notaus"
            title="Notaus"
          >
            <Octagon className="size-4" />
            <span className="hidden sm:inline">Notaus</span>
          </Button>

          <NavLink
            to="/settings"
            aria-label="Einstellungen"
            className={({ isActive }) =>
              `rounded-xl border border-transparent p-2 ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <Settings className="size-5" />
          </NavLink>
        </div>

        {switcherOpen && printers.length > 1 && (
          <ul className="border-t border-line bg-elevated">
            {printers.map((printer) => (
              <li key={printer.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(printer.id);
                    setSwitcherOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-sm ${
                    printer.id === activeId ? 'text-accent' : 'text-ink'
                  }`}
                >
                  <span className="truncate">{printer.name}</span>
                  <span className="ml-3 shrink-0 truncate text-xs text-muted">
                    {printer.baseUrl.replace(/^https?:\/\//, '')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <ConnectionBanner />

        {swUpdateReady && (
          <div className="flex items-center gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2 text-sm">
            <span className="flex-1 text-ink">Neue App-Version geladen</span>
            <Button size="sm" tone="accent" onClick={() => void reloadToLatest()}>
              Neu laden
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <ManualProbePanel />

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="flex">
          {NAV.map(({ to, label, icon: Icon }) => {
            const isActive =
              to === '/'
                ? location.pathname === '/'
                : to === '/more'
                  ? MORE_ROUTES.some((r) => location.pathname.startsWith(r))
                  : location.pathname.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] ${
                    isActive ? 'text-accent' : 'text-muted'
                  }`}
                >
                  <Icon className="size-5" />
                  {label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
