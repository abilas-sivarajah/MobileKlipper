import { useEffect, useState, type ReactNode } from 'react';
import { Lightbulb, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button, Field, Sheet, TextInput } from '@/components/ui';
import { usePrintersStore, type PrinterConfig, type TempPreset } from '@/store/printers';
import { profileDefaults, profileFor } from '@/lib/profiles';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';
import { ModelPicker } from './ModelPicker';
import { parseNumberList as parseSteps } from '@/lib/format';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <TextInput
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
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

  const syncListFields = (p: PrinterConfig | null) => {
    setMoveSteps(p?.moveSteps.join('; ') ?? '');
    setBabySteps(p?.babyStepSizes.join('; ') ?? '');
    setExtrudeLengths(p?.extrudeLengths.join('; ') ?? '');
  };

  useEffect(() => {
    setDraft(printer);
    syncListFields(printer);
  }, [printer]);

  if (!printer || !draft) return null;

  const profile = profileFor(draft.model);

  const save = () => {
    const steps = parseSteps(moveSteps);
    const baby = parseSteps(babySteps);
    const lengths = parseSteps(extrudeLengths);
    const presets = draft.tempPresets
      .map((p) => ({ ...p, name: p.name.trim() }))
      .filter((p) => p.name && (p.extruder > 0 || p.bed > 0));
    updatePrinter(printer.id, {
      name: draft.name.trim() || printer.name,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey?.trim() || undefined,
      model: draft.model,
      feedrateXY: positive(draft.feedrateXY, printer.feedrateXY),
      feedrateZ: positive(draft.feedrateZ, printer.feedrateZ),
      extrudeFeedrate: positive(draft.extrudeFeedrate, printer.extrudeFeedrate),
      invertJogX: draft.invertJogX,
      invertJogY: draft.invertJogY,
      tempPresets: presets,
      filament: {
        unloadLength: positive(draft.filament.unloadLength, printer.filament.unloadLength),
        unloadSpeed: positive(draft.filament.unloadSpeed, printer.filament.unloadSpeed),
        loadLength: nonNegative(draft.filament.loadLength, printer.filament.loadLength),
        loadSpeed: positive(draft.filament.loadSpeed, printer.filament.loadSpeed),
        purgeLength: nonNegative(draft.filament.purgeLength, printer.filament.purgeLength),
        purgeSpeed: positive(draft.filament.purgeSpeed, printer.filament.purgeSpeed),
      },
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

  const applyDefaults = () => {
    const next = { ...draft, ...profileDefaults(draft.model) };
    setDraft(next);
    syncListFields(next);
    toast.info(`Startwerte von ${profile.label} eingesetzt – mit „Speichern" übernehmen`);
  };

  const set = <K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setFilament = (key: keyof PrinterConfig['filament'], value: number) =>
    setDraft((d) => (d ? { ...d, filament: { ...d.filament, [key]: value } } : d));
  const setPreset = (index: number, patch: Partial<TempPreset>) =>
    setDraft((d) =>
      d
        ? { ...d, tempPresets: d.tempPresets.map((p, i) => (i === index ? { ...p, ...patch } : p)) }
        : d,
    );

  return (
    <Sheet open title={printer.name} onClose={onClose}>
      <div className="space-y-4">
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
        </div>

        <Section title="Modell">
          <ModelPicker value={draft.model} onChange={(model) => set('model', model)} />
          <Button block size="sm" onClick={applyDefaults}>
            <Wand2 className="size-3.5" /> Startwerte für dieses Modell einsetzen
          </Button>
          {profile.tips.length > 0 && (
            <ul className="space-y-1.5 rounded-xl bg-elevated p-3">
              {profile.tips.map((tip) => (
                <li key={tip} className="flex gap-2 text-[11px] leading-snug text-muted">
                  <Lightbulb className="mt-0.5 size-3 shrink-0 text-warn-ink" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Bewegen">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Tempo X/Y (mm/s)" value={draft.feedrateXY} onChange={(v) => set('feedrateXY', v)} />
            <NumberField label="Tempo Z (mm/s)" value={draft.feedrateZ} onChange={(v) => set('feedrateZ', v)} />
          </div>
          <Field label="Schrittweiten (mm)" hint="Mit Semikolon oder Leerzeichen trennen, z. B. 0.1; 1; 10; 50">
            <TextInput value={moveSteps} onChange={(e) => setMoveSteps(e.target.value)} />
          </Field>
          <Field label="Babystep-Größen (mm)">
            <TextInput value={babySteps} onChange={(e) => setBabySteps(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              block
              size="sm"
              tone={draft.invertJogX ? 'accent' : 'default'}
              onClick={() => set('invertJogX', !draft.invertJogX)}
            >
              X invertieren
            </Button>
            <Button
              block
              size="sm"
              tone={draft.invertJogY ? 'accent' : 'default'}
              onClick={() => set('invertJogY', !draft.invertJogY)}
            >
              Y invertieren
            </Button>
          </div>
        </Section>

        <Section title="Extruder & Filamentwechsel">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Extrusionslängen (mm)">
              <TextInput value={extrudeLengths} onChange={(e) => setExtrudeLengths(e.target.value)} />
            </Field>
            <NumberField
              label="Extrusionstempo (mm/s)"
              value={draft.extrudeFeedrate}
              onChange={(v) => set('extrudeFeedrate', v)}
            />
            <NumberField
              label="Entladen (mm)"
              value={draft.filament.unloadLength}
              onChange={(v) => setFilament('unloadLength', v)}
            />
            <NumberField
              label="… mit (mm/s)"
              value={draft.filament.unloadSpeed}
              onChange={(v) => setFilament('unloadSpeed', v)}
            />
            <NumberField
              label="Schnell laden (mm)"
              value={draft.filament.loadLength}
              onChange={(v) => setFilament('loadLength', v)}
            />
            <NumberField
              label="… mit (mm/s)"
              value={draft.filament.loadSpeed}
              onChange={(v) => setFilament('loadSpeed', v)}
            />
            <NumberField
              label="Spülen (mm)"
              value={draft.filament.purgeLength}
              onChange={(v) => setFilament('purgeLength', v)}
            />
            <NumberField
              label="… mit (mm/s)"
              value={draft.filament.purgeSpeed}
              onChange={(v) => setFilament('purgeSpeed', v)}
            />
          </div>
          <p className="text-[11px] text-muted">
            Bowden (Ender 3 V2): Entladen ≈ Weg vom Extruderzahnrad bis zur Düse. Direct Drive (Neptune
            4): wenige Zentimeter. Lange Wege teilt die App automatisch in Stücke, die Klippers
            max_extrude_only_distance einhalten.
          </p>
        </Section>

        <Section title="Material-Presets">
          <div className="grid grid-cols-[1fr_4.75rem_4.75rem_2.5rem] items-end gap-2 text-[11px] text-muted">
            <span>Name</span>
            <span>Düse °C</span>
            <span>Bett °C</span>
            <span />
          </div>
          {draft.tempPresets.map((preset, index) => (
            <div key={preset.id} className="grid grid-cols-[1fr_4.75rem_4.75rem_2.5rem] gap-2">
              <TextInput
                value={preset.name}
                aria-label="Presetname"
                onChange={(e) => setPreset(index, { name: e.target.value })}
              />
              <TextInput
                type="number"
                inputMode="numeric"
                aria-label={`${preset.name} Düsentemperatur`}
                value={preset.extruder}
                onChange={(e) => setPreset(index, { extruder: Number(e.target.value) })}
                className="px-1 text-center"
              />
              <TextInput
                type="number"
                inputMode="numeric"
                aria-label={`${preset.name} Betttemperatur`}
                value={preset.bed}
                onChange={(e) => setPreset(index, { bed: Number(e.target.value) })}
                className="px-1 text-center"
              />
              <Button
                tone="ghost"
                aria-label={`${preset.name} entfernen`}
                onClick={() =>
                  set(
                    'tempPresets',
                    draft.tempPresets.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            block
            size="sm"
            onClick={() =>
              set('tempPresets', [
                ...draft.tempPresets,
                { id: `p${Date.now().toString(36)}`, name: '', extruder: 200, bed: 60 },
              ])
            }
          >
            <Plus className="size-3.5" /> Preset hinzufügen
          </Button>
        </Section>

        <div className="flex gap-2 border-t border-line pt-4">
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

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
