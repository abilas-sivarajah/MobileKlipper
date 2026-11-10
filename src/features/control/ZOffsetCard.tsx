import { Minus, Plus, RotateCcw, Save } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { adjustZOffset, persistZOffset, resetZOffset } from '@/lib/gcode';
import { isPrinting } from '@/lib/derive';
import { zOffsetApplyCommand } from '@/lib/caps';
import { useCapabilities } from '@/lib/useCapabilities';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';
import { useState } from 'react';

export function ZOffsetCard() {
  const printer = useActivePrinter();
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);
  const caps = useCapabilities();
  const sizes = printer?.babyStepSizes ?? [0.005, 0.01, 0.05, 0.1];
  const [size, setSize] = useState<number>(sizes[1] ?? 0.01);

  const offset = status.gcode_move?.homing_origin?.[2] ?? 0;
  const printing = isPrinting(status);
  const savePending = status.configfile?.save_config_pending === true;
  const apply = zOffsetApplyCommand(caps);
  const target = apply === 'Z_OFFSET_APPLY_PROBE' ? 'den Sonden-Offset' : 'die Endschalter-Position';

  const save = async () => {
    if (Math.abs(offset) < 0.0005) {
      toast.info('Kein Offset zum Übernehmen');
      return;
    }
    const ok = await confirmAction({
      title: printing ? 'Offset übernehmen?' : 'Offset dauerhaft speichern?',
      message: printing
        ? `${apply} rechnet den Offset in ${target} ein. Gespeichert wird erst nach dem Druck – SAVE_CONFIG würde Klipper neu starten und den Druck abbrechen.`
        : `${apply} rechnet den Offset in ${target} ein, danach schreibt SAVE_CONFIG die printer.cfg und startet Klipper neu.`,
      confirmLabel: printing ? 'Übernehmen' : 'Speichern',
      tone: 'accent',
    });
    if (!ok) return;
    const done = await sendGcode(persistZOffset(apply, printing));
    if (done && printing) toast.info('Übernommen – nach dem Druck oben „Speichern" tippen');
  };

  return (
    <Card title="Z-Offset / Babystepping">
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          aria-label="Offset verringern"
          onClick={() => void sendGcode(adjustZOffset(-size, printing))}
        >
          <Minus className="size-5" />
        </Button>
        <div className="flex-1 text-center">
          <p className="tabular text-2xl font-semibold">{offset.toFixed(3)}</p>
          <p className="text-[11px] text-muted">mm · näher ans Bett = minus</p>
        </div>
        <Button
          size="lg"
          aria-label="Offset erhöhen"
          onClick={() => void sendGcode(adjustZOffset(size, printing))}
        >
          <Plus className="size-5" />
        </Button>
      </div>

      <div className="mt-3">
        <SegmentedControl
          options={sizes}
          value={size}
          onChange={setSize}
          formatLabel={(value) => `${value}`}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Button block size="sm" onClick={() => void sendGcode(resetZOffset())}>
          <RotateCcw className="size-3.5" /> Zurücksetzen
        </Button>
        <Button block size="sm" tone={savePending ? 'accent' : 'default'} onClick={() => void save()}>
          <Save className="size-3.5" /> {printing ? 'Übernehmen' : 'Speichern'}
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {caps.probe ? `Sonde: ${caps.probe}` : 'Keine Sonde – Z über Endschalter'} · speichert mit{' '}
        <span className="font-mono">{apply}</span>
      </p>
      {savePending && (
        <p className="mt-1 text-[11px] text-warn-ink">
          Klipper hat ungespeicherte Konfigurationsänderungen.
        </p>
      )}
    </Card>
  );
}
