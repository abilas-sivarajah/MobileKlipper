import { Power, PlugZap, RefreshCw, TriangleAlert } from 'lucide-react';
import { togglePower } from '@/features/system/PowerCard';
import { prettyObjectName } from '@/lib/format';
import { usePrinterStore } from '@/store/printer';
import { Button } from './ui';

/**
 * Surfaces anything that blocks printer commands: a dead websocket, or a
 * Klipper host that is up but not ready (shutdown after an error, startup, ...).
 */
export function ConnectionBanner() {
  const connection = usePrinterStore((s) => s.connection);
  const detail = usePrinterStore((s) => s.connectionDetail);
  const klippy = usePrinterStore((s) => s.klippy);
  const stateMessage = usePrinterStore((s) => s.status.webhooks?.state_message);
  const reconnect = usePrinterStore((s) => s.reconnect);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const powerDevices = usePrinterStore((s) => s.powerDevices);

  if (connection !== 'open') {
    const label =
      connection === 'connecting'
        ? 'Verbinde mit Moonraker …'
        : connection === 'reconnecting'
          ? 'Verbindung verloren – versuche erneut …'
          : 'Nicht verbunden';
    return (
      <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn-ink">
        <PlugZap className="size-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{label}</p>
          {detail && <p className="text-xs text-warn-ink/80">{detail}</p>}
        </div>
        <Button size="sm" onClick={reconnect}>
          <RefreshCw className="size-3.5" /> Neu
        </Button>
      </div>
    );
  }

  if (klippy === 'ready') return null;

  const isShutdown = klippy === 'shutdown' || klippy === 'error';
  // A printer on a switched-off smart plug looks exactly like a dead MCU.
  const switchedOff = powerDevices.filter((d) => d.status === 'off');
  return (
    <div className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger-ink">
      <div className="flex items-center gap-3">
        <TriangleAlert className="size-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">
            {klippy === 'startup'
              ? 'Klipper startet …'
              : klippy === 'disconnected'
                ? 'Klipper ist nicht verbunden'
                : 'Klipper wurde gestoppt'}
          </p>
          {stateMessage && (
            <p className="mt-0.5 line-clamp-3 font-mono text-[11px] leading-snug text-danger-ink/80">
              {stateMessage}
            </p>
          )}
        </div>
      </div>
      {switchedOff.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {switchedOff.map((device) => (
            <Button key={device.device} size="sm" tone="ok" onClick={() => void togglePower(device)}>
              <Power className="size-3.5" /> {prettyObjectName(device.device)} einschalten
            </Button>
          ))}
          <span className="text-[11px] text-danger-ink/80">danach ggf. Firmware-Restart</span>
        </div>
      )}
      {isShutdown && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" tone="accent" onClick={() => void sendGcode('FIRMWARE_RESTART')}>
            Firmware-Restart
          </Button>
          <Button size="sm" onClick={() => void sendGcode('RESTART')}>
            Klipper-Restart
          </Button>
        </div>
      )}
    </div>
  );
}
