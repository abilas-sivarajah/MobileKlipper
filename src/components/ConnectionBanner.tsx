import { PlugZap, RefreshCw, TriangleAlert } from 'lucide-react';
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
