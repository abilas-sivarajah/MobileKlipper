import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, CircleSlash, RefreshCw } from 'lucide-react';
import { Button, Card, EmptyState, Row, Spinner } from '@/components/ui';
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

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 className="size-4 text-ok" />;
    if (status === 'cancelled') return <CircleSlash className="size-4 text-warn" />;
    return <CircleAlert className="size-4 text-danger" />;
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
          <p className="text-sm text-danger">{error}</p>
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
              <li key={job.job_id} className="flex items-start gap-3 px-3 py-2.5">
                <span className="mt-0.5">{statusIcon(job.status)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {stripGcodeExtension(basename(job.filename))}
                  </p>
                  <p className="truncate text-[11px] text-muted tabular">
                    {formatDateTime(job.start_time)} · {formatDuration(job.print_duration, true)} ·{' '}
                    {filamentGrams(job.filament_used)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
