import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, CircleSlash, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Row, Sheet, Spinner } from '@/components/ui';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';
import { isPrinting } from '@/lib/derive';
import { usePrinterStore } from '@/store/printer';
import type { HistoryJob, HistoryTotals } from '@/moonraker/types';
import {
  filamentGrams,
  formatDateTime,
  formatDuration,
  stripGcodeExtension,
  basename,
} from '@/lib/format';

export default function HistoryPage() {
  const client = usePrinterStore((s) => s.client);
  const connection = usePrinterStore((s) => s.connection);
  const version = usePrinterStore((s) => s.historyVersion);
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [totals, setTotals] = useState<HistoryTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(0);
  const [selected, setSelected] = useState<HistoryJob | null>(null);
  const printing = usePrinterStore((s) => isPrinting(s.status));

  useEffect(() => {
    if (!client || connection !== 'open') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([client.historyList(50), client.historyTotals()])
      .then(([list, t]) => {
        if (cancelled) return;
        setJobs(list.jobs ?? []);
        setTotals(t.job_totals);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, connection, version, manual]);

  const reprint = async (job: HistoryJob) => {
    const ok = await confirmAction({
      title: 'Erneut drucken?',
      message: stripGcodeExtension(basename(job.filename)),
      confirmLabel: 'Drucken',
      tone: 'accent',
    });
    if (!ok) return;
    try {
      await client?.startPrint(job.filename);
      toast.success('Druck gestartet');
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Start fehlgeschlagen');
    }
  };

  const remove = async (job: HistoryJob) => {
    const ok = await confirmAction({
      title: 'Eintrag löschen?',
      message: 'Entfernt den Druck aus dem Verlauf. Die G-Code-Datei bleibt erhalten.',
      confirmLabel: 'Löschen',
    });
    if (!ok) return;
    try {
      await client?.deleteHistoryJob(job.job_id);
      setJobs((list) => list.filter((j) => j.job_id !== job.job_id));
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  };

  const weightOf = (job: HistoryJob): string => {
    const total = job.metadata?.filament_total;
    const weight = job.metadata?.filament_weight_total;
    if (total && weight) return `${((weight * job.filament_used) / total).toFixed(1)} g`;
    return filamentGrams(job.filament_used);
  };

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 className="size-4 text-ok-ink" />;
    if (status === 'cancelled') return <CircleSlash className="size-4 text-warn-ink" />;
    return <CircleAlert className="size-4 text-danger-ink" />;
  };

  return (
    <div className="space-y-3 p-3">
      <Card
        title="Statistik"
        action={
          <Button size="sm" onClick={() => setManual((n) => n + 1)} aria-label="Aktualisieren">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      >
        {totals ? (
          <div className="grid grid-cols-2 gap-x-4">
            <Row label="Drucke" value={totals.total_jobs} />
            <Row label="Druckzeit" value={formatDuration(totals.total_print_time, true)} />
            <Row label="Filament" value={filamentGrams(totals.total_filament_used)} />
            <Row label="Längster Druck" value={formatDuration(totals.longest_print, true)} />
          </div>
        ) : (
          <p className="py-2 text-sm text-muted">{loading ? 'Lädt …' : 'Keine Daten'}</p>
        )}
      </Card>

      {error && (
        <Card>
          <p className="text-sm text-danger-ink">{error}</p>
        </Card>
      )}

      <Card title="Verlauf" padded={false}>
        {loading && !jobs.length ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !jobs.length ? (
          <EmptyState title="Noch keine Drucke" description="Abgeschlossene Drucke landen hier." />
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <li key={job.job_id}>
                <button
                  type="button"
                  onClick={() => setSelected(job)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left active:bg-elevated"
                >
                  <span className="mt-0.5">{statusIcon(job.status)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{stripGcodeExtension(basename(job.filename))}</p>
                    <p className="truncate text-[11px] text-muted tabular">
                      {formatDateTime(job.start_time)} · {formatDuration(job.print_duration, true)} ·{' '}
                      {weightOf(job)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet
        open={selected != null}
        title={selected ? stripGcodeExtension(basename(selected.filename)) : ''}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <div className="divide-y divide-line">
              <Row label="Status" value={STATUS_LABELS[selected.status] ?? selected.status} />
              <Row label="Gestartet" value={formatDateTime(selected.start_time)} />
              <Row label="Druckzeit" value={formatDuration(selected.print_duration, true)} />
              <Row label="Gesamtzeit" value={formatDuration(selected.total_duration, true)} />
              <Row label="Filament" value={`${(selected.filament_used / 1000).toFixed(2)} m · ${weightOf(selected)}`} />
              {selected.metadata?.filament_type && (
                <Row label="Material" value={selected.metadata.filament_type} />
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Button tone="danger" onClick={() => void remove(selected)} aria-label="Aus Verlauf löschen">
                <Trash2 className="size-4" />
              </Button>
              <Button
                block
                tone="accent"
                onClick={() => void reprint(selected)}
                disabled={!selected.exists || printing}
              >
                <Printer className="size-4" /> {selected.exists ? 'Erneut drucken' : 'Datei nicht mehr vorhanden'}
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Fertig',
  cancelled: 'Abgebrochen',
  error: 'Fehler',
  klippy_shutdown: 'Klipper gestoppt',
  klippy_disconnect: 'Verbindung verloren',
  interrupted: 'Unterbrochen',
  in_progress: 'Läuft',
};
