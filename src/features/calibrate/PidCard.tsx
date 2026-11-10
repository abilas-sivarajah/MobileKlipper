import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button, Card, SegmentedControl, Spinner, TextInput } from '@/components/ui';
import { ToggleRow } from '@/components/ToggleRow';
import { parsePidResult } from '@/lib/bedMesh';
import { getHeaters, isPrinting } from '@/lib/derive';
import { pidCalibrate } from '@/lib/gcode';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';

/** PID_CALIBRATE for any heater; Klipper reports the result in the console. */
export function PidCard() {
  const status = usePrinterStore((s) => s.status);
  const consoleLines = usePrinterStore((s) => s.console);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const printer = useActivePrinter();
  const heaters = useMemo(() => getHeaters(status), [status]);
  const [key, setKey] = useState<string | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [fan, setFan] = useState(false);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const heater = heaters.find((h) => h.key === key) ?? heaters[0];
  if (!heater) return null;

  const preset = printer?.tempPresets[0];
  const defaultTarget =
    heater.kind === 'extruder' ? (preset?.extruder ?? 210) : (preset?.bed ?? 60);
  const value = target ?? defaultTarget;
  const since = runningSince ?? finishedAt;
  const result =
    since != null
      ? parsePidResult(consoleLines.filter((l) => l.time >= since).map((l) => l.message))
      : null;

  const run = async () => {
    const ok = await confirmAction({
      title: `PID-Tuning ${heater.name}?`,
      message: `Heizt auf ${value} °C und schwingt mehrmals um diesen Wert – das dauert einige Minuten. Den Drucker solange nicht unbeaufsichtigt lassen.`,
      confirmLabel: 'Starten',
      tone: 'accent',
    });
    if (!ok) return;
    const started = Date.now() / 1000 - 1;
    setRunningSince(started);
    setFinishedAt(null);
    const script = [
      ...(fan && heater.kind === 'extruder' ? ['M106 S255'] : []),
      pidCalibrate(heater.key, value),
      ...(fan && heater.kind === 'extruder' ? ['M107'] : []),
    ].join('\n');
    await sendGcode(script);
    setRunningSince(null);
    setFinishedAt(started);
  };

  const running = runningSince != null;

  return (
    <Card title="PID-Tuning">
      <div className="space-y-3">
        {heaters.length > 1 && (
          <SegmentedControl
            options={heaters.map((h) => h.key)}
            value={heater.key}
            onChange={(k) => {
              setKey(k);
              setTarget(null);
            }}
            formatLabel={(k) => heaters.find((h) => h.key === k)?.name ?? k}
          />
        )}
        <div className="flex items-center gap-3">
          <TextInput
            type="number"
            inputMode="numeric"
            aria-label="Zieltemperatur"
            value={value}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-24 text-center"
          />
          <span className="text-sm text-muted">°C · jetzt {heater.temperature.toFixed(1)} °C</span>
        </div>
        {heater.kind === 'extruder' && (
          <ToggleRow
            label="Bauteillüfter an"
            hint="So tunen, wie später gedruckt wird"
            checked={fan}
            onChange={() => setFan((v) => !v)}
          />
        )}
        <Button
          block
          tone="accent"
          onClick={() => void run()}
          disabled={running || isPrinting(status) || value <= 0 || value > heater.maxTemp}
        >
          {running ? <Spinner /> : <Activity className="size-4" />}
          {running ? 'Tuning läuft …' : 'Tuning starten'}
        </Button>
        {result && (
          <p className="rounded-xl bg-elevated p-3 font-mono text-[11px] tabular">
            Kp {result.kp} · Ki {result.ki} · Kd {result.kd}
            <span className="mt-1 block font-sans text-muted">
              Mit „Speichern" in der Kopfzeile in die printer.cfg schreiben.
            </span>
          </p>
        )}
        {heater.kind === 'generic' && (
          <p className="text-[11px] text-warn-ink">
            Ältere Klipper-Versionen (z. B. Elegoo-Firmware) schreiben die Werte eines heater_generic
            unter falschem Abschnittsnamen. Nach SAVE_CONFIG die printer.cfg prüfen.
          </p>
        )}
      </div>
    </Card>
  );
}
