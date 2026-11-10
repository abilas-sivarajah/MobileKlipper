import { useMemo, useState } from 'react';
import { CircleCheck, RotateCcw, RotateCw, ScanLine } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { describeAdjust, getScrewResults } from '@/lib/bedMesh';
import { getScrews } from '@/lib/caps';
import { getHomedAxes, isPrinting } from '@/lib/derive';
import { homeIfNeeded } from '@/lib/gcode';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';
import { BedDiagram, type BedMarker } from './BedDiagram';

/**
 * SCREWS_TILT_CALCULATE: the probe measures each screw and Klipper says how
 * far to turn it relative to the base screw. Needs a probe and the
 * [screws_tilt_adjust] section.
 */
export function ScrewsTiltCard() {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const caps = useCapabilities();
  const [busy, setBusy] = useState(false);

  const screws = useMemo(() => getScrews(status, 'screws_tilt_adjust'), [status]);
  const results = useMemo(
    () => getScrewResults(status.screws_tilt_adjust?.results),
    [status.screws_tilt_adjust?.results],
  );
  const byKey = new Map(results.map((r) => [r.key, r]));
  const allFine = results.length > 0 && results.every((r) => r.isBase || r.turns < 2 / 60);

  const measure = async () => {
    setBusy(true);
    await sendGcode(homeIfNeeded(getHomedAxes(status), 'SCREWS_TILT_CALCULATE'));
    setBusy(false);
  };

  const markers: BedMarker[] = screws.map((screw) => {
    const result = byKey.get(screw.key);
    if (!result) {
      return { key: screw.key, x: screw.x, y: screw.y, label: screw.name, tone: 'muted', content: '–' };
    }
    if (result.isBase) {
      return { key: screw.key, x: screw.x, y: screw.y, label: screw.name, tone: 'default', content: 'Referenz' };
    }
    const fine = result.turns < 2 / 60;
    const Icon = result.sign === 'CW' ? RotateCw : RotateCcw;
    return {
      key: screw.key,
      x: screw.x,
      y: screw.y,
      label: screw.name,
      tone: fine ? 'ok' : 'warn',
      content: fine ? (
        <CircleCheck className="size-4" />
      ) : (
        <>
          <Icon className="size-4" />
          <span className="tabular font-semibold">{result.adjust}</span>
        </>
      ),
    };
  });

  return (
    <Card
      title="Bettschrauben (mit Sonde)"
      action={
        <Button size="sm" tone="accent" onClick={() => void measure()} disabled={busy || isPrinting(status)}>
          <ScanLine className="size-3.5" /> {busy ? 'Misst …' : 'Messen'}
        </Button>
      }
    >
      <div className="space-y-3">
        {screws.length > 0 && (
          <BedDiagram
            min={[caps.axisMin[0], caps.axisMin[1]]}
            max={[caps.axisMax[0] || 235, caps.axisMax[1] || 235]}
            markers={markers}
          />
        )}

        {results.length > 0 ? (
          <ul className="divide-y divide-line text-sm">
            {results.map((result) => {
              const screw = screws.find((s) => s.key === result.key);
              return (
                <li key={result.key} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-muted">{screw?.name ?? result.key}</span>
                  <span className="text-right">
                    {describeAdjust(result)}
                    <span className="ml-2 tabular text-[11px] text-muted">z {result.z.toFixed(3)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            „Messen" tastet jede Schraube ab und zeigt, wie weit sie zu drehen ist.
          </p>
        )}

        {status.screws_tilt_adjust?.error && (
          <p className="text-[11px] text-danger-ink">
            Mindestens eine Schraube liegt außerhalb von MAX_DEVIATION.
          </p>
        )}
        {allFine && (
          <p className="flex items-center gap-1.5 text-sm text-ok-ink">
            <CircleCheck className="size-4" /> Alle Schrauben passen.
          </p>
        )}
        <p className="text-[11px] text-muted">
          Drehen, erneut messen, bis überall „passt" steht. Zeigt die Richtung durchweg falsch, passt
          screw_thread in [screws_tilt_adjust] nicht zu deinen Schrauben.
        </p>
      </div>
    </Card>
  );
}
