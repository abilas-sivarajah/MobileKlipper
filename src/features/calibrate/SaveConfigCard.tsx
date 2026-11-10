import { Save } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { isPrinting } from '@/lib/derive';
import { usePrinterStore } from '@/store/printer';
import { useSaveConfig } from './useSaveConfig';

/** Lists what SAVE_CONFIG would write, so nothing is saved blind. */
export function SaveConfigCard() {
  const configfile = usePrinterStore((s) => s.status.configfile);
  const printing = usePrinterStore((s) => isPrinting(s.status));
  const save = useSaveConfig();
  if (!configfile?.save_config_pending) return null;
  const items = configfile.save_config_pending_items ?? {};

  return (
    <Card title="Ungespeicherte Änderungen" className="border-accent/50">
      <ul className="space-y-1.5">
        {Object.entries(items).map(([section, values]) => (
          <li key={section} className="text-sm">
            <p className="font-mono text-xs text-accent">[{section}]</p>
            {values && typeof values === 'object' && (
              <p className="truncate font-mono text-[11px] text-muted">
                {Object.entries(values)
                  .map(([k, v]) => `${k}: ${String(v).split('\n')[0]}`)
                  .join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
      <Button block tone="accent" className="mt-3" onClick={() => void save()} disabled={printing}>
        <Save className="size-4" /> In printer.cfg speichern
      </Button>
      {printing && (
        <p className="mt-2 text-[11px] text-warn-ink">Erst nach dem Druck – SAVE_CONFIG startet Klipper neu.</p>
      )}
    </Card>
  );
}
