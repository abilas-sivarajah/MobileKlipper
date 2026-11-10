import { useEffect, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { Button, Sheet, Switch } from '@/components/ui';
import { getHeaters } from '@/lib/derive';
import {
  preheatScript,
  preheatTargets,
  presetTemps,
  type PreheatTemps,
} from '@/lib/preheat';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { toast } from '@/store/toast';

const FROM_FILE = '__file__';

/**
 * Heats every relevant heater to a material preset in one go. Secondary bed
 * zones and chambers can be switched off per run.
 */
export function PreheatSheet({
  open,
  onClose,
  fileTemps,
  fileLabel,
}: {
  open: boolean;
  onClose: () => void;
  /** First-layer temperatures from a gcode file, offered as the first choice. */
  fileTemps?: PreheatTemps | null;
  fileLabel?: string;
}) {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const printer = useActivePrinter();
  const presets = printer?.tempPresets ?? [];
  const heaters = useMemo(() => getHeaters(status), [status]);
  const [choice, setChoice] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setChoice(fileTemps ? FROM_FILE : (presets[0]?.id ?? null));
    setSkipped(new Set());
    // Reset only when the sheet opens, not while it is being used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const temps = useMemo<PreheatTemps | null>(() => {
    if (choice === FROM_FILE) return fileTemps ?? null;
    const preset = presets.find((p) => p.id === choice);
    return preset ? presetTemps(preset) : null;
  }, [choice, fileTemps, presets]);

  const targets = useMemo(() => (temps ? preheatTargets(heaters, temps) : []), [heaters, temps]);
  const active = targets.filter((t) => !skipped.has(t.key));

  const heat = async () => {
    if (!active.length) return;
    const ok = await sendGcode(preheatScript(active));
    if (ok) {
      toast.success(
        `Heize auf: ${active.map((t) => `${t.name} ${t.target}°`).join(', ')}`,
      );
      onClose();
    }
  };

  return (
    <Sheet open={open} title="Vorheizen" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {fileTemps && (
            <Button
              size="sm"
              tone={choice === FROM_FILE ? 'accent' : 'default'}
              onClick={() => setChoice(FROM_FILE)}
            >
              {fileLabel ?? 'Aus Datei'}
            </Button>
          )}
          {presets.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              tone={choice === preset.id ? 'accent' : 'default'}
              onClick={() => setChoice(preset.id)}
            >
              {preset.name}
            </Button>
          ))}
        </div>

        {targets.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {targets.map((target) => {
              const on = !skipped.has(target.key);
              return (
                <li key={target.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{target.name}</p>
                    {target.optional && (
                      <p className="text-[11px] text-muted">Zusatzzone – bei kleinen Teilen abwählbar</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`tabular text-sm font-semibold ${on ? '' : 'text-muted line-through'}`}>
                      {target.target}°C
                    </span>
                    <Switch
                      checked={on}
                      label={`${target.name} heizen`}
                      onChange={() =>
                        setSkipped((prev) => {
                          const next = new Set(prev);
                          if (next.has(target.key)) next.delete(target.key);
                          else next.add(target.key);
                          return next;
                        })
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {presets.length || fileTemps
              ? 'Für diese Auswahl gibt es keinen passenden Heizer.'
              : 'Keine Material-Presets angelegt – in den Druckereinstellungen hinzufügen.'}
          </p>
        )}

        <Button block tone="accent" onClick={() => void heat()} disabled={!active.length}>
          <Flame className="size-4" /> Aufheizen
        </Button>
      </div>
    </Sheet>
  );
}
