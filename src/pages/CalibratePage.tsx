import { BedMeshCard } from '@/features/calibrate/BedMeshCard';
import { BedScrewsCard } from '@/features/calibrate/BedScrewsCard';
import { GantryCard } from '@/features/calibrate/GantryCard';
import { PidCard } from '@/features/calibrate/PidCard';
import { SaveConfigCard } from '@/features/calibrate/SaveConfigCard';
import { ScrewsTiltCard } from '@/features/calibrate/ScrewsTiltCard';
import { ShaperCard } from '@/features/calibrate/ShaperCard';
import { ZCalibrationCard } from '@/features/calibrate/ZCalibrationCard';
import { Card } from '@/components/ui';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';

/** Everything that tunes the machine itself, shown only where the config supports it. */
export default function CalibratePage() {
  const caps = useCapabilities();
  const configLoaded = usePrinterStore((s) => s.status.configfile != null);
  const printer = useActivePrinter();
  const noLeveling = configLoaded && !caps.bedScrews && !caps.screwsTilt && !caps.bedMesh;

  return (
    <div className="space-y-3 p-3">
      <SaveConfigCard />
      {caps.screwsTilt && <ScrewsTiltCard />}
      {caps.bedScrews && <BedScrewsCard />}
      {caps.bedMesh && <BedMeshCard />}
      {noLeveling && <LevelingSetupHint model={printer?.model} />}
      <GantryCard />
      <ZCalibrationCard />
      <PidCard />
      {caps.resonance && <ShaperCard />}
    </div>
  );
}

function LevelingSetupHint({ model }: { model: string | undefined }) {
  return (
    <Card title="Bett-Leveling einrichten">
      <p className="text-sm text-muted">
        Deine printer.cfg enthält weder [bed_screws] noch [screws_tilt_adjust] oder [bed_mesh]. Mit
        einem dieser Abschnitte führt dich die App durchs Leveling.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-elevated p-3 font-mono text-[11px] leading-relaxed text-ink">
        {model === 'ender3v2'
          ? `# Ohne Sonde – Positionen an deine Schrauben anpassen
[bed_screws]
screw1: 30, 35
screw1_name: vorne links
screw2: 200, 35
screw2_name: vorne rechts
screw3: 200, 205
screw3_name: hinten rechts
screw4: 30, 205
screw4_name: hinten links`
          : `[bed_screws]
screw1: 30, 30
screw2: 200, 30
screw3: 200, 200
screw4: 30, 200`}
      </pre>
      <p className="mt-2 text-[11px] text-muted">
        Unter „Mehr → Konfiguration" lässt sich die printer.cfg direkt in der App bearbeiten.
      </p>
    </Card>
  );
}
