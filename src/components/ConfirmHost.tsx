import { useEffect, useState } from 'react';
import { useConfirmStore } from '@/store/confirm';
import { Button, TextInput } from './ui';

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(request?.input?.initial ?? '');
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, answer]);

  if (!request) return null;
  const isPrompt = request.input != null;
  const confirm = () => answer(isPrompt ? value : 'ok');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dialog schließen"
        className="absolute inset-0 bg-black/70"
        onClick={() => answer(null)}
      />
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <h2 id="confirm-title" className="text-base font-semibold text-ink">
          {request.title}
        </h2>
        {request.message && <p className="mt-2 text-sm text-muted">{request.message}</p>}
        {request.input && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-muted">{request.input.label}</span>
            <TextInput
              autoFocus
              value={value}
              placeholder={request.input.placeholder}
              onChange={(e) => setValue(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        )}
        <div className="mt-5 flex gap-2">
          <Button block type="button" onClick={() => answer(null)}>
            {request.cancelLabel ?? 'Abbrechen'}
          </Button>
          <Button
            block
            type="submit"
            tone={request.tone ?? 'danger'}
            autoFocus={!isPrompt}
            disabled={isPrompt && !value.trim()}
          >
            {request.confirmLabel ?? 'Bestätigen'}
          </Button>
        </div>
      </form>
    </div>
  );
}
