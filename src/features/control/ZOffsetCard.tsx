import { Minus, Plus, RotateCcw, Save } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { adjustZOffset, resetZOffset } from '@/lib/gcode';
import { isPrinting } from '@/lib/derive';
import { confirmAction } from '@/store/confirm';
import { useState } from 'react';

export function ZOffsetCard() {
  const printer = useActivePrinter();
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);
  const sizes = printer?.babyStepSizes ?? [0.005, 0.01, 0.05, 0.1];
  const [size, setSize] = useState<number>(sizes[1] ?? 0.01);

  const offset = status.gcode_move?.homing_origin?.[2] ?? 0;
  const printing = isPrinting(status);
  const savePending = status.configfile?.save_config_pending === true;

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
          <p className="text-[11px] text-muted">mm</p>
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
        <Button
          block
          size="sm"
          tone={savePending ? 'accent' : 'default'}
          onClick={async () => {
            const ok = await confirmAction({
              title: 'Offset dauerhaft speichern?',
              message:
                'Z_OFFSET_APPLY_PROBE übernimmt den aktuellen Offset in die Konfiguration. Klipper schreibt die printer.cfg und startet neu.',
              confirmLabel: 'Speichern',
              tone: 'accent',
            });
            if (ok) void sendGcode('Z_OFFSET_APPLY_PROBE\nSAVE_CONFIG');
          }}
        >
          <Save className="size-3.5" /> Speichern
        </Button>
      </div>

      {savePending && (
        <p className="mt-2 text-[11px] text-warn">
          Klipper hat ungespeicherte Konfigurationsänderungen.
        </p>
      )}
    </Card>
  );
}
