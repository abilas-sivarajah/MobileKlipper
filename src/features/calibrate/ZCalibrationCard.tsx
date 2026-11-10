import { Crosshair, Ruler, Target } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { getHomedAxes, isPrinting } from '@/lib/derive';
import { homeIfNeeded, moveToXY } from '@/lib/gcode';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';

/**
 * Z reference calibration. With a probe as Z endstop (Neptune 4, CR Touch
 * setups) the probe's z_offset is tuned; with a Z switch (stock Ender 3 V2)
 * the endstop position. Both open Klipper's manual probe helper, which the
 * app shows as a panel above the navigation.
 */
export function ZCalibrationCard() {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const printer = useActivePrinter();
  const caps = useCapabilities();
  const printing = isPrinting(status);
  const homed = getHomedAxes(status);

  const center: [number, number] = [
    (caps.axisMin[0] + caps.axisMax[0]) / 2,
    (caps.axisMin[1] + caps.axisMax[1]) / 2,
  ];
  const atCenter = (cmd: string) =>
    homeIfNeeded(
      homed,
      caps.axisMax[0] > 0 ? `${moveToXY(center[0], center[1], printer?.feedrateXY ?? 100)}\n${cmd}` : cmd,
    );

  return (
    <Card title="Z-Kalibrierung">
      <div className="space-y-2">
        <p className="text-sm text-muted">
          {caps.probe
            ? `Sonde erkannt (${caps.probe})${caps.zEndstopIsProbe ? ', dient als Z-Endschalter' : ', Z homt auf einem Schalter'}.`
            : 'Keine Sonde – Z homt auf dem Endschalter.'}
        </p>

        {caps.probe && caps.zEndstopIsProbe && (
          <Button block onClick={() => void sendGcode(atCenter('PROBE_CALIBRATE'))} disabled={printing}>
            <Target className="size-4" /> Sonden-Offset kalibrieren
          </Button>
        )}
        {!caps.zEndstopIsProbe && (
          <Button block onClick={() => void sendGcode(atCenter('Z_ENDSTOP_CALIBRATE'))} disabled={printing}>
            <Crosshair className="size-4" /> Z-Endschalter kalibrieren
          </Button>
        )}
        {caps.probe && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => void sendGcode(homeIfNeeded(homed, 'PROBE_ACCURACY'))} disabled={printing}>
              <Ruler className="size-3.5" /> Genauigkeit
            </Button>
            <Button size="sm" onClick={() => void sendGcode('QUERY_PROBE')}>
              Sonde abfragen
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted">
          Homt bei Bedarf, fährt zur Bettmitte und startet den Papiertest. Danach mit „Speichern" oben
          in der Kopfzeile übernehmen.
        </p>
      </div>
    </Card>
  );
}
