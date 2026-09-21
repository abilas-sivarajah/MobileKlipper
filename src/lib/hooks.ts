import { useEffect, useRef, useState } from 'react';

/** Re-renders on an interval; used for clocks and elapsed-time readouts. */
export function useTicker(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

/**
 * Holds a screen wake lock while `active`. Only supported on Chromium-based
 * browsers; elsewhere this is a no-op.
 */
export function useWakeLock(active: boolean): void {
  const sentinel = useRef<{ release: () => Promise<void>; released: boolean } | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; released: boolean }> };
    };
    if (!active || !nav.wakeLock) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel.current = lock;
      } catch {
        /* denied or unsupported */
      }
    };

    void acquire();
    // A backgrounded tab loses the lock; re-acquire when it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && sentinel.current?.released !== false) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    };
  }, [active]);
}

/** Debounces a rapidly changing value (slider drags, search fields). */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
