import { useEffect, useState } from 'react';
import { Camera, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Button, Card, EmptyState, ProgressBar } from '@/components/ui';
import { WebcamView } from '@/features/webcam/WebcamView';
import { usePrinterStore } from '@/store/printer';
import { getHeaters, getProgress, isPrinting } from '@/lib/derive';
import { formatPercent, formatTemp } from '@/lib/format';

export default function WebcamPage() {
  const webcams = usePrinterStore((s) => s.webcams);
  const refreshWebcams = usePrinterStore((s) => s.refreshWebcams);
  const connection = usePrinterStore((s) => s.connection);
  const status = usePrinterStore((s) => s.status);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (connection === 'open' && !webcams.length) void refreshWebcams();
  }, [connection, webcams.length, refreshWebcams]);

  const webcam = webcams[Math.min(index, webcams.length - 1)];
  const heaters = getHeaters(status);
  const printing = isPrinting(status);

  if (!webcam) {
    return (
      <EmptyState
        icon={<Camera className="size-8" />}
        title="Keine Kamera konfiguriert"
        description="Kameras werden in Moonraker (bzw. Mainsail/Fluidd) eingerichtet und hier automatisch übernommen."
        action={
          <Button size="sm" onClick={() => void refreshWebcams()}>
            <RefreshCw className="size-3.5" /> Neu laden
          </Button>
        }
      />
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <WebcamView webcam={webcam} className="flex-1 rounded-none border-0" />
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          aria-label="Vollbild beenden"
          className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] rounded-full bg-black/60 p-3 text-white"
        >
          <Minimize2 className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <Card padded={false}>
        <div className="relative">
          <WebcamView webcam={webcam} className="rounded-b-none border-0" />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="Vollbild"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>

        <div className="space-y-2 p-3">
          {printing && (
            <div className="flex items-center gap-2">
              <ProgressBar value={getProgress(status)} />
              <span className="tabular text-sm font-semibold">
                {formatPercent(getProgress(status))}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {heaters.map((heater) => (
              <span key={heater.key} className="tabular">
                {heater.name}: {formatTemp(heater.temperature)}
                {heater.target > 0 && ` / ${formatTemp(heater.target, 0)}`}
              </span>
            ))}
          </div>
        </div>
      </Card>

      {webcams.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {webcams.map((cam, i) => (
            <Button
              key={cam.uid ?? cam.name}
              size="sm"
              tone={i === index ? 'accent' : 'default'}
              onClick={() => setIndex(i)}
            >
              {cam.name}
            </Button>
          ))}
        </div>
      )}

      <p className="px-1 text-center text-[11px] text-muted">
        {webcam.name} · {webcam.service ?? 'unbekannter Dienst'}
        {webcam.target_fps ? ` · ${webcam.target_fps} fps` : ''}
      </p>
    </div>
  );
}
