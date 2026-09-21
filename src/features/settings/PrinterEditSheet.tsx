import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Field, Sheet, TextInput } from '@/components/ui';
import { usePrintersStore, type PrinterConfig } from '@/store/printers';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';

/** Parses "0.1, 1, 10" into a sorted list of positive numbers. */
export function parseSteps(input: string): number[] {
  return input
    .split(/[,;\s]+/)
    .map((part) => Number(part.replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

export function PrinterEditSheet({
  printer,
  onClose,
}: {
  printer: PrinterConfig | null;
  onClose: () => void;
}) {
  const updatePrinter = usePrintersStore((s) => s.updatePrinter);
  const removePrinter = usePrintersStore((s) => s.removePrinter);
  const [draft, setDraft] = useState<PrinterConfig | null>(printer);
  const [moveSteps, setMoveSteps] = useState('');
  const [babySteps, setBabySteps] = useState('');
  const [extrudeLengths, setExtrudeLengths] = useState('');

  useEffect(() => {
    setDraft(printer);
    setMoveSteps(printer?.moveSteps.join(', ') ?? '');
    setBabySteps(printer?.babyStepSizes.join(', ') ?? '');
    setExtrudeLengths(printer?.extrudeLengths.join(', ') ?? '');
  }, [printer]);

  if (!printer || !draft) return null;

  const save = () => {
    const steps = parseSteps(moveSteps);
    const baby = parseSteps(babySteps);
    const lengths = parseSteps(extrudeLengths);
    updatePrinter(printer.id, {
      name: draft.name.trim() || printer.name,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey?.trim() || undefined,
      feedrateXY: draft.feedrateXY,
      feedrateZ: draft.feedrateZ,
      extrudeFeedrate: draft.extrudeFeedrate,
      invertJogX: draft.invertJogX,
      invertJogY: draft.invertJogY,
      ...(steps.length ? { moveSteps: steps } : {}),
      ...(baby.length ? { babyStepSizes: baby } : {}),
      ...(lengths.length ? { extrudeLengths: lengths } : {}),
    });
    toast.success('Gespeichert');
    onClose();
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Drucker entfernen?',
      message: `${printer.name} wird aus der App gelöscht. Der Drucker selbst bleibt unberührt.`,
      confirmLabel: 'Entfernen',
    });
    if (!ok) return;
    removePrinter(printer.id);
    onClose();
  };

  const set = <K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <Sheet open title={printer.name} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Adresse">
          <TextInput
            value={draft.baseUrl}
            onChange={(e) => set('baseUrl', e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <Field label="API-Key" hint="Leer lassen, wenn Moonraker keinen verlangt.">
          <TextInput
            value={draft.apiKey ?? ''}
            onChange={(e) => set('apiKey', e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tempo X/Y (mm/s)">
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.feedrateXY}
              onChange={(e) => set('feedrateXY', Number(e.target.value))}
            />
          </Field>
          <Field label="Tempo Z (mm/s)">
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.feedrateZ}
              onChange={(e) => set('feedrateZ', Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Schrittweiten (mm)" hint="Komma-getrennt, z. B. 0.1, 1, 10, 50">
          <TextInput value={moveSteps} onChange={(e) => setMoveSteps(e.target.value)} />
        </Field>
        <Field label="Babystep-Größen (mm)">
          <TextInput value={babySteps} onChange={(e) => setBabySteps(e.target.value)} />
        </Field>
        <Field label="Extrusionslängen (mm)">
          <TextInput value={extrudeLengths} onChange={(e) => setExtrudeLengths(e.target.value)} />
        </Field>
        <Field label="Extrusionstempo (mm/s)">
          <TextInput
            type="number"
            inputMode="numeric"
            value={draft.extrudeFeedrate}
            onChange={(e) => set('extrudeFeedrate', Number(e.target.value))}
          />
        </Field>

        <div className="flex gap-2">
          <Button
            block
            tone={draft.invertJogX ? 'accent' : 'default'}
            onClick={() => set('invertJogX', !draft.invertJogX)}
          >
            X invertieren
          </Button>
          <Button
            block
            tone={draft.invertJogY ? 'accent' : 'default'}
            onClick={() => set('invertJogY', !draft.invertJogY)}
          >
            Y invertieren
          </Button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button tone="danger" onClick={() => void remove()} aria-label="Drucker entfernen">
            <Trash2 className="size-4" />
          </Button>
          <Button block tone="accent" onClick={save}>
            Speichern
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
