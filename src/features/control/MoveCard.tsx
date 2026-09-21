import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, PowerOff } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { getHomedAxes } from '@/lib/derive';
import { home, jog } from '@/lib/gcode';
import { useState } from 'react';

export function MoveCard() {
  const printer = useActivePrinter();
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);
  const steps = printer?.moveSteps ?? [0.1, 1, 10, 50];
  const [step, setStep] = useState<number>(steps[2] ?? 10);

  const homed = getHomedAxes(status);
  const position = status.gcode_move?.gcode_position ?? status.toolhead?.position;
  const speedXY = printer?.feedrateXY ?? 100;
  const speedZ = printer?.feedrateZ ?? 25;

  const move = (axis: 'X' | 'Y' | 'Z', direction: 1 | -1) => {
    const invert =
      (axis === 'X' && printer?.invertJogX) || (axis === 'Y' && printer?.invertJogY) ? -1 : 1;
    const speed = axis === 'Z' ? speedZ : speedXY;
    void sendGcode(jog(axis, step * direction * invert, speed));
  };

  const axisLabel = (name: string, value: number | undefined, isHomed: boolean) => (
    <div className="flex-1 text-center">
      <p className={`text-[11px] ${isHomed ? 'text-muted' : 'text-warn'}`}>{name}</p>
      <p className="tabular text-sm font-medium">{value != null ? value.toFixed(2) : '--'}</p>
    </div>
  );

  return (
    <Card
      title="Bewegen"
      action={
        <div className="flex gap-1">
          <Button size="sm" onClick={() => void sendGcode(home())}>
            <Home className={`size-3.5 ${homed.x && homed.y && homed.z ? 'text-ok' : 'text-warn'}`} />
            Alle
          </Button>
          <Button size="sm" onClick={() => void sendGcode('M84')} aria-label="Motoren aus">
            <PowerOff className="size-3.5" />
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex rounded-xl bg-elevated px-2 py-1.5">
        {axisLabel('X', position?.[0], homed.x)}
        {axisLabel('Y', position?.[1], homed.y)}
        {axisLabel('Z', position?.[2], homed.z)}
      </div>

      <div className="flex items-center gap-4">
        <div className="grid grid-cols-3 gap-1.5">
          <span />
          <Button aria-label="Y vorwärts" onClick={() => move('Y', 1)}>
            <ArrowUp className="size-5" />
          </Button>
          <span />
          <Button aria-label="X links" onClick={() => move('X', -1)}>
            <ArrowLeft className="size-5" />
          </Button>
          <Button aria-label="X/Y homen" onClick={() => void sendGcode(home(['X', 'Y']))}>
            <Home className="size-4" />
          </Button>
          <Button aria-label="X rechts" onClick={() => move('X', 1)}>
            <ArrowRight className="size-5" />
          </Button>
          <span />
          <Button aria-label="Y rückwärts" onClick={() => move('Y', -1)}>
            <ArrowDown className="size-5" />
          </Button>
          <span />
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <Button aria-label="Z hoch" onClick={() => move('Z', 1)}>
            <ArrowUp className="size-5" /> Z
          </Button>
          <Button aria-label="Z homen" onClick={() => void sendGcode(home(['Z']))}>
            <Home className="size-4" /> Z
          </Button>
          <Button aria-label="Z runter" onClick={() => move('Z', -1)}>
            <ArrowDown className="size-5" /> Z
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <SegmentedControl
          options={steps}
          value={step}
          onChange={setStep}
          formatLabel={(value) => `${value} mm`}
        />
      </div>

      {!(homed.x && homed.y && homed.z) && (
        <p className="mt-2 text-center text-[11px] text-warn">
          Nicht gehomt – Klipper lehnt Bewegungen ab, bis G28 gelaufen ist.
        </p>
      )}
    </Card>
  );
}
