import { useEffect, useMemo, useState } from 'react';
import { Card, SegmentedControl } from '@/components/ui';
import { HeaterGrid } from '@/features/dashboard/HeaterGrid';
import { PrintStatusCard } from '@/features/dashboard/PrintStatusCard';
import { QuickActions } from '@/features/dashboard/QuickActions';
import { TempChart } from '@/features/dashboard/TempChart';
import { TempTargetSheet } from '@/features/dashboard/TempTargetSheet';
import { getFilamentSensors, getHeaters, getSensors, type HeaterView } from '@/lib/derive';
import { defaultVisible } from '@/lib/palette';
import { usePrinterStore } from '@/store/printer';
import { useUiStore } from '@/store/ui';
import { PowerCard } from '@/features/system/PowerCard';

const RANGES = [5, 10, 20] as const;

export default function Dashboard() {
  const status = usePrinterStore((s) => s.status);
  const history = usePrinterStore((s) => s.tempHistory);
  const printerInfo = usePrinterStore((s) => s.printerInfo);
  const chartMinutes = useUiStore((s) => s.chartMinutes);
  const setChartMinutes = useUiStore((s) => s.setChartMinutes);
  const [selected, setSelected] = useState<HeaterView | null>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());

  const heaters = useMemo(() => getHeaters(status), [status]);
  const sensors = useMemo(() => getSensors(status), [status]);
  const filamentSensors = useMemo(() => getFilamentSensors(status), [status]);

  // Enable newly discovered heater series once, without overriding user choices.
  const seriesKeys = Object.keys(history.series).join('|');
  useEffect(() => {
    setVisible((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const key of Object.keys(history.series)) {
        if (defaultVisible(key)) next.add(key);
      }
      return next.size ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKeys]);

  const toggle = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Keep the live target in sync while the sheet is open.
  const selectedLive = selected ? (heaters.find((h) => h.key === selected.key) ?? null) : null;

  return (
    <div className="space-y-3 p-3">
      <PrintStatusCard />

      <HeaterGrid heaters={heaters} sensors={sensors} onSelect={setSelected} />

      <Card
        title="Temperaturverlauf"
        action={
          <SegmentedControl
            options={RANGES}
            value={(RANGES.find((r) => r === chartMinutes) ?? 10) as (typeof RANGES)[number]}
            onChange={setChartMinutes}
            formatLabel={(m) => `${m}m`}
            className="w-32"
          />
        }
      >
        {Object.keys(history.series).length ? (
          <TempChart
            history={history}
            minutes={chartMinutes}
            visible={visible}
            onToggle={toggle}
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted">Warte auf Messwerte …</p>
        )}
      </Card>

      <QuickActions />

      <PowerCard compact />

      {filamentSensors.length > 0 && (
        <Card title="Filamentsensoren">
          <ul className="space-y-1.5">
            {filamentSensors.map((sensor) => (
              <li key={sensor.key} className="flex items-center justify-between text-sm">
                <span className="text-muted">{sensor.name}</span>
                <span className={sensor.detected ? 'text-ok-ink' : 'text-warn-ink'}>
                  {sensor.enabled
                    ? sensor.detected
                      ? 'Filament erkannt'
                      : 'kein Filament'
                    : 'deaktiviert'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {printerInfo && (
        <p className="px-1 pb-2 text-center text-[11px] text-muted">
          {printerInfo.hostname} · Klipper {printerInfo.software_version}
        </p>
      )}

      <TempTargetSheet heater={selectedLive} onClose={() => setSelected(null)} />
    </div>
  );
}
