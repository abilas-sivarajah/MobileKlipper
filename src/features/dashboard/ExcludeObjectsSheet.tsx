import { useMemo } from 'react';
import { Ban, CircleDot } from 'lucide-react';
import { Badge, Button, Sheet } from '@/components/ui';
import { getPrintObjects, type PrintObjectView } from '@/lib/derive';
import { excludeObject } from '@/lib/gcode';
import { useCapabilities } from '@/lib/useCapabilities';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';

/**
 * Cancels single objects of a multi-part print – the one that came loose –
 * while the rest keeps printing. Needs [exclude_object] and a slicer that
 * labels objects.
 */
export function ExcludeObjectsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const caps = useCapabilities();
  const objects = useMemo(() => getPrintObjects(status), [status]);
  const remaining = objects.filter((o) => !o.excluded).length;

  const exclude = async (object: PrintObjectView) => {
    if (remaining <= 1) {
      const ok = await confirmAction({
        title: 'Letztes Objekt ausschließen?',
        message: 'Danach bleibt nichts mehr zu drucken – dann lieber den Druck abbrechen.',
        confirmLabel: 'Trotzdem ausschließen',
      });
      if (!ok) return;
    } else {
      const ok = await confirmAction({
        title: `${object.name} ausschließen?`,
        message: 'Das Objekt wird für den Rest des Drucks übersprungen. Das lässt sich nicht rückgängig machen.',
        confirmLabel: 'Ausschließen',
      });
      if (!ok) return;
    }
    await sendGcode(excludeObject(object.name));
  };

  const live = status.motion_report?.live_position ?? status.toolhead?.position;
  const min: [number, number] = [caps.axisMin[0], caps.axisMin[1]];
  const max: [number, number] = [caps.axisMax[0] || 235, caps.axisMax[1] || 235];
  const w = max[0] - min[0] || 1;
  const h = max[1] - min[1] || 1;
  // SVG y grows downwards; the bed's front (Y min) belongs at the bottom.
  const sx = (x: number) => x - min[0];
  const sy = (y: number) => h - (y - min[1]);

  return (
    <Sheet open={open} title="Objekte ausschließen" onClose={onClose}>
      {objects.length === 0 ? (
        <p className="text-sm text-muted">
          Dieser Druck meldet keine Objekte. Dafür braucht es [exclude_object] in der printer.cfg und
          im Slicer „Objekte beschriften" (Label objects).
        </p>
      ) : (
        <div className="space-y-3">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="mx-auto block w-full max-w-[320px] rounded-xl border border-line bg-elevated/60"
            role="img"
            aria-label="Objekte auf dem Druckbett"
          >
            {objects.map((object) => {
              const tone = object.excluded
                ? { fill: 'var(--color-line)', stroke: 'var(--color-muted)' }
                : object.current
                  ? { fill: 'var(--color-accent)', stroke: 'var(--color-accent)' }
                  : { fill: 'var(--color-accent-soft)', stroke: 'var(--color-accent)' };
              const shape =
                object.polygon.length >= 3 ? (
                  <polygon
                    points={object.polygon.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}
                    fill={tone.fill}
                    fillOpacity={object.excluded ? 0.5 : object.current ? 0.55 : 0.8}
                    stroke={tone.stroke}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={object.excluded ? '4 3' : undefined}
                  />
                ) : object.center ? (
                  <circle
                    cx={sx(object.center[0])}
                    cy={sy(object.center[1])}
                    r={Math.min(w, h) * 0.04}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null;
              return (
                <g
                  key={object.name}
                  onClick={() => !object.excluded && void exclude(object)}
                  className={object.excluded ? '' : 'cursor-pointer'}
                >
                  <title>{object.name}</title>
                  {shape}
                </g>
              );
            })}
            {live && (
              <circle
                cx={sx(live[0])}
                cy={sy(live[1])}
                r={Math.min(w, h) * 0.018}
                fill="var(--color-warn)"
                stroke="var(--color-surface)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </svg>
          <p className="flex items-center justify-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-warn" /> Düse
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm bg-accent" /> wird gerade gedruckt
            </span>
          </p>

          <ul className="divide-y divide-line">
            {objects.map((object) => (
              <li key={object.name} className="flex items-center gap-2 py-2">
                {object.current ? (
                  <CircleDot className="size-4 shrink-0 text-accent" aria-label="wird gedruckt" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-xs ${
                    object.excluded ? 'text-muted line-through' : ''
                  }`}
                >
                  {object.name}
                </span>
                {object.excluded ? (
                  <Badge>ausgeschlossen</Badge>
                ) : (
                  <Button size="sm" tone="ghost" onClick={() => void exclude(object)}>
                    <Ban className="size-3.5" /> Ausschließen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
