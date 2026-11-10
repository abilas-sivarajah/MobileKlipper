import { useCallback } from 'react';
import { isPrinting } from '@/lib/derive';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';
import { toast } from '@/store/toast';

/** SAVE_CONFIG with a confirmation and a guard against killing a print. */
export function useSaveConfig(): () => Promise<void> {
  return useCallback(async () => {
    const { status, sendGcode } = usePrinterStore.getState();
    if (isPrinting(status)) {
      toast.warning('Während eines Drucks nicht möglich – SAVE_CONFIG startet Klipper neu');
      return;
    }
    const sections = Object.keys(status.configfile?.save_config_pending_items ?? {});
    const ok = await confirmAction({
      title: 'Konfiguration speichern?',
      message: `${sections.length ? `Schreibt ${sections.map((s) => `[${s}]`).join(', ')} in die printer.cfg. ` : ''}Klipper startet danach neu.`,
      confirmLabel: 'Speichern',
      tone: 'accent',
    });
    if (ok) await sendGcode('SAVE_CONFIG');
  }, []);
}
