import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';
import { testZ } from '@/lib/gcode';
import { usePrinterStore } from '@/store/printer';
import { Button, SegmentedControl } from './ui';

const STEPS = [1, 0.1, 0.05, 0.01] as const;

/**
 * Klipper's manual probe helper (PROBE_CALIBRATE, Z_ENDSTOP_CALIBRATE,
 * MANUAL_PROBE, ...) waits for TESTZ/ACCEPT/ABORT. It is shown wherever the
 * user is, since the tool can also be started from the console.
 */
export function ManualProbePanel() {
  const probe = usePrinterStore((s) => s.status.manual_probe);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const [step, setStep] = useState<(typeof STEPS)[number]>(0.1);
  if (!probe?.is_active) return null;

  const z = probe.z_position;
  const lower = probe.z_position_lower;
  const upper = probe.z_position_upper;

  return (
    <div
      role="dialog"
      aria-label="Manuelles Proben"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-accent/50 bg-surface/95 px-3 pb-3 pt-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur"
    >
      <div className="mx-auto max-w-md space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">Papiertest</p>
          <p className="tabular text-sm">
            Z <span className="text-lg font-semibold">{z != null ? z.toFixed(3) : '--'}</span>
            {lower != null || upper != null ? (
              <span className="ml-1 text-[11px] text-muted">
                ({lower != null ? lower.toFixed(3) : '?'} … {upper != null ? upper.toFixed(3) : '?'})
              </span>
            ) : null}
          </p>
        </div>
        <p className="text-[11px] text-muted">
          Düse absenken, bis ein Blatt Papier beim Schieben leicht kratzt, dann „Übernehmen".
        </p>
        <SegmentedControl options={STEPS} value={step} onChange={setStep} formatLabel={(v) => `${v} mm`} />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void sendGcode(testZ(-step))} aria-label={`${step} mm runter`}>
            <ArrowDown className="size-4" /> runter
          </Button>
          <Button onClick={() => void sendGcode(testZ(step))} aria-label={`${step} mm hoch`}>
            <ArrowUp className="size-4" /> hoch
          </Button>
          <Button size="sm" tone="ghost" onClick={() => void sendGcode(testZ('-'))}>
            halbieren ↓
          </Button>
          <Button size="sm" tone="ghost" onClick={() => void sendGcode(testZ('+'))}>
            halbieren ↑
          </Button>
          <Button tone="ghost" onClick={() => void sendGcode('ABORT')}>
            <X className="size-4" /> Abbrechen
          </Button>
          <Button tone="ok" onClick={() => void sendGcode('ACCEPT')}>
            <Check className="size-4" /> Übernehmen
          </Button>
        </div>
      </div>
    </div>
  );
}
