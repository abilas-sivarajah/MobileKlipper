import { useEffect, useState } from 'react';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { Button, Card, Row, Spinner } from '@/components/ui';
import { ToggleRow } from '@/components/ToggleRow';
import { MOONRAKER_SNIPPET } from '@/components/AppUpdateDialog';
import { APP_VERSION, RELEASES_URL } from '@/lib/appUpdate';
import { formatDateTime } from '@/lib/format';
import { useAppUpdateStore } from '@/store/appUpdate';
import { usePrinterStore } from '@/store/printer';
import { toast } from '@/store/toast';

/** Version, "Nach Updates suchen" and the Moonraker setup for self-updates. */
export function AppUpdateCard() {
  const state = useAppUpdateStore();
  const connection = usePrinterStore((s) => s.connection);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (connection === 'open') void useAppUpdateStore.getState().detectMoonrakerUpdater();
  }, [connection]);

  const statusText =
    state.phase === 'checking'
      ? 'Suche …'
      : state.phase === 'available' && state.release
        ? `Version ${state.release.version} verfügbar`
        : state.phase === 'up-to-date'
          ? 'Aktuell'
          : state.phase === 'failed'
            ? (state.error ?? 'Fehler')
            : state.lastCheck
              ? `Zuletzt geprüft ${formatDateTime(state.lastCheck / 1000)}`
              : 'Noch nicht geprüft';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MOONRAKER_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.warning('Kopieren nicht möglich – bitte von Hand markieren');
    }
  };

  return (
    <Card title="App & Updates">
      <div className="divide-y divide-line">
        <Row label="Installiert" value={APP_VERSION} />
        <Row
          label="Status"
          value={
            <span className={state.phase === 'failed' ? 'text-danger-ink' : state.phase === 'available' ? 'text-accent' : ''}>
              {statusText}
            </span>
          }
        />
        <Row
          label="Selbst-Update"
          value={
            state.moonrakerManaged == null
              ? '--'
              : state.moonrakerManaged
                ? 'über Moonraker eingerichtet'
                : 'nicht eingerichtet'
          }
        />
      </div>

      <div className="mt-3 flex gap-2">
        {state.phase === 'available' ? (
          <Button block tone="accent" onClick={state.openDialog}>
            Update anzeigen
          </Button>
        ) : (
          <Button block onClick={() => void state.checkNow()} disabled={state.phase === 'checking'}>
            {state.phase === 'checking' ? <Spinner /> : <RefreshCw className="size-4" />} Nach Updates suchen
          </Button>
        )}
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Alle Versionen auf GitHub"
          className="inline-flex items-center justify-center rounded-xl border border-line bg-elevated px-3.5 text-muted"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="mt-2">
        <ToggleRow
          label="Automatisch nach Updates suchen"
          hint="Beim Öffnen, höchstens alle 15 Minuten"
          checked={state.autoCheck}
          onChange={state.toggleAutoCheck}
        />
      </div>

      {state.moonrakerManaged === false && (
        <div className="mt-2 space-y-2 rounded-xl bg-elevated p-3 text-[12px] text-muted">
          <p>
            Damit sich die App selbst aktualisiert, in die <span className="font-mono">moonraker.conf</span> des
            Druckers, auf dem sie liegt (wie bei Mainsail):
          </p>
          <pre className="overflow-x-auto rounded-lg bg-bg p-2 font-mono text-[11px] leading-relaxed text-ink">
            {MOONRAKER_SNIPPET}
          </pre>
          <Button size="sm" onClick={() => void copy()}>
            <Copy className="size-3.5" /> {copied ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
      )}
    </Card>
  );
}
