import { useEffect, useState } from 'react';
import { Flame, Power } from 'lucide-react';
import { Button, Sheet, TextInput } from '@/components/ui';
import type { HeaterView } from '@/lib/derive';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';

/** Sets a heater's target; works for extruders, the bed and generic heaters. */
export function TempTargetSheet({
  heater,
  onClose,
}: {
  heater: HeaterView | null;
  onClose: () => void;
}) {
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const printer = useActivePrinter();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (heater) setValue(Math.round(heater.target || 0));
  }, [heater]);

  if (!heater) return null;

  const apply = async (target: number) => {
    const clamped = Math.min(heater.maxTemp, Math.max(0, Math.round(target)));
    const ok = await sendGcode(
      `SET_HEATER_TEMPERATURE HEATER=${heater.key} TARGET=${clamped}`,
    );
    if (ok) onClose();
  };

  const presets = printer?.tempPresets ?? [];
  const presetValue = (p: (typeof presets)[number]) =>
    heater.kind === 'bed' ? p.bed : heater.kind === 'extruder' ? p.extruder : (p.chamber ?? p.bed);

  return (
    <Sheet open title={`${heater.name} einstellen`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Aktuell</span>
          <span className="tabular text-2xl font-semibold">{heater.temperature.toFixed(1)}°C</span>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Ziel</span>
            <span className="tabular">
              max {heater.maxTemp}°C
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              type="number"
              inputMode="numeric"
              value={value}
              min={0}
              max={heater.maxTemp}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-24 text-center text-lg"
            />
            <input
              type="range"
              min={0}
              max={heater.maxTemp}
              step={1}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="flex-1"
              aria-label="Zieltemperatur"
            />
          </div>
        </div>

        {presets.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Material-Presets</p>
            <div className="grid grid-cols-4 gap-2">
              {presets.map((preset) => (
                <Button key={preset.id} size="sm" onClick={() => setValue(presetValue(preset))}>
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button block onClick={() => void apply(0)}>
            <Power className="size-4" /> Aus
          </Button>
          <Button block tone="accent" onClick={() => void apply(value)}>
            <Flame className="size-4" /> Aufheizen
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
