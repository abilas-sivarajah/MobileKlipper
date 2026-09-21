import { Card, SegmentedControl } from '@/components/ui';
import { useUiStore } from '@/store/ui';
import type { EstimateSource, ProgressSource } from '@/lib/derive';

const PROGRESS_SOURCES: ProgressSource[] = ['file-relative', 'file-absolute', 'slicer', 'filament'];
const PROGRESS_LABELS: Record<ProgressSource, string> = {
  'file-relative': 'Datei',
  'file-absolute': 'Roh',
  slicer: 'Slicer',
  filament: 'Filament',
};

const SOURCES: EstimateSource[] = ['file', 'filament', 'slicer'];
const SOURCE_LABELS: Record<EstimateSource, string> = {
  file: 'Datei',
  filament: 'Filament',
  slicer: 'Slicer',
};

/**
 * Mirrors Mainsail's estimate settings so both can be made to agree. The
 * defaults are Mainsail's: the slicer estimate feeds the finish time but not
 * the headline remaining time.
 */
export function EstimateSettings() {
  const progressSource = useUiStore((s) => s.progressSource);
  const setProgressSource = useUiStore((s) => s.setProgressSource);
  const remainingSources = useUiStore((s) => s.remainingSources);
  const etaSources = useUiStore((s) => s.etaSources);
  const toggleSource = useUiStore((s) => s.toggleEstimateSource);

  const chips = (
    field: 'remainingSources' | 'etaSources',
    selected: EstimateSource[],
  ) => (
    <div className="flex gap-2">
      {SOURCES.map((source) => {
        const on = selected.includes(source);
        return (
          <button
            key={source}
            type="button"
            aria-pressed={on}
            onClick={() => toggleSource(field, source)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              on ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted'
            }`}
          >
            {SOURCE_LABELS[source]}
          </button>
        );
      })}
    </div>
  );

  return (
    <Card title="Zeitschätzung">
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Fortschritt berechnen aus</p>
          <SegmentedControl
            options={PROGRESS_SOURCES}
            value={progressSource}
            onChange={setProgressSource}
            formatLabel={(source) => PROGRESS_LABELS[source]}
          />
          <p className="mt-1 text-[11px] text-muted">
            „Datei" zählt nur den druckbaren Teil und lässt Thumbnails und den
            Konfigurationsblock am Dateiende außen vor. „Roh" ist der Wert, den Klipper direkt
            meldet.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Restzeit mitteln aus</p>
          {chips('remainingSources', remainingSources)}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">„Fertig um" mitteln aus</p>
          {chips('etaSources', etaSources)}
        </div>

        <p className="text-[11px] text-muted">
          Die Voreinstellung entspricht Mainsail: die Slicer-Schätzung fließt in „Fertig um" ein,
          aber nicht in die Restzeit.
        </p>
      </div>
    </Card>
  );
}
