import { Button, Card } from '@/components/ui';
import { getHomedAxes, isPrinting } from '@/lib/derive';
import { homeIfNeeded } from '@/lib/gcode';
import { useCapabilities } from '@/lib/useCapabilities';
import { usePrinterStore } from '@/store/printer';

/** Z_TILT_ADJUST / QUAD_GANTRY_LEVEL for printers with several Z motors. */
export function GantryCard() {
  const caps = useCapabilities();
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  if (!caps.zTilt && !caps.quadGantryLevel) return null;
  const homed = getHomedAxes(status);
  return (
    <Card title="Portal ausrichten">
      <div className="grid gap-2">
        {caps.zTilt && (
          <Button onClick={() => void sendGcode(homeIfNeeded(homed, 'Z_TILT_ADJUST'))} disabled={isPrinting(status)}>
            Z_TILT_ADJUST
          </Button>
        )}
        {caps.quadGantryLevel && (
          <Button
            onClick={() => void sendGcode(homeIfNeeded(homed, 'QUAD_GANTRY_LEVEL'))}
            disabled={isPrinting(status)}
          >
            QUAD_GANTRY_LEVEL
          </Button>
        )}
      </div>
    </Card>
  );
}
