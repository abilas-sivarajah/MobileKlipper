import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/store/toast';

const icons: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: CircleAlert,
};

const tones: Record<ToastKind, string> = {
  info: 'border-line text-ink',
  success: 'border-ok/40 text-ok',
  warning: 'border-warn/40 text-warn',
  error: 'border-danger/40 text-danger',
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = icons[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border bg-elevated px-3 py-2.5 text-sm shadow-lg ${tones[t.kind]}`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1 break-words text-ink">{t.message}</span>
            <button type="button" aria-label="Schließen" onClick={() => dismiss(t.id)}>
              <X className="size-4 text-muted" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
