import { useCallback, useEffect, useState } from 'react';
import type { DirectoryInfo } from '@/moonraker/types';
import { usePrinterStore } from '@/store/printer';

export interface DirectoryState {
  data: DirectoryInfo | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads a gcode directory and refreshes when Moonraker reports a change. */
export function useDirectory(path: string): DirectoryState {
  const client = usePrinterStore((s) => s.client);
  const connection = usePrinterStore((s) => s.connection);
  const version = usePrinterStore((s) => s.fileListVersion);
  const [data, setData] = useState<DirectoryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(0);

  const reload = useCallback(() => setManual((n) => n + 1), []);

  useEffect(() => {
    if (!client || connection !== 'open') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .getDirectory(path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, connection, path, version, manual]);

  return { data, loading, error, reload };
}
