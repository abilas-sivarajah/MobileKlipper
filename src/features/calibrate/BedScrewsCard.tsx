import { useMemo, useState } from 'react';
import { Check, Play, RotateCw, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { getScrews } from '@/lib/caps';
import { getHomedAxes, isPrinting } from '@/lib/derive';
import { homeIfNeeded } from '@/lib/gcode';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';
import { BedDiagram, type BedMarker } from './BedDiagram';

/**
 * BED_SCREWS_ADJUST: the classic paper test, screw by screw, for printers
 * without a probe – the stock Ender 3 V2. Klipper moves the nozzle over each
 * screw; the user turns it and reports back.
 */
export function BedScrewsCard() {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const caps = useCapabilities();
  const screws = useMemo(() => getScrews(status, 'bed_screws'), [status]);
  const tool = status.bed_screws;
  // Older Klipper versions report no status for the tool; then trust our own start.
  const [startedLocally, setStartedLocally] = useState(false);
  const reportsState = typeof tool?.is_active === 'boolean';
  const active = reportsState ? tool!.is_active === true : startedLocally;
  const current = tool?.current_screw ?? -1;
  const accepted = tool?.accepted_screws ?? 0;

  const send = async (cmd: 'ADJUSTED' | 'ACCEPT' | 'ABORT') => {
    const ok = await sendGcode(cmd);
    if (ok && cmd === 'ABORT') setStartedLocally(false);
  };

  const start = async () => {
    const ok = await sendGcode(homeIfNeeded(getHomedAxes(status), 'BED_SCREWS_ADJUST'));
    if (ok) setStartedLocally(true);
  };

  const markers: BedMarker[] = screws.map((screw, index) => ({
    key: screw.key,
    x: screw.x,
    y: screw.y,
    label: screw.name,
    tone: active && index === current ? 'accent' : 'default',
    content: active && index === current ? <RotateCw className="size-4" /> : <span>{index + 1}</span>,
  }));

  return (
    <Card title="Bettschrauben (Papiertest)">
      <div className="space-y-3">
        {screws.length > 0 && (
          <BedDiagram
            min={[caps.axisMin[0], caps.axisMin[1]]}
            max={[caps.axisMax[0] || 235, caps.axisMax[1] || 235]}
            markers={markers}
          />
        )}

        {active ? (
          <>
            <div className="rounded-xl bg-elevated p-3 text-sm">
              <p className="font-medium">
                {current >= 0 && screws[current] ? screws[current]!.name : 'Schraube'}{' '}
                <span className="text-muted">
                  · {tool?.state === 'fine' ? 'Feineinstellung' : 'Grobeinstellung'}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Papier unter die Düse: beim Hin- und Herschieben soll es leicht kratzen. Schraube drehen,
                bis das passt.
                {reportsState ? ` ${accepted} von ${screws.length} ohne Korrektur bestätigt.` : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void send('ADJUSTED')}>
                <RotateCw className="size-4" /> Gedreht
              </Button>
              <Button tone="ok" onClick={() => void send('ACCEPT')}>
                <Check className="size-4" /> Passt so
              </Button>
            </div>
            <Button block size="sm" tone="ghost" onClick={() => void send('ABORT')}>
              <X className="size-3.5" /> Abbrechen
            </Button>
            <p className="text-[11px] text-muted">
              „Gedreht", wenn du nachjustiert hast – Klipper prüft die Schraube dann in der nächsten
              Runde erneut. Fertig ist es, wenn alle Schrauben ohne Drehen passen.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Fährt die Düse nacheinander über jede Schraube. Vorher Bett und Düse auf Drucktemperatur
              bringen – warm sitzt das Bett anders als kalt.
            </p>
            <Button block tone="accent" onClick={() => void start()} disabled={isPrinting(status)}>
              <Play className="size-4" /> Leveling starten
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
