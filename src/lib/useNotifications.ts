import { useEffect } from 'react';
import { usePrinterStore } from '@/store/printer';
import { usePrintersStore } from '@/store/printers';
import { useUiStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { printerEventFor, type PrinterEvent, type PrinterSnapshot } from './notify';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

async function show(event: PrinterEvent, printerName: string): Promise<void> {
  const title = `${printerName}: ${event.title}`;
  const options: NotificationOptions = {
    body: event.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `mobileklipper-${event.kind}`,
  };
  try {
    // Through the service worker where possible: Android only shows
    // notifications from a page that way.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    /* blocked or unsupported */
  }
}

/**
 * Announces print completion, errors, pauses and Klipper shutdowns while the
 * app is open: as a toast when visible, as a system notification otherwise.
 * Nothing reaches the phone once the app has been closed; that needs a
 * companion service on the printer (see README).
 */
export function usePrinterNotifications(): void {
  const enabled = useUiStore((s) => s.notifications);

  useEffect(() => {
    let prev: PrinterSnapshot | null = null;
    let printerId: string | null = null;

    const snapshot = (): PrinterSnapshot => {
      const { status, klippy, klippyMessage } = usePrinterStore.getState();
      return {
        printState: status.print_stats?.state,
        filename: status.print_stats?.filename,
        message: status.print_stats?.message,
        printDuration: status.print_stats?.print_duration,
        klippy,
        klippyMessage: klippyMessage ?? status.webhooks?.state_message,
      };
    };

    return usePrinterStore.subscribe((state) => {
      if (state.printerId !== printerId || state.connection !== 'open') {
        // A new printer or a reconnect starts a fresh baseline.
        printerId = state.printerId;
        prev = null;
        if (state.connection !== 'open') return;
      }
      const next = snapshot();
      // Wait for the first real status before taking a baseline.
      if (!next.printState && next.klippy === 'ready') return;
      const event = printerEventFor(prev, next);
      prev = next;
      if (!event) return;

      const printer = usePrintersStore.getState().printers.find((p) => p.id === state.printerId);
      const name = printer?.name ?? 'Drucker';
      const visible = document.visibilityState === 'visible';
      const tone = event.kind === 'complete' ? 'success' : event.kind === 'paused' ? 'warning' : 'error';
      // On screen, cancels and shutdowns are already obvious (the user did it,
      // or the red banner says so); finished, failed and paused prints are not.
      const toastWorthy = event.kind === 'complete' || event.kind === 'error' || event.kind === 'paused';
      if (toastWorthy && (visible || !enabled)) toast[tone](`${event.title}: ${event.body}`);
      if (enabled && !visible && notificationsSupported() && Notification.permission === 'granted') {
        void show(event, name);
        navigator.vibrate?.([200, 100, 200]);
      }
    });
  }, [enabled]);
}
