import { useConfirmStore } from '@/store/confirm';
import { Button } from './ui';

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dialog schließen"
        className="absolute inset-0 bg-black/70"
        onClick={() => answer(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-5"
      >
        <h2 className="text-base font-semibold text-ink">{request.title}</h2>
        {request.message && <p className="mt-2 text-sm text-muted">{request.message}</p>}
        <div className="mt-5 flex gap-2">
          <Button block onClick={() => answer(false)}>
            {request.cancelLabel ?? 'Abbrechen'}
          </Button>
          <Button block tone={request.tone ?? 'danger'} onClick={() => answer(true)} autoFocus>
            {request.confirmLabel ?? 'Bestätigen'}
          </Button>
        </div>
      </div>
    </div>
  );
}
