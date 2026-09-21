import { Power, RefreshCw, RotateCw, ServerCog } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';

export function SystemCard() {
  const client = usePrinterStore((s) => s.client);

  const run = async (
    action: () => Promise<unknown> | undefined,
    confirm: { title: string; message: string } | null,
    success: string,
  ) => {
    if (confirm) {
      const ok = await confirmAction({ ...confirm, confirmLabel: 'Ausführen' });
      if (!ok) return;
    }
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Befehl fehlgeschlagen');
    }
  };

  return (
    <Card title="System">
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() =>
            void run(() => client?.firmwareRestart(), null, 'Firmware-Restart gesendet')
          }
        >
          <RefreshCw className="size-4" /> Firmware
        </Button>
        <Button
          onClick={() => void run(() => client?.klipperRestart(), null, 'Klipper startet neu')}
        >
          <RotateCw className="size-4" /> Klipper
        </Button>
        <Button
          onClick={() =>
            void run(
              () => client?.restartService('moonraker'),
              {
                title: 'Moonraker neu starten?',
                message: 'Die Verbindung bricht kurz ab und wird danach automatisch wiederhergestellt.',
              },
              'Moonraker startet neu',
            )
          }
        >
          <ServerCog className="size-4" /> Moonraker
        </Button>
        <Button
          tone="danger"
          onClick={() =>
            void run(
              () => client?.hostReboot(),
              {
                title: 'Host neu starten?',
                message: 'Der Raspberry Pi (oder Host) startet neu. Ein laufender Druck geht verloren.',
              },
              'Host startet neu',
            )
          }
        >
          <RotateCw className="size-4" /> Neustart
        </Button>
        <Button
          tone="danger"
          className="col-span-2"
          onClick={() =>
            void run(
              () => client?.hostShutdown(),
              {
                title: 'Host herunterfahren?',
                message: 'Der Host wird ausgeschaltet und ist danach nur noch physisch erreichbar.',
              },
              'Host fährt herunter',
            )
          }
        >
          <Power className="size-4" /> Herunterfahren
        </Button>
      </div>
    </Card>
  );
}
