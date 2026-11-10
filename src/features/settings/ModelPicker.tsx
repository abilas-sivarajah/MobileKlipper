import { Check } from 'lucide-react';
import { PROFILES, type PrinterModel } from '@/lib/profiles';

export function ModelPicker({
  value,
  onChange,
}: {
  value: PrinterModel;
  onChange: (model: PrinterModel) => void;
}) {
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="Druckermodell">
      {PROFILES.map((profile) => {
        const selected = profile.model === value;
        return (
          <button
            key={profile.model}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(profile.model)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
              selected ? 'border-accent bg-accent/10' : 'border-line bg-bg active:bg-elevated'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.label}</p>
              <p className="truncate text-[11px] text-muted">{profile.summary}</p>
            </div>
            {selected && <Check className="size-4 shrink-0 text-accent" />}
          </button>
        );
      })}
    </div>
  );
}
