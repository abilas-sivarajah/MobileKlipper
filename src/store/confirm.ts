/** Promise-based confirmation dialogs for destructive printer commands. */
import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'accent' | 'warn';
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  ask: (request: ConfirmRequest) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  ask: (request) =>
    new Promise<boolean>((resolve) => {
      const pending = get().request;
      // A second prompt replaces the first; the stale one resolves as cancelled.
      pending?.resolve(false);
      set({ request: { ...request, resolve } });
    }),
  answer: (ok) => {
    const pending = get().request;
    set({ request: null });
    pending?.resolve(ok);
  },
}));

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().ask(request);
}
