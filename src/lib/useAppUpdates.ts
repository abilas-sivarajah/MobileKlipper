import { useEffect } from 'react';
import { useAppUpdateStore } from '@/store/appUpdate';

const HOURLY = 60 * 60 * 1000;

/**
 * Background update checks: on start, whenever the app comes back to the
 * foreground, and hourly while it stays open. The store throttles them to
 * one request per 15 minutes. Development builds only check on demand.
 */
export function useAppUpdateChecks(): void {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = () => void useAppUpdateStore.getState().checkOnOpen();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const first = setTimeout(check, 3000);
    const timer = setInterval(check, HOURLY);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
