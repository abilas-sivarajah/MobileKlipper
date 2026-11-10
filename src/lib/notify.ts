/**
 * Turns printer state changes into notifications.
 *
 * Only transitions count: connecting to a printer that already finished must
 * not announce "print complete" again. The caller passes the previous and the
 * current snapshot; the first snapshot after a (re)connect has no previous.
 */
import { basename, formatDuration, stripGcodeExtension } from './format';

export interface PrinterSnapshot {
  printState?: string;
  filename?: string;
  message?: string;
  printDuration?: number;
  klippy?: string;
  klippyMessage?: string;
}

export interface PrinterEvent {
  kind: 'complete' | 'error' | 'paused' | 'cancelled' | 'shutdown';
  title: string;
  body: string;
}

const ACTIVE = new Set(['printing', 'paused']);

export function printerEventFor(prev: PrinterSnapshot | null, next: PrinterSnapshot): PrinterEvent | null {
  if (!prev) return null;
  const name = next.filename ? stripGcodeExtension(basename(next.filename)) : 'Druck';

  if (prev.klippy === 'ready' && (next.klippy === 'shutdown' || next.klippy === 'error')) {
    return { kind: 'shutdown', title: 'Klipper gestoppt', body: next.klippyMessage || 'Firmware-Restart nötig' };
  }

  if (prev.printState === next.printState) return null;
  const wasActive = ACTIVE.has(prev.printState ?? '');

  switch (next.printState) {
    case 'complete':
      return wasActive
        ? {
            kind: 'complete',
            title: 'Druck fertig',
            body: `${name}${next.printDuration ? ` · ${formatDuration(next.printDuration, true)}` : ''}`,
          }
        : null;
    case 'error':
      return wasActive ? { kind: 'error', title: 'Druckfehler', body: next.message || name } : null;
    case 'cancelled':
      return wasActive ? { kind: 'cancelled', title: 'Druck abgebrochen', body: name } : null;
    case 'paused': {
      if (prev.printState !== 'printing') return null;
      const runout = /filament|runout/i.test(next.message ?? '');
      return {
        kind: 'paused',
        title: runout ? 'Filament leer – Druck pausiert' : 'Druck pausiert',
        body: next.message || name,
      };
    }
    default:
      return null;
  }
}
