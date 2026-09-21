import { Flame, Thermometer } from 'lucide-react';
import type { HeaterView, SensorView } from '@/lib/derive';
import { formatTemp } from '@/lib/format';

export function HeaterGrid({
  heaters,
  sensors,
  onSelect,
}: {
  heaters: HeaterView[];
  sensors: SensorView[];
  onSelect: (heater: HeaterView) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {heaters.map((heater) => {
        const heating = heater.target > 0 && heater.temperature < heater.target - 1;
        const active = heater.target > 0;
        return (
          <button
            key={heater.key}
            type="button"
            onClick={() => onSelect(heater)}
            className="rounded-[var(--radius-card)] border border-line bg-surface p-3 text-left active:bg-elevated"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Flame
                className={`size-3.5 ${active ? (heating ? 'text-warn' : 'text-ok') : ''}`}
              />
              <span className="truncate">{heater.name}</span>
            </div>
            <p className="mt-1 tabular text-2xl font-semibold leading-tight">
              {formatTemp(heater.temperature)}
            </p>
            <p className="tabular text-xs text-muted">
              Ziel {heater.target > 0 ? formatTemp(heater.target, 0) : 'aus'}
              {heater.power > 0 && ` · ${Math.round(heater.power * 100)} %`}
            </p>
            {heater.canExtrude === false && (
              <p className="mt-1 text-[11px] text-warn">zu kalt zum Extrudieren</p>
            )}
          </button>
        );
      })}

      {sensors.map((sensor) => (
        <div
          key={sensor.key}
          className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Thermometer className="size-3.5" />
            <span className="truncate">{sensor.name}</span>
          </div>
          <p className="mt-1 tabular text-2xl font-semibold leading-tight">
            {formatTemp(sensor.temperature)}
          </p>
          <p className="tabular text-xs text-muted">
            {sensor.min != null && sensor.max != null
              ? `${sensor.min.toFixed(0)}° – ${sensor.max.toFixed(0)}°`
              : 'Sensor'}
          </p>
        </div>
      ))}
    </div>
  );
}
