import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { extrude } from '@/lib/gcode';
import { getHeaters } from '@/lib/derive';
import { toast } from '@/store/toast';

export function ExtrudeCard() {
  const printer = useActivePrinter();
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);
  const lengths = printer?.extrudeLengths ?? [5, 10, 25, 50];
  const [length, setLength] = useState<number>(lengths[1] ?? 10);
  const feedrate = printer?.extrudeFeedrate ?? 5;

  const extruder = getHeaters(status).find((h) => h.kind === 'extruder');
  // Klipper refuses extrusion below min_extrude_temp; say so instead of failing.
  const tooCold = extruder?.canExtrude === false;

  const run = (direction: 1 | -1) => {
    if (tooCold) {
      toast.warning('Extruder ist zu kalt – erst aufheizen');
      return;
    }
    void sendGcode(extrude(length * direction, feedrate));
  };

  return (
    <Card title="Extruder">
      <div className="flex gap-2">
        <Button block onClick={() => run(-1)} disabled={tooCold}>
          <ArrowUpFromLine className="size-4" /> Zurückziehen
        </Button>
        <Button block tone="accent" onClick={() => run(1)} disabled={tooCold}>
          <ArrowDownToLine className="size-4" /> Extrudieren
        </Button>
      </div>

      <div className="mt-3">
        <SegmentedControl
          options={lengths}
          value={length}
          onChange={setLength}
          formatLabel={(value) => `${value} mm`}
        />
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {feedrate} mm/s
        {extruder ? ` · ${extruder.temperature.toFixed(1)}°C` : ''}
        {tooCold ? ' · zu kalt zum Extrudieren' : ''}
      </p>
    </Card>
  );
}
