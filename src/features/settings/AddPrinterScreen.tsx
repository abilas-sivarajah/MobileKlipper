import { useState } from 'react';
import { CheckCircle2, CircleAlert, Printer } from 'lucide-react';
import { probeMoonraker, type ProbeResult } from '@/lib/probe';
import { usePrintersStore } from '@/store/printers';
import { Button, Card, Field, Spinner, TextInput } from '@/components/ui';

/** Used both for onboarding and for adding further printers later. */
export function AddPrinterScreen({ onDone }: { onDone?: () => void }) {
  const addPrinter = usePrintersStore((s) => s.addPrinter);
  const setActive = usePrintersStore((s) => s.setActive);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const test = async () => {
    setBusy(true);
    setResult(null);
    const probe = await probeMoonraker(url, apiKey || undefined);
    setResult(probe);
    setBusy(false);
  };

  const save = () => {
    const printer = addPrinter({
      name: name || hostnameOf(url),
      baseUrl: url,
      ...(apiKey ? { apiKey } : {}),
    });
    setActive(printer.id);
    onDone?.();
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="rounded-2xl bg-accent/15 p-3 text-accent">
          <Printer className="size-7" />
        </div>
        <h1 className="text-xl font-semibold">Drucker hinzufügen</h1>
        <p className="text-sm text-muted">
          Adresse deiner Moonraker-Instanz – also das, was du auch im Browser für Mainsail oder
          Fluidd eingibst.
        </p>
      </div>

      <Card>
        <div className="space-y-3">
          <Field label="Adresse" hint="z. B. 192.168.1.42:7125 oder http://mainsail.local">
            <TextInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="192.168.1.42:7125"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Name" hint="Optional – sonst wird der Hostname verwendet.">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Voron 2.4"
            />
          </Field>
          <Field label="API-Key" hint="Nur nötig, wenn Moonraker Authentifizierung verlangt.">
            <TextInput
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="optional"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <Button block onClick={() => void test()} disabled={!url.trim() || busy}>
            {busy ? <Spinner /> : null} Verbindung testen
          </Button>

          {result?.ok && (
            <div className="flex items-start gap-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Moonraker erreichbar</p>
                <p className="text-xs text-ok/80">
                  Version {result.info.moonraker_version ?? 'unbekannt'} · Klipper:{' '}
                  {result.info.klippy_state}
                </p>
              </div>
            </div>
          )}

          {result && !result.ok && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{result.error}</p>
                {result.hint && <p className="mt-1 text-xs text-danger/80">{result.hint}</p>}
              </div>
            </div>
          )}

          <Button block tone="accent" onClick={save} disabled={!url.trim()}>
            Speichern{result && !result.ok ? ' (trotzdem)' : ''}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).hostname;
  } catch {
    return 'Drucker';
  }
}
