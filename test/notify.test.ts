import { describe, expect, it } from 'vitest';
import { printerEventFor } from '@/lib/notify';

const printing = { printState: 'printing', filename: 'parts/benchy.gcode', klippy: 'ready' };

describe('printerEventFor', () => {
  it('announces a finished print with its name and duration', () => {
    expect(printerEventFor(printing, { ...printing, printState: 'complete', printDuration: 3725 })).toEqual({
      kind: 'complete',
      title: 'Druck fertig',
      body: 'benchy · 1h 02m',
    });
  });

  it('stays quiet on the first snapshot after connecting', () => {
    expect(printerEventFor(null, { ...printing, printState: 'complete' })).toBeNull();
  });

  it('does not re-announce a state that was already reached', () => {
    const done = { ...printing, printState: 'complete' };
    expect(printerEventFor(done, done)).toBeNull();
    expect(printerEventFor({ ...printing, printState: 'standby' }, done)).toBeNull();
  });

  it('calls out a filament runout pause', () => {
    const event = printerEventFor(printing, {
      ...printing,
      printState: 'paused',
      message: 'Filament Runout Detected',
    });
    expect(event).toMatchObject({ kind: 'paused', title: 'Filament leer – Druck pausiert' });
  });

  it('reports errors and Klipper shutdowns', () => {
    expect(printerEventFor(printing, { ...printing, printState: 'error', message: 'MCU shutdown' })).toMatchObject({
      kind: 'error',
      body: 'MCU shutdown',
    });
    expect(
      printerEventFor(printing, { ...printing, klippy: 'shutdown', klippyMessage: 'Heater extruder not heating at expected rate' }),
    ).toMatchObject({ kind: 'shutdown', body: 'Heater extruder not heating at expected rate' });
  });

  it('ignores a resume', () => {
    expect(printerEventFor({ ...printing, printState: 'paused' }, printing)).toBeNull();
  });
});
