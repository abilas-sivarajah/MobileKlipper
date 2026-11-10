import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';
import { isPrinting } from '@/lib/derive';
import { updateViews, type UpdateView } from '@/lib/system';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { toast } from '@/store/toast';

/** Moonraker's update manager: what is outdated, and a guarded update button. */
export function UpdatesCard() {
  const client = usePrinterStore((s) => s.client);
  const connection = usePrinterStore((s) => s.connection);
  const components = usePrinterStore((s) => s.serverInfo?.components);
  const printing = usePrinterStore((s) => isPrinting(s.status));
  const printer = useActivePrinter();
  const [views, setViews] = useState<UpdateView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!client) return;
      setLoading(true);
      try {
        const status = await client.updateStatus(refresh);
        setViews(updateViews(status.version_info));
      } catch (err) {
        if (refresh) toast.error(err instanceof Error ? err.message : 'Prüfen fehlgeschlagen');
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const available = components?.includes('update_manager') ?? false;
  useEffect(() => {
    if (available && connection === 'open') void load(false);
  }, [available, connection, load]);

  if (!available) return null;

  const upgrade = async (view: UpdateView) => {
    const ok = await confirmAction({
      title: `${view.name} aktualisieren?`,
      message: `${
        printer?.model === 'neptune4' && view.name === 'klipper'
          ? 'Achtung: Der Neptune 4 läuft mit Elegoos angepasstem Klipper. Ein Update auf das offizielle Klipper kann den Drucker unbrauchbar machen. '
          : ''
      }Dienste starten währenddessen neu. Das kann einige Minuten dauern.`,
      confirmLabel: 'Aktualisieren',
      tone: 'warn',
    });
    if (!ok || !client) return;
    setRunning(view.name);
    try {
      await client.upgrade(view.name);
      toast.success(`${view.name} aktualisiert`);
      await load(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update fehlgeschlagen');
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card
      title="Software"
      action={
        <Button size="sm" onClick={() => void load(true)} disabled={loading} aria-label="Nach Updates suchen">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      }
    >
      {!views ? (
        <p className="text-sm text-muted">{loading ? 'Lädt …' : 'Keine Daten'}</p>
      ) : (
        <ul className="divide-y divide-line">
          {views.map((view) => (
            <li key={view.name} className="flex items-center gap-3 py-2">
              {view.blocked ? (
                <ShieldAlert className="size-4 shrink-0 text-warn-ink" />
              ) : view.behind ? (
                <ArrowUpCircle className="size-4 shrink-0 text-accent" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0 text-ok-ink" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{view.isSystem ? 'Betriebssystem' : view.name}</p>
                <p className="truncate text-[11px] text-muted tabular">
                  {view.isSystem
                    ? view.behind
                      ? `${view.behind} Paket-Updates`
                      : 'aktuell'
                    : `${view.current}${view.behind && view.remote ? ` → ${view.remote}` : ''}`}
                  {view.blocked ? ` · ${view.blocked}` : ''}
                </p>
              </div>
              {view.behind > 0 && !view.blocked && (
                <Button
                  size="sm"
                  onClick={() => void upgrade(view)}
                  disabled={running != null || printing}
                >
                  {running === view.name ? <Spinner /> : 'Update'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {printing && <p className="mt-2 text-[11px] text-muted">Updates sind während eines Drucks gesperrt.</p>}
    </Card>
  );
}
