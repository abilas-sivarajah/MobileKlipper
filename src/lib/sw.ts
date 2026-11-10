/**
 * Bridge to the service worker registered in main.tsx.
 *
 * The worker caches the app shell, so new files on the server only take effect
 * once a new worker has installed and taken over. After Moonraker replaced the
 * files, this asks for that new worker and reloads into it.
 */
type UpdateFn = (reloadPage?: boolean) => Promise<void>;

let applyUpdate: UpdateFn | null = null;

export function setServiceWorkerUpdater(fn: UpdateFn): void {
  applyUpdate = fn;
}

function waitForInstalled(worker: ServiceWorker, timeoutMs: number): Promise<boolean> {
  if (worker.state === 'installed' || worker.state === 'activated') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        clearTimeout(timer);
        resolve(true);
      } else if (worker.state === 'redundant') {
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

/** Loads the newest version of the app, through the service worker when there is one. */
export async function reloadToLatest(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.update().catch(() => undefined);
      const fresh = registration.installing ?? registration.waiting;
      if (fresh && applyUpdate && (await waitForInstalled(fresh, 15_000))) {
        // Tells the waiting worker to take over; the page reloads once it does.
        await applyUpdate(true);
        return;
      }
    }
  } catch {
    /* fall through to a plain reload */
  }
  window.location.reload();
}
