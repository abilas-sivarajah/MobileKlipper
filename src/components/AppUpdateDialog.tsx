import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { APP_VERSION, MOONRAKER_UPDATER_NAME, REPO } from '@/lib/appUpdate';
import { useAppUpdateStore } from '@/store/appUpdate';
import { usePrinterStore } from '@/store/printer';
import { Button, Spinner } from './ui';

export const MOONRAKER_SNIPPET = `[update_manager ${MOONRAKER_UPDATER_NAME}]
type: web
channel: stable
repo: ${REPO}
path: ~/mobileklipper`;

/** "Update verfügbar" – installiert über Moonraker und lädt die App danach neu. */
export function AppUpdateDialog() {
  const state = useAppUpdateStore();
  const connected = usePrinterStore((s) => s.connection === 'open');
  const { phase, release, dialogOpen } = state;

  const visible =
    dialogOpen &&
    release != null &&
    (phase === 'available' || phase === 'installing' || phase === 'reloading' || phase === 'failed');
  if (!visible || !release) return null;

  const busy = phase === 'installing' || phase === 'reloading';
  const canInstall = state.swUpdateReady || (connected && state.moonrakerManaged !== false);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Später"
        className="absolute inset-0 bg-black/70"
        onClick={() => !busy && state.snooze()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        className="relative z-10 max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-5"
      >
        {phase === 'installing' || phase === 'reloading' ? (
          <>
            <h2 id="update-title" className="text-base font-semibold">
              {phase === 'installing' ? 'Wird aktualisiert …' : 'Wird neu geladen …'}
            </h2>
            <div className="mt-3 flex items-center gap-3 text-sm text-muted">
              <Spinner />
              <span>
                {phase === 'installing'
                  ? `Moonraker lädt MobileKlipper ${release.version} von GitHub und installiert es.`
                  : 'Die neue Version startet gleich.'}
              </span>
            </div>
          </>
        ) : phase === 'failed' ? (
          <>
            <h2 id="update-title" className="text-base font-semibold">
              Update
            </h2>
            <p className="mt-2 text-sm text-danger-ink">{state.error}</p>
            <div className="mt-5 flex gap-2">
              <Button block onClick={state.dismiss}>
                Abbrechen
              </Button>
              <Button block tone="accent" onClick={() => void state.install()}>
                <RefreshCw className="size-4" /> Erneut versuchen
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="update-title" className="text-base font-semibold">
              Update verfügbar
            </h2>
            <p className="mt-2 text-sm">
              MobileKlipper {release.version} ist da (installiert: {APP_VERSION}).
            </p>
            {release.notes && (
              <p className="mt-2 whitespace-pre-line text-sm text-muted">Neu: {release.notes}</p>
            )}

            {!canInstall && (
              <div className="mt-3 space-y-2 rounded-xl bg-elevated p-3 text-[12px] text-muted">
                {connected ? (
                  <>
                    <p>
                      Diese Installation aktualisiert sich nicht selbst. Damit „Jetzt aktualisieren" künftig
                      direkt hier funktioniert, in die <span className="font-mono">moonraker.conf</span> des
                      Druckers, auf dem die App liegt:
                    </p>
                    <pre className="overflow-x-auto rounded-lg bg-bg p-2 font-mono text-[11px] leading-relaxed text-ink">
                      {MOONRAKER_SNIPPET}
                    </pre>
                    <p>Pfad anpassen, Moonraker neu starten. Bis dahin: neue Version von GitHub laden.</p>
                  </>
                ) : (
                  <p>Zum Installieren mit dem Drucker verbinden – Moonraker spielt das Update ein.</p>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <Button block onClick={() => state.snooze()}>
                Später
              </Button>
              {canInstall ? (
                <Button block tone="accent" onClick={() => void state.install()}>
                  <Download className="size-4" />
                  {state.swUpdateReady ? 'Neu laden' : 'Jetzt aktualisieren'}
                </Button>
              ) : (
                <a
                  href={release.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent px-3.5 py-2.5 text-sm font-semibold text-[#04121c]"
                >
                  <ExternalLink className="size-4" /> Auf GitHub
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
