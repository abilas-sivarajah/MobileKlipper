import type { ReactNode } from 'react';

export interface BedMarker {
  key: string;
  x: number;
  y: number;
  /** Rendered inside the marker bubble. */
  content: ReactNode;
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'muted';
  label?: string;
}

const toneClass: Record<NonNullable<BedMarker['tone']>, string> = {
  default: 'border-line bg-elevated text-ink',
  accent: 'border-accent bg-accent/15 text-accent ring-2 ring-accent/40',
  ok: 'border-ok/50 bg-ok/10 text-ok-ink',
  warn: 'border-warn/50 bg-warn/10 text-warn-ink',
  muted: 'border-line bg-surface text-muted',
};

/**
 * Top-down view of the bed with markers at real coordinates. Front of the bed
 * (Y min) is at the bottom, as you stand in front of the printer.
 */
export function BedDiagram({
  min,
  max,
  markers,
  children,
}: {
  min: [number, number];
  max: [number, number];
  markers: BedMarker[];
  children?: ReactNode;
}) {
  const spanX = max[0] - min[0] || 1;
  const spanY = max[1] - min[1] || 1;
  const aspect = Math.min(1.6, Math.max(0.6, spanX / spanY));
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="mb-1 text-center text-[10px] uppercase tracking-wide text-muted">hinten</div>
      <div
        className="relative w-full rounded-xl border border-line bg-elevated/60"
        style={{ aspectRatio: String(aspect) }}
      >
        {children}
        {markers.map((m) => {
          const left = ((m.x - min[0]) / spanX) * 100;
          const bottom = ((m.y - min[1]) / spanY) * 100;
          return (
            <div
              key={m.key}
              className="absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
              style={{
                left: `${Math.min(92, Math.max(8, left))}%`,
                bottom: `${Math.min(90, Math.max(10, bottom))}%`,
              }}
            >
              <div
                className={`flex min-w-11 flex-col items-center rounded-xl border px-2 py-1 text-center text-[11px] leading-tight ${
                  toneClass[m.tone ?? 'default']
                }`}
              >
                {m.content}
              </div>
              {m.label && (
                <span className="mt-0.5 max-w-24 truncate text-[10px] text-muted">{m.label}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted">vorne</div>
    </div>
  );
}
