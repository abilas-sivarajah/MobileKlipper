/** Small presentational primitives shared by every screen. */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'accent' | 'ok' | 'warn' | 'danger' | 'ghost';

const toneClasses: Record<Tone, string> = {
  default: 'bg-elevated text-ink border-line active:bg-line',
  accent: 'bg-accent text-[#04121c] border-accent font-semibold active:brightness-95',
  ok: 'bg-ok text-[#04211a] border-ok font-semibold active:brightness-95',
  warn: 'bg-warn text-[#241a02] border-warn font-semibold active:brightness-95',
  danger: 'bg-danger text-[#2a0a0a] border-danger font-semibold active:brightness-95',
  ghost: 'bg-transparent text-muted border-transparent active:bg-elevated',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}

export function Button({
  tone = 'default',
  size = 'md',
  block = false,
  className = '',
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2.5 text-sm',
    lg: 'px-4 py-3 text-base',
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border transition
        disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses[tone]} ${sizes[size]}
        ${block ? 'w-full' : ''} ${className}`}
    />
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-line bg-surface ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Badge({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent';
  children: ReactNode;
}) {
  const map = {
    default: 'bg-elevated text-muted',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent/15 text-accent',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = 'accent',
  className = '',
}: {
  value: number;
  tone?: 'accent' | 'ok' | 'warn';
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-accent';
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-elevated ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-ink
        placeholder:text-muted/60 focus:border-accent focus:outline-none ${className}`}
    />
  );
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  formatLabel,
  className = '',
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatLabel?: (value: T) => string;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 rounded-xl bg-elevated p-1 ${className}`} role="group">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition tabular
              ${active ? 'bg-accent text-[#04121c]' : 'text-muted active:bg-line'}`}
          >
            {formatLabel ? formatLabel(option) : String(option)}
          </button>
        );
      })}
    </div>
  );
}

export function Row({
  label,
  value,
  mono = false,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`text-right text-ink ${mono ? 'font-mono text-xs' : ''} tabular`}>{value}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <div>
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent ${className}`}
      role="status"
      aria-label="Lädt"
    />
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl sm:pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button tone="ghost" size="sm" onClick={onClose}>
            Fertig
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
