import { Switch } from './ui';

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} {...(disabled ? { disabled } : {})} />
    </div>
  );
}
