/** Promise-based confirmation and text-input dialogs. */
import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'accent' | 'warn';
  /** Turns the dialog into a prompt with one text field. */
  input?: { label: string; initial?: string; placeholder?: string };
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve: (value: string | null) => void }) | null;
  ask: (request: ConfirmRequest) => Promise<string | null>;
  answer: (value: string | null) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  ask: (request) =>
    new Promise<string | null>((resolve) => {
      const pending = get().request;
      // A second prompt replaces the first; the stale one resolves as cancelled.
      pending?.resolve(null);
      set({ request: { ...request, resolve } });
    }),
  answer: (value) => {
    const pending = get().request;
    set({ request: null });
    pending?.resolve(value);
  },
}));

export async function confirmAction(request: Omit<ConfirmRequest, 'input'>): Promise<boolean> {
  return (await useConfirmStore.getState().ask(request)) != null;
}

/** Resolves with the trimmed text, or null when cancelled or left empty. */
export async function promptText(
  request: ConfirmRequest & { input: NonNullable<ConfirmRequest['input']> },
): Promise<string | null> {
  const value = await useConfirmStore.getState().ask(request);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
