import { useState } from 'react';
import { Flame, Home, PowerOff, Snowflake, Star } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter } from '@/store/printers';
import { getHomedAxes } from '@/lib/derive';
import { PreheatSheet } from './PreheatSheet';

export function QuickActions() {
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const status = usePrinterStore((s) => s.status);
  const printer = useActivePrinter();
  const [preheatOpen, setPreheatOpen] = useState(false);
  const homed = getHomedAxes(status);
  const allHomed = homed.x && homed.y && homed.z;
  const favorites = printer?.favoriteMacros ?? [];

  return (
    <Card title="Schnellzugriff">
      <div className="grid grid-cols-2 gap-2">
        <Button tone="accent" onClick={() => setPreheatOpen(true)}>
          <Flame className="size-4" /> Vorheizen
        </Button>
        <Button onClick={() => void sendGcode('TURN_OFF_HEATERS')}>
          <Snowflake className="size-4" /> Abkühlen
        </Button>
        <Button onClick={() => void sendGcode('G28')}>
          <Home className={`size-4 ${allHomed ? 'text-ok-ink' : ''}`} /> Homen
        </Button>
        <Button onClick={() => void sendGcode('M84')}>
          <PowerOff className="size-4" /> Motoren aus
        </Button>
      </div>

      {favorites.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {favorites.map((macro) => (
            <Button key={macro} size="sm" onClick={() => void sendGcode(macro)}>
              <Star className="size-3.5 text-warn-ink" />
              <span className="truncate">{macro}</span>
            </Button>
          ))}
        </div>
      )}

      <PreheatSheet open={preheatOpen} onClose={() => setPreheatOpen(false)} />
    </Card>
  );
}
