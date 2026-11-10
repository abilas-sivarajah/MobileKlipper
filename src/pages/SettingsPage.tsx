import { useState } from 'react';
import { ChevronRight, Plus, Printer } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@/components/ui';
import { ToggleRow } from '@/components/ToggleRow';
import { AddPrinterScreen } from '@/features/settings/AddPrinterScreen';
import { PrinterEditSheet } from '@/features/settings/PrinterEditSheet';
import { EstimateSettings } from '@/features/settings/EstimateSettings';
import { usePrintersStore, type PrinterConfig } from '@/store/printers';
import { useUiStore, type ThemeMode } from '@/store/ui';
import { usePrinterStore } from '@/store/printer';
import { notificationsSupported } from '@/lib/useNotifications';
import { toast } from '@/store/toast';

const THEMES: ThemeMode[] = ['dark', 'light', 'system'];
const THEME_LABELS: Record<ThemeMode, string> = {
  dark: 'Dunkel',
  light: 'Hell',
  system: 'System',
};

export default function SettingsPage() {
  const printers = usePrintersStore((s) => s.printers);
  const activeId = usePrintersStore((s) => s.activeId);
  const setActive = usePrintersStore((s) => s.setActive);
  const ui = useUiStore();
  const serverInfo = usePrinterStore((s) => s.serverInfo);
  const printerInfo = usePrinterStore((s) => s.printerInfo);
  const [editing, setEditing] = useState<PrinterConfig | null>(null);
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <div>
        <div className="px-3 pt-3">
          <Button size="sm" onClick={() => setAdding(false)}>
            Zurück
          </Button>
        </div>
        <AddPrinterScreen onDone={() => setAdding(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <Card title="Drucker" padded={false}>
        <ul className="divide-y divide-line">
          {printers.map((printer) => (
            <li key={printer.id} className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setActive(printer.id)}
                aria-label={`${printer.name} aktivieren`}
                className="shrink-0"
              >
                <Printer
                  className={`size-5 ${printer.id === activeId ? 'text-accent' : 'text-muted'}`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{printer.name}</p>
                <p className="truncate text-[11px] text-muted">{printer.baseUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(printer)}
                aria-label={`${printer.name} bearbeiten`}
                className="p-1 text-muted"
              >
                <ChevronRight className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="p-3">
          <Button block size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Drucker hinzufügen
          </Button>
        </div>
      </Card>

      <Card title="Darstellung">
        <SegmentedControl
          options={THEMES}
          value={ui.theme}
          onChange={ui.setTheme}
          formatLabel={(mode) => THEME_LABELS[mode]}
        />
      </Card>

      <EstimateSettings />

      <Card title="Verhalten" padded={false}>
        <div className="divide-y divide-line px-4">
          <ToggleRow
            label="Rückfrage bei kritischen Aktionen"
            hint="Notaus, Druckabbruch und Neustarts bestätigen"
            checked={ui.confirmDestructive}
            onChange={() => ui.toggle('confirmDestructive')}
          />
          <ToggleRow
            label="Versteckte Makros zeigen"
            hint="Makros, deren Name mit _ beginnt"
            checked={ui.showHiddenMacros}
            onChange={() => ui.toggle('showHiddenMacros')}
          />
          <ToggleRow
            label="Temperaturmeldungen ausblenden"
            hint="Filtert die periodischen ok B:.. T0:.. Zeilen in der Konsole"
            checked={ui.hideTemperatureReplies}
            onChange={() => ui.toggle('hideTemperatureReplies')}
          />
          <ToggleRow
            label="Benachrichtigungen"
            hint={
              notificationsSupported()
                ? 'Druck fertig, Fehler, Filament leer – solange die App im Hintergrund offen ist'
                : 'Von diesem Browser nicht unterstützt'
            }
            checked={ui.notifications}
            disabled={!notificationsSupported()}
            onChange={async () => {
              if (!ui.notifications && Notification.permission !== 'granted') {
                const result = await Notification.requestPermission();
                if (result !== 'granted') {
                  toast.warning('Benachrichtigungen wurden im Browser abgelehnt');
                  return;
                }
              }
              ui.toggle('notifications');
            }}
          />
          <ToggleRow
            label="Bildschirm anlassen"
            hint="Während eines Drucks das Display nicht sperren"
            checked={ui.keepScreenAwake}
            onChange={() => ui.toggle('keepScreenAwake')}
          />
        </div>
      </Card>

      <Card title="Verbindung">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Moonraker</dt>
            <dd className="truncate">{serverInfo?.moonraker_version ?? '--'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Klipper</dt>
            <dd className="truncate">{printerInfo?.software_version ?? '--'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Host</dt>
            <dd className="truncate">{printerInfo?.hostname ?? '--'}</dd>
          </div>
        </dl>
        {serverInfo?.warnings?.length ? (
          <ul className="mt-2 space-y-1">
            {serverInfo.warnings.map((warning) => (
              <li key={warning} className="text-[11px] text-warn-ink">
                {warning}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <p className="pb-2 text-center text-[11px] text-muted">
        MobileKlipper · Klipper-Steuerung als PWA
      </p>

      <PrinterEditSheet printer={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
