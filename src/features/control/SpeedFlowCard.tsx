import { Card } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { setExtrudeFactor, setSpeedFactor, setVelocityLimit } from '@/lib/gcode';
import { SliderRow } from './SliderRow';

export function SpeedFlowCard() {
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);

  const speed = Math.round((status.gcode_move?.speed_factor ?? 1) * 100);
  const flow = Math.round((status.gcode_move?.extrude_factor ?? 1) * 100);
  const velocity = Math.round(status.toolhead?.max_velocity ?? 0);
  const accel = Math.round(status.toolhead?.max_accel ?? 0);

  return (
    <Card title="Geschwindigkeit & Fluss">
      <SliderRow
        label="Druckgeschwindigkeit"
        value={speed}
        min={10}
        max={300}
        step={5}
        unit=" %"
        defaultValue={100}
        onCommit={(value) => void sendGcode(setSpeedFactor(value))}
      />
      <SliderRow
        label="Flussrate"
        value={flow}
        min={50}
        max={150}
        step={1}
        unit=" %"
        defaultValue={100}
        onCommit={(value) => void sendGcode(setExtrudeFactor(value))}
      />
      {velocity > 0 && (
        <SliderRow
          label="Max. Geschwindigkeit"
          value={velocity}
          min={10}
          max={Math.max(600, velocity)}
          step={10}
          unit=" mm/s"
          onCommit={(value) => void sendGcode(setVelocityLimit({ velocity: value }))}
        />
      )}
      {accel > 0 && (
        <SliderRow
          label="Max. Beschleunigung"
          value={accel}
          min={100}
          max={Math.max(20000, accel)}
          step={100}
          unit=" mm/s²"
          onCommit={(value) => void sendGcode(setVelocityLimit({ accel: value }))}
        />
      )}
    </Card>
  );
}
