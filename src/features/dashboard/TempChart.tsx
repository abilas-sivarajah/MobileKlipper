import { useEffect, useMemo, useRef, useState } from 'react';
import type { TempHistory } from '@/lib/tempHistory';
import { orderSeriesKeys, seriesColor } from '@/lib/palette';
import { prettyObjectName } from '@/lib/format';
import { genericHeaterName } from '@/lib/derive';

const PAD = { top: 10, right: 10, bottom: 18, left: 34 };
const HEIGHT = 190;
/** One drawn point per ~2 px keeps 20 minutes of 1 Hz samples cheap to render. */
const PX_PER_POINT = 2;

export interface TempChartProps {
  history: TempHistory;
  minutes: number;
  visible: Set<string>;
  onToggle: (key: string) => void;
}

interface SeriesPoints {
  key: string;
  color: string;
  label: string;
  temps: number[];
  targets: number[];
  hasTarget: boolean;
}

export function TempChart({ history, minutes, visible, onToggle }: TempChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const orderedKeys = useMemo(
    () => orderSeriesKeys(Object.keys(history.series)),
    [history.series],
  );

  const windowSamples = Math.max(30, minutes * 60);
  const plotWidth = Math.max(40, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = Math.max(1, Math.ceil(windowSamples / (plotWidth / PX_PER_POINT)));
  const pointCount = Math.ceil(windowSamples / step);

  const series = useMemo<SeriesPoints[]>(() => {
    return orderedKeys
      .filter((key) => visible.has(key))
      .map((key) => {
        const entry = history.series[key]!;
        return {
          key,
          color: seriesColor(key, orderedKeys),
          label: labelFor(key),
          temps: sampleTail(entry.temperatures, windowSamples, step),
          targets: sampleTail(entry.targets, windowSamples, step),
          hasTarget: entry.hasTarget,
        };
      });
  }, [orderedKeys, visible, history.series, windowSamples, step]);

  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      for (const v of s.temps) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (s.hasTarget) {
        for (const v of s.targets) if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 100 };
    const padded = Math.max(10, (hi - lo) * 0.15);
    return {
      min: Math.max(0, Math.floor((lo - padded) / 10) * 10),
      max: Math.ceil((hi + padded) / 10) * 10,
    };
  }, [series]);

  // Newest sample sits at the right edge; series of different length stay aligned.
  const xFor = (indexFromEnd: number) =>
    PAD.left + plotWidth - (indexFromEnd * plotWidth) / Math.max(1, pointCount - 1);
  const yFor = (value: number) =>
    PAD.top + plotHeight - ((value - min) / Math.max(1, max - min)) * plotHeight;

  const pathFor = (values: number[]) => {
    if (!values.length) return '';
    return values
      .map((v, i) => {
        const x = xFor(values.length - 1 - i);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${yFor(v).toFixed(1)}`;
      })
      .join(' ');
  };

  const ticks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
  }, [min, max]);

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = (x - PAD.left) / plotWidth;
    if (ratio < 0 || ratio > 1) {
      setHoverIndex(null);
      return;
    }
    setHoverIndex(Math.round((1 - ratio) * (pointCount - 1)));
  };

  const hoverX = hoverIndex == null ? null : xFor(hoverIndex);
  const secondsAgo = hoverIndex == null ? 0 : hoverIndex * step;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Temperaturverlauf"
        className="touch-pan-y select-none"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="var(--color-line)"
              strokeWidth={1}
              opacity={0.6}
            />
            <text
              x={PAD.left - 6}
              y={yFor(tick) + 3.5}
              textAnchor="end"
              className="fill-[var(--color-muted)] text-[9px] tabular"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {[minutes, minutes / 2, 0].map((m) => {
          const x = xFor((m * 60) / step);
          return (
            <text
              key={m}
              x={Math.min(width - PAD.right, Math.max(PAD.left, x))}
              y={HEIGHT - 4}
              textAnchor={m === 0 ? 'end' : m === minutes ? 'start' : 'middle'}
              className="fill-[var(--color-muted)] text-[9px] tabular"
            >
              {m === 0 ? 'jetzt' : `-${m} min`}
            </text>
          );
        })}

        {series.map((s) => (
          <g key={s.key}>
            {s.hasTarget && s.targets.some((t) => t > 0) && (
              <path
                d={pathFor(s.targets)}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                opacity={0.55}
              />
            )}
            <path
              d={pathFor(s.temps)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}

        {hoverX != null && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const value = valueAt(s.temps, hoverIndex!);
              if (value == null) return null;
              return (
                <circle
                  key={s.key}
                  cx={hoverX}
                  cy={yFor(value)}
                  r={4}
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              );
            })}
          </>
        )}
      </svg>

      {hoverIndex != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-elevated/95 px-2 py-1.5 text-[11px] shadow-lg"
          style={{
            left: Math.min(Math.max(8, (hoverX ?? 0) - 60), Math.max(8, width - 130)),
          }}
        >
          <p className="mb-1 text-muted tabular">
            {secondsAgo === 0 ? 'jetzt' : `vor ${formatAgo(secondsAgo)}`}
          </p>
          {series.map((s) => {
            const value = valueAt(s.temps, hoverIndex);
            if (value == null) return null;
            return (
              <p key={s.key} className="flex items-center gap-1.5 text-ink tabular">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.label}: {value.toFixed(1)}°
              </p>
            );
          })}
        </div>
      )}

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {orderedKeys.map((key) => {
          const entry = history.series[key]!;
          const on = visible.has(key);
          const current = entry.temperatures.at(-1);
          const target = entry.targets.at(-1) ?? 0;
          const valueText = `${current != null ? `${current.toFixed(1)}°` : '--'}${
            entry.hasTarget && target > 0 ? ` / ${target.toFixed(0)}°` : ''
          }`;
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={on}
                // The rendered spans have no whitespace between them, which
                // would run the name together as "Extruder210.0°".
                aria-label={`${labelFor(key)}: ${valueText}`}
                onClick={() => onToggle(key)}
                className={`flex items-center gap-1.5 text-[11px] ${on ? 'text-ink' : 'text-muted/60'}`}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    background: on ? seriesColor(key, orderedKeys) : 'var(--color-line)',
                  }}
                  aria-hidden
                />
                <span>{labelFor(key)}</span>
                <span className="tabular text-muted">{valueText}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function labelFor(key: string): string {
  if (key === 'extruder') return 'Extruder';
  if (/^extruder\d+$/.test(key)) return `Extruder ${key.slice(8)}`;
  if (key === 'heater_bed') return 'Bett';
  if (key.startsWith('heater_generic ')) return genericHeaterName(key).replace(/^Heizbett/, 'Bett');
  return prettyObjectName(key);
}

/** Takes the newest `count` samples, decimated by `step`, oldest first. */
function sampleTail(values: number[], count: number, step: number): number[] {
  const tail = values.slice(-count);
  if (step <= 1) return tail;
  const out: number[] = [];
  // Walk backwards so the newest sample is always included.
  for (let i = tail.length - 1; i >= 0; i -= step) out.push(tail[i]!);
  return out.reverse();
}

function valueAt(values: number[], indexFromEnd: number): number | null {
  const idx = values.length - 1 - indexFromEnd;
  return idx >= 0 && idx < values.length ? values[idx]! : null;
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
