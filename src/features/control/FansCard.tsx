import { Fan, Lightbulb } from 'lucide-react';
import { Card, Switch } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { getFans, getOutputPins } from '@/lib/derive';
import { setFanSpeed, setOutputPin } from '@/lib/gcode';
import { SliderRow } from './SliderRow';
import { useMemo } from 'react';

export function FansCard() {
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);
  const fans = useMemo(() => getFans(status), [status]);
  const pins = useMemo(() => getOutputPins(status), [status]);

  if (!fans.length && !pins.length) return null;

  return (
    <Card title="Lüfter & Ausgänge">
      {fans.map((fan) =>
        fan.controllable && fan.kind !== 'temperature' ? (
          <SliderRow
            key={fan.key}
            label={fan.name}
            value={Math.round(fan.speed * 100)}
            min={0}
            max={100}
            step={5}
            unit=" %"
            onCommit={(value) => void sendGcode(setFanSpeed(fan, value / 100))}
          />
        ) : (
          <div key={fan.key} className="flex items-center justify-between py-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              <Fan className={`size-3.5 ${fan.speed > 0 ? 'text-accent' : ''}`} />
              {fan.name}
            </span>
            <span className="tabular">
              {Math.round(fan.speed * 100)} %{fan.rpm != null ? ` · ${fan.rpm} rpm` : ''}
            </span>
          </div>
        ),
      )}

      {pins.map((pin) =>
        pin.isPwm ? (
          <SliderRow
            key={pin.key}
            label={pin.name}
            value={Math.round((pin.value / pin.scale) * 100)}
            min={0}
            max={100}
            step={5}
            unit=" %"
            onCommit={(value) =>
              void sendGcode(setOutputPin(pin.key, (value / 100) * pin.scale))
            }
          />
        ) : (
          <div key={pin.key} className="flex items-center justify-between py-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              <Lightbulb className={`size-3.5 ${pin.value > 0 ? 'text-warn-ink' : ''}`} />
              {pin.name}
            </span>
            <Switch
              checked={pin.value > 0}
              label={pin.name}
              onChange={() => void sendGcode(setOutputPin(pin.key, pin.value > 0 ? 0 : 1))}
            />
          </div>
        ),
      )}
    </Card>
  );
}
