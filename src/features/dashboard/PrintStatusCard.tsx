import { useMemo, useState } from 'react';
import { FileX2, Image as ImageIcon, Pause, Play, Printer, Repeat, RotateCcw, Square } from 'lucide-react';
import { FilamentSheet } from '@/features/control/FilamentSheet';
import { Button, Card, ProgressBar, Row } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useUiStore } from '@/store/ui';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';
import {
  getEtaEstimates,
  getFilamentUsage,
  getLayerInfo,
  getPrintState,
  getProgress,
} from '@/lib/derive';
import {
  basename,
  filamentGrams,
  formatDuration,
  formatEta,
  formatLength,
  formatProgressPercent,
  stripGcodeExtension,
} from '@/lib/format';
import { useTicker } from '@/lib/hooks';

export function PrintStatusCard() {
  const status = usePrinterStore((s) => s.status);
  const metadata = usePrinterStore((s) => s.metadata);
  const client = usePrinterStore((s) => s.client);
  const confirmDestructive = useUiStore((s) => s.confirmDestructive);
  const progressSource = useUiStore((s) => s.progressSource);
  const remainingSources = useUiStore((s) => s.remainingSources);
  const etaSources = useUiStore((s) => s.etaSources);
  const [filamentOpen, setFilamentOpen] = useState(false);
  useTicker(1000);

  const state = getPrintState(status);
  const filename = status.print_stats?.filename ?? '';
  const progress = getProgress(status, metadata, progressSource);
  const eta = useMemo(
    () => getEtaEstimates(status, metadata, { progressSource, remainingSources, etaSources }),
    [status, metadata, progressSource, remainingSources, etaSources],
  );
  const layers = useMemo(() => getLayerInfo(status, metadata), [status, metadata]);
  const filament = useMemo(() => getFilamentUsage(status, metadata), [status, metadata]);

  const thumbnail = useMemo(() => {
    const thumbs = metadata?.thumbnails;
    if (!thumbs?.length || !client || !metadata?.filename) return null;
    const best = [...thumbs].sort((a, b) => b.width - a.width)[0]!;
    return client.thumbnailUrl(metadata.filename, best.relative_path);
  }, [metadata, client]);

  const act = async (
    action: 'pause' | 'resume' | 'cancel',
    label: string,
    needsConfirm = false,
  ) => {
    if (needsConfirm && confirmDestructive) {
      const ok = await confirmAction({
        title: 'Druck abbrechen?',
        message: 'Der laufende Druck wird gestoppt und kann nicht fortgesetzt werden.',
        confirmLabel: 'Druck abbrechen',
        cancelLabel: 'Weiterdrucken',
      });
      if (!ok) return;
    }
    try {
      if (action === 'pause') await client?.pausePrint();
      else if (action === 'resume') await client?.resumePrint();
      else await client?.cancelPrint();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Befehl fehlgeschlagen');
    }
  };

  if (state === 'standby') {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-elevated p-2.5 text-muted">
            <Printer className="size-5" />
          </div>
          <div className="flex-1">
            <p className="font-medium">Bereit</p>
            <p className="text-sm text-muted">Kein Druck aktiv</p>
          </div>
        </div>
      </Card>
    );
  }

  const finished = state === 'complete' || state === 'cancelled' || state === 'error';
  const printDuration = status.print_stats?.print_duration ?? 0;
  const totalDuration = status.print_stats?.total_duration ?? 0;
  const filamentUsed = status.print_stats?.filament_used ?? 0;

  return (
    <Card padded={false}>
      <div className="flex gap-3 p-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-elevated">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted">
              <ImageIcon className="size-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={filename}>
            {stripGcodeExtension(basename(filename)) || 'Unbenannt'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {state === 'printing'
              ? 'Druckt'
              : state === 'paused'
                ? 'Pausiert'
                : state === 'complete'
                  ? 'Fertig'
                  : state === 'cancelled'
                    ? 'Abgebrochen'
                    : 'Fehler'}
            {layers.current != null && layers.total != null && state !== 'complete'
              ? ` · Schicht ${layers.current}/${layers.total}`
              : ''}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar
              value={finished ? (state === 'complete' ? 1 : progress) : progress}
              tone={state === 'error' || state === 'cancelled' ? 'warn' : state === 'complete' ? 'ok' : 'accent'}
            />
            <span className="tabular text-sm font-semibold">
              {formatProgressPercent(state === 'complete' ? 1 : progress)}
            </span>
          </div>
        </div>
      </div>

      {status.print_stats?.message && (
        <p className="mx-4 mb-3 rounded-lg bg-elevated px-3 py-2 font-mono text-[11px] text-muted">
          {status.print_stats.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-4 border-t border-line px-4 py-2">
        <Row label="Laufzeit" value={formatDuration(printDuration, true)} />
        <Row
          label="Restzeit"
          value={finished ? '--' : formatDuration(eta.remaining, true)}
        />
        <Row label="Fertig um" value={finished ? '--' : formatEta(eta.eta)} />
        <Row label="Filament" value={formatLength(filamentUsed)} />
      </div>

      <div className="flex gap-2 border-t border-line p-3">
        {state === 'printing' && (
          <>
            <Button block onClick={() => void act('pause', 'Druck pausiert')}>
              <Pause className="size-4" /> Pause
            </Button>
            <Button block tone="danger" onClick={() => void act('cancel', 'Druck abgebrochen', true)}>
              <Square className="size-4" /> Stopp
            </Button>
          </>
        )}
        {state === 'paused' && (
          <>
            <Button block tone="ok" onClick={() => void act('resume', 'Druck fortgesetzt')}>
              <Play className="size-4" /> Weiter
            </Button>
            <Button onClick={() => setFilamentOpen(true)} aria-label="Filament wechseln">
              <Repeat className="size-4" />
            </Button>
            <Button block tone="danger" onClick={() => void act('cancel', 'Druck abgebrochen', true)}>
              <Square className="size-4" /> Stopp
            </Button>
          </>
        )}
        {finished && (
          <>
            <Button
              block
              tone="accent"
              onClick={async () => {
                try {
                  await client?.startPrint(filename);
                  toast.success('Druck gestartet');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Start fehlgeschlagen');
                }
              }}
              disabled={!filename}
            >
              <RotateCcw className="size-4" /> Erneut drucken
            </Button>
            <Button block onClick={() => void usePrinterStore.getState().sendGcode('SDCARD_RESET_FILE')}>
              <FileX2 className="size-4" /> Schließen
            </Button>
          </>
        )}
      </div>

      <div className="border-t border-line px-4 py-2 text-[11px] text-muted">
        <span className="tabular">
          Gesamtzeit {formatDuration(totalDuration, true)}
          {` · ${
            filament.grams != null
              ? `${filament.grams.toFixed(1)} g`
              : `ca. ${filamentGrams(filament.lengthMm)}`
          }`}
          {eta.file != null && ` · Datei ${formatDuration(eta.file, true)}`}
          {eta.filament != null && ` · Filament ${formatDuration(eta.filament, true)}`}
          {eta.slicer != null && ` · Slicer ${formatDuration(eta.slicer, true)}`}
        </span>
      </div>

      <FilamentSheet open={filamentOpen} onClose={() => setFilamentOpen(false)} />
    </Card>
  );
}
