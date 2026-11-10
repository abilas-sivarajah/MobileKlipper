import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button, Card, TextInput } from '@/components/ui';
import { setPressureAdvance, setRetraction } from '@/lib/gcode';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';

/**
 * A number that is edited locally and only sent on commit, with nudge buttons.
 * Typing "0.0" on the way to "0.05" must not fire three gcode commands.
 */
function Stepper({
  label,
  value,
  step,
  digits,
  unit,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  digits: number;
  unit?: string;
  min?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value.toFixed(digits));
  useEffect(() => setDraft(value.toFixed(digits)), [value, digits]);
  const commit = (next: number) => {
    const clamped = Math.max(min, Number(next.toFixed(digits)));
    if (!Number.isFinite(clamped)) return;
    setDraft(clamped.toFixed(digits));
    if (Math.abs(clamped - value) > 10 ** -(digits + 1)) onCommit(clamped);
  };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="flex-1 text-sm text-muted">{label}</span>
      <Button size="sm" aria-label={`${label} verringern`} onClick={() => commit(value - step)}>
        <Minus className="size-3.5" />
      </Button>
      <TextInput
        type="number"
        inputMode="decimal"
        step={step}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(Number(draft.replace(',', '.')))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(Number(draft.replace(',', '.')));
        }}
        className="w-20 px-2 py-1.5 text-center"
      />
      <Button size="sm" aria-label={`${label} erhöhen`} onClick={() => commit(value + step)}>
        <Plus className="size-3.5" />
      </Button>
      {unit && <span className="w-8 text-[11px] text-muted">{unit}</span>}
    </div>
  );
}

export function TuneCard() {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const caps = useCapabilities();
  const extruderKey = status.toolhead?.extruder || 'extruder';
  const extruder = (status[extruderKey] ?? {}) as { pressure_advance?: number; smooth_time?: number };
  const retraction = status.firmware_retraction;
  const hasPa = typeof extruder.pressure_advance === 'number';

  if (!hasPa && !(caps.firmwareRetraction && retraction)) return null;

  return (
    <Card title="Feintuning">
      {hasPa && (
        <>
          <Stepper
            label="Pressure Advance"
            value={extruder.pressure_advance!}
            step={0.005}
            digits={4}
            onCommit={(v) => void sendGcode(setPressureAdvance(v, extruderKey))}
          />
          <p className="pb-2 text-[11px] text-muted">
            Typisch 0.02–0.08 bei Direct Drive, 0.3–0.9 bei Bowden. Gilt bis zum Neustart; dauerhaft in
            [extruder] pressure_advance eintragen.
          </p>
        </>
      )}
      {caps.firmwareRetraction && retraction && (
        <div className="border-t border-line pt-2">
          <Stepper
            label="Retract-Länge"
            value={retraction.retract_length ?? 0}
            step={0.1}
            digits={2}
            unit="mm"
            onCommit={(v) => void sendGcode(setRetraction({ length: v }))}
          />
          <Stepper
            label="Retract-Tempo"
            value={retraction.retract_speed ?? 0}
            step={5}
            digits={0}
            unit="mm/s"
            onCommit={(v) => void sendGcode(setRetraction({ speed: v }))}
          />
          <Stepper
            label="Extra beim Zurückschieben"
            value={retraction.unretract_extra_length ?? 0}
            step={0.05}
            digits={2}
            unit="mm"
            onCommit={(v) => void sendGcode(setRetraction({ unretractExtra: v }))}
          />
        </div>
      )}
    </Card>
  );
}
