import { useMemo } from 'react';
import { usePrinterStore } from '@/store/printer';
import { getCapabilities, type Capabilities } from './caps';

/**
 * Capabilities of the connected printer. Recomputed only when the config or
 * the axis limits change, not on every position update.
 */
export function useCapabilities(): Capabilities {
  const configfile = usePrinterStore((s) => s.status.configfile);
  const axisMin = usePrinterStore((s) => s.status.toolhead?.axis_minimum);
  const axisMax = usePrinterStore((s) => s.status.toolhead?.axis_maximum);
  return useMemo(
    () =>
      getCapabilities({
        configfile,
        toolhead: {
          ...(axisMin ? { axis_minimum: axisMin } : {}),
          ...(axisMax ? { axis_maximum: axisMax } : {}),
        },
      }),
    [configfile, axisMin, axisMax],
  );
}
