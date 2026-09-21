import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Slider that only emits on release. Dragging would otherwise queue dozens of
 * gcode commands, which Klipper executes one after another.
 */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) setDraft(value);
  }, [value, dragging]);

  const commit = (next: number) => {
    setDragging(false);
    if (next !== value) onCommit(next);
  };

  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="flex items-center gap-2">
          <span className="tabular font-medium">
            {draft}
            {unit}
          </span>
          {defaultValue != null && draft !== defaultValue && (
            <button
              type="button"
              aria-label={`${label} zurücksetzen`}
              onClick={() => {
                setDraft(defaultValue);
                commit(defaultValue);
              }}
              className="text-muted"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          setDragging(true);
          setDraft(Number(e.target.value));
        }}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
