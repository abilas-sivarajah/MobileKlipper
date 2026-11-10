import { Plug, PlugZap } from 'lucide-react';
import { Card, Switch } from '@/components/ui';
import { isPrinting } from '@/lib/derive';
import { prettyObjectName } from '@/lib/format';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';
import type { PowerDevice } from '@/moonraker/types';

/** Toggles a Moonraker [power] device, refusing to cut power mid-print without asking. */
export async function togglePower(device: PowerDevice): Promise<void> {
  const { status, setPower } = usePrinterStore.getState();
  const turnOff = device.status === 'on';
  if (turnOff) {
    const printing = isPrinting(status);
    const ok = await confirmAction({
      title: `${prettyObjectName(device.device)} ausschalten?`,
      message: printing
        ? 'Es läuft ein Druck – ausschalten bricht ihn ab.'
        : 'Der Drucker verliert den Strom. Heizungen und Motoren gehen aus.',
      confirmLabel: 'Ausschalten',
    });
    if (!ok) return;
  }
  await setPower(device.device, turnOff ? 'off' : 'on');
}

export function PowerCard({ compact = false }: { compact?: boolean }) {
  const devices = usePrinterStore((s) => s.powerDevices);
  if (!devices.length) return null;

  return (
    <Card title={compact ? undefined : 'Stromversorgung'}>
      <ul className="divide-y divide-line">
        {devices.map((device) => {
          const on = device.status === 'on';
          return (
            <li key={device.device} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              {on ? (
                <PlugZap className="size-4 shrink-0 text-ok-ink" />
              ) : (
                <Plug className="size-4 shrink-0 text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{prettyObjectName(device.device)}</p>
                <p className="text-[11px] text-muted">
                  {device.status === 'error'
                    ? 'Fehler beim Abfragen'
                    : device.status === 'init'
                      ? 'wird initialisiert'
                      : on
                        ? 'an'
                        : 'aus'}
                  {device.type ? ` · ${device.type}` : ''}
                  {device.locked_while_printing ? ' · gesperrt beim Drucken' : ''}
                </p>
              </div>
              <Switch
                checked={on}
                label={`${device.device} schalten`}
                disabled={device.status === 'error' || device.status === 'init'}
                onChange={() => void togglePower(device)}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
