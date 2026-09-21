export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-elevated'}`}
      >
        <span
          className={`block size-5 rounded-full bg-white shadow-sm transition ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
