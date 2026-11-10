import { useState } from 'react';
import { AudioWaveform } from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';
import { parseShaperRecommendation } from '@/lib/bedMesh';
import { getHomedAxes, isPrinting } from '@/lib/derive';
import { homeIfNeeded } from '@/lib/gcode';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';

/** Input shaping with an accelerometer (ADXL345 & co.). */
export function ShaperCard() {
  const status = usePrinterStore((s) => s.status);
  const consoleLines = usePrinterStore((s) => s.console);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const [since, setSince] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const recommendation =
    since != null
      ? parseShaperRecommendation(consoleLines.filter((l) => l.time >= since).map((l) => l.message))
      : {};

  const run = async () => {
    const ok = await confirmAction({
      title: 'Resonanzen messen?',
      message:
        'SHAPER_CALIBRATE schüttelt den Drucker auf beiden Achsen durch. Das ist laut und dauert einige Minuten.',
      confirmLabel: 'Messen',
      tone: 'accent',
    });
    if (!ok) return;
    setSince(Date.now() / 1000 - 1);
    setRunning(true);
    await sendGcode(homeIfNeeded(getHomedAxes(status), 'SHAPER_CALIBRATE'));
    setRunning(false);
  };

  return (
    <Card title="Input Shaper">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => void sendGcode('ACCELEROMETER_QUERY')}>
            Sensor testen
          </Button>
          <Button size="sm" tone="accent" onClick={() => void run()} disabled={running || isPrinting(status)}>
            {running ? <Spinner /> : <AudioWaveform className="size-3.5" />}
            {running ? 'Misst …' : 'Messen'}
          </Button>
        </div>
        {(recommendation.x || recommendation.y) && (
          <dl className="space-y-1 rounded-xl bg-elevated p-3 text-sm">
            {(['x', 'y'] as const).map((axis) =>
              recommendation[axis] ? (
                <div key={axis} className="flex justify-between">
                  <dt className="text-muted">{axis.toUpperCase()}</dt>
                  <dd className="tabular">
                    {recommendation[axis]!.type} · {recommendation[axis]!.freq} Hz
                  </dd>
                </div>
              ) : null,
            )}
            <p className="pt-1 text-[11px] text-muted">Mit „Speichern" in der Kopfzeile übernehmen.</p>
          </dl>
        )}
      </div>
    </Card>
  );
}
