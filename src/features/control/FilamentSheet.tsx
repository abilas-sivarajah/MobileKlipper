import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Flame, Snowflake, Square } from 'lucide-react';
import { Button, ProgressBar, SegmentedControl, Sheet, Spinner } from '@/components/ui';
import { ToggleRow } from '@/components/ToggleRow';
import { getPrintState } from '@/lib/derive';
import {
  estimateSeconds,
  filamentMacro,
  planFilamentChange,
  readyToExtrude,
  TIP_FORMING_MM,
  type FilamentAction,
} from '@/lib/filament';
import { extrude, setHeaterTarget } from '@/lib/gcode';
import { formatDuration } from '@/lib/format';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { toast } from '@/store/toast';

type Phase = 'setup' | 'heating' | 'running' | 'done';

const ACTIONS: FilamentAction[] = ['unload', 'load'];
const ACTION_LABELS: Record<FilamentAction, string> = { unload: 'Entladen', load: 'Laden' };

/**
 * Guided filament change: heat, then move filament in chunks the printer
 * accepts. Works with the printer's own LOAD/UNLOAD macros when it has them.
 */
export function FilamentSheet({
  open,
  initialAction = 'unload',
  onClose,
}: {
  open: boolean;
  initialAction?: FilamentAction;
  onClose: () => void;
}) {
  const printer = useActivePrinter();
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const appendConsole = usePrinterStore((s) => s.appendConsole);
  const caps = useCapabilities();

  const extruderKey = status.toolhead?.extruder || 'extruder';
  const extruder = (status[extruderKey] ?? {}) as { temperature?: number; target?: number };
  const temperature = extruder.temperature ?? 0;
  const currentTarget = extruder.target ?? 0;
  const presets = printer?.tempPresets ?? [];
  const settings = printer?.filament;
  const printState = getPrintState(status);
  const blocked = printState === 'printing';

  const [action, setAction] = useState<FilamentAction>(initialAction);
  const [temp, setTemp] = useState(0);
  const [useMacro, setUseMacro] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const cancelRef = useRef(false);
  const startedRef = useRef(false);

  const macro = filamentMacro(action, caps.macros);
  const viaMacro = useMacro && macro != null;

  useEffect(() => {
    if (!open) return;
    setAction(initialAction);
    setTemp(currentTarget > 0 ? Math.round(currentTarget) : (presets[0]?.extruder ?? 210));
    setPhase('setup');
    setProgress(0);
    cancelRef.current = false;
    startedRef.current = false;
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Closing the sheet stops a run between chunks and drops a pending start.
  useEffect(() => {
    if (open) return;
    cancelRef.current = true;
    setPhase('setup');
  }, [open]);
  useEffect(
    () => () => {
      cancelRef.current = true;
    },
    [],
  );

  const run = async () => {
    if (!settings) return;
    setPhase('running');
    setProgress(0);
    if (viaMacro) {
      setStepLabel(macro);
      const ok = await sendGcode(macro);
      setPhase(ok ? 'done' : 'setup');
      return;
    }
    const steps = planFilamentChange(action, settings, caps.maxExtrudeOnlyDistance);
    const total = steps.reduce((sum, step) => sum + step.length, 0) || 1;
    appendConsole(
      `// ${ACTION_LABELS[action]}: ${steps.length} Teilbewegungen, max. ${caps.maxExtrudeOnlyDistance} mm je Bewegung`,
      'info',
    );
    let done = 0;
    for (const step of steps) {
      if (cancelRef.current) {
        toast.info('Filamentwechsel abgebrochen');
        setPhase('setup');
        return;
      }
      setStepLabel(step.label);
      const ok = await sendGcode(step.script, false);
      if (!ok) {
        setPhase('setup');
        return;
      }
      done += step.length;
      setProgress(done / total);
    }
    // Moves are queued ahead of the motors; wait until they have run.
    await sendGcode('M400', false);
    setPhase('done');
  };

  const ready = readyToExtrude(temperature, currentTarget, caps.minExtrudeTemp);

  useEffect(() => {
    if (phase !== 'heating' || startedRef.current || !ready) return;
    startedRef.current = true;
    void run();
    // run reads the latest state each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ready]);

  const start = async () => {
    cancelRef.current = false;
    startedRef.current = false;
    const target = Math.round(temp);
    if (target < caps.minExtrudeTemp) {
      toast.warning(`Mindestens ${caps.minExtrudeTemp} °C – darunter verweigert Klipper das Extrudieren`);
      return;
    }
    if (Math.round(currentTarget) !== target) {
      const ok = await sendGcode(setHeaterTarget(extruderKey, target));
      if (!ok) return;
    }
    setPhase('heating');
  };

  const cancel = () => {
    cancelRef.current = true;
    if (phase === 'heating') setPhase('setup');
  };

  const estimate = useMemo(
    () => (settings ? estimateSeconds(action, settings) : 0),
    [action, settings],
  );

  if (!settings) return null;

  const tempOptions = [
    ...(currentTarget > 0 ? [{ id: 'current', label: `Aktuell ${Math.round(currentTarget)}°`, value: Math.round(currentTarget) }] : []),
    ...presets.map((p) => ({ id: p.id, label: `${p.name} ${p.extruder}°`, value: p.extruder })),
  ];

  return (
    <Sheet open={open} title="Filament wechseln" onClose={onClose}>
      <div className="space-y-4">
        {phase === 'setup' && (
          <>
            <SegmentedControl
              options={ACTIONS}
              value={action}
              onChange={setAction}
              formatLabel={(a) => ACTION_LABELS[a]}
            />

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Düsentemperatur</p>
              <div className="flex flex-wrap gap-2">
                {tempOptions.map((option) => (
                  <Button
                    key={option.id}
                    size="sm"
                    tone={temp === option.value ? 'accent' : 'default'}
                    onClick={() => setTemp(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Beim Entladen die Temperatur des Materials, das gerade drin ist.
              </p>
            </div>

            {macro && (
              <div className="rounded-xl border border-line px-3">
                <ToggleRow
                  label={`Druckermakro ${macro} verwenden`}
                  hint="Dein Makro kennt den Filamentweg am besten"
                  checked={useMacro}
                  onChange={() => setUseMacro((v) => !v)}
                />
              </div>
            )}

            {!viaMacro && (
              <ul className="space-y-1 rounded-xl bg-elevated p-3 text-[11px] text-muted tabular">
                {action === 'unload' ? (
                  <>
                    <li>1. Aufheizen auf {temp} °C</li>
                    <li>2. {TIP_FORMING_MM} mm drücken, damit die Spitze weich wird</li>
                    <li>
                      3. {settings.unloadLength} mm zurückziehen mit {settings.unloadSpeed} mm/s
                    </li>
                  </>
                ) : (
                  <>
                    <li>1. Aufheizen auf {temp} °C</li>
                    <li>
                      2. {settings.loadLength} mm einführen mit {settings.loadSpeed} mm/s
                    </li>
                    <li>
                      3. {settings.purgeLength} mm spülen mit {settings.purgeSpeed} mm/s
                    </li>
                  </>
                )}
                <li className="pt-1">
                  Dauer ca. {formatDuration(estimate, true)} · Filamentweg in den Druckereinstellungen
                  anpassbar
                </li>
              </ul>
            )}

            {action === 'load' && (
              <p className="text-[11px] text-muted">
                Filament vorher von Hand bis ins Extruderzahnrad schieben
                {printer?.model === 'ender3v2' ? ' (Hebel am Extruder drücken)' : ''}.
              </p>
            )}

            {blocked && (
              <p className="text-sm text-warn-ink">
                Während eines Drucks erst pausieren – dann lässt sich das Filament wechseln.
              </p>
            )}

            <Button block tone="accent" onClick={() => void start()} disabled={blocked}>
              {action === 'unload' ? (
                <ArrowUpFromLine className="size-4" />
              ) : (
                <ArrowDownToLine className="size-4" />
              )}
              {ACTION_LABELS[action]} starten
            </Button>
          </>
        )}

        {phase === 'heating' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Flame className="size-4 text-warn-ink" />
              <span className="flex-1">Heize auf …</span>
              <span className="tabular font-semibold">
                {temperature.toFixed(1)}° / {Math.round(currentTarget)}°
              </span>
            </div>
            <ProgressBar
              value={currentTarget > 0 ? Math.min(1, temperature / currentTarget) : 0}
              tone="warn"
            />
            <p className="text-[11px] text-muted">Startet automatisch, sobald die Düse warm ist.</p>
            <Button block onClick={cancel}>
              <Square className="size-4" /> Abbrechen
            </Button>
          </div>
        )}

        {phase === 'running' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Spinner />
              <span className="flex-1">{stepLabel}</span>
              {!viaMacro && <span className="tabular font-semibold">{Math.round(progress * 100)} %</span>}
            </div>
            {!viaMacro && <ProgressBar value={progress} />}
            {!viaMacro && (
              <Button block onClick={cancel}>
                <Square className="size-4" /> Nach diesem Stück anhalten
              </Button>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok-ink">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <p>
                {action === 'unload'
                  ? 'Fertig – Filament jetzt herausziehen.'
                  : 'Fertig – läuft die neue Farbe sauber aus der Düse?'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {action === 'unload' ? (
                <Button
                  tone="accent"
                  onClick={() => {
                    setAction('load');
                    setPhase('setup');
                  }}
                >
                  <ArrowDownToLine className="size-4" /> Neues laden
                </Button>
              ) : (
                <Button
                  onClick={() => void sendGcode(extrude(20, settings.purgeSpeed, caps.maxExtrudeOnlyDistance))}
                >
                  <ArrowDownToLine className="size-4" /> +20 mm spülen
                </Button>
              )}
              <Button
                onClick={() => {
                  void sendGcode(setHeaterTarget(extruderKey, 0));
                  onClose();
                }}
                disabled={printState === 'paused'}
              >
                <Snowflake className="size-4" /> Düse aus
              </Button>
            </div>
            <Button block tone={action === 'load' ? 'accent' : 'default'} onClick={onClose}>
              Fertig
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
