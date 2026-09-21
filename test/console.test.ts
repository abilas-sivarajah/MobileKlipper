import { describe, expect, it } from 'vitest';
import { completionsFor, isTemperatureReply } from '@/lib/console';

describe('isTemperatureReply', () => {
  it('matches the periodic M105 style replies', () => {
    expect(isTemperatureReply('ok B:60.0 /60.0 T0:210.0 /210.0')).toBe(true);
    expect(isTemperatureReply('B:23.1 /0.0 T0:23.5 /0.0')).toBe(true);
    expect(isTemperatureReply('T:210.0 /210.0')).toBe(true);
  });

  it('leaves real output alone', () => {
    expect(isTemperatureReply('// Heating bed to 100C')).toBe(false);
    expect(isTemperatureReply('!! Must home axis first')).toBe(false);
    expect(isTemperatureReply('Klipper state: Ready')).toBe(false);
    expect(isTemperatureReply('ok')).toBe(false);
  });
});

describe('completionsFor', () => {
  const macros = ['START_PRINT', 'END_PRINT', 'LOAD_FILAMENT'];

  it('offers prefix matches before substring matches', () => {
    const result = completionsFor('PRINT', macros);
    expect(result[0]).toBe('START_PRINT');
    expect(result).toContain('END_PRINT');
  });

  it('is case insensitive', () => {
    expect(completionsFor('start', macros)[0]).toBe('START_PRINT');
  });

  it('includes built-in klipper commands', () => {
    expect(completionsFor('BED_MESH', macros)).toContain('BED_MESH_CALIBRATE');
  });

  it('suggests nothing for an empty input', () => {
    expect(completionsFor('   ', macros)).toEqual([]);
  });

  it('does not suggest what is already typed in full', () => {
    expect(completionsFor('START_PRINT', macros)).not.toContain('START_PRINT');
  });

  it('respects the limit', () => {
    expect(completionsFor('S', macros, 3)).toHaveLength(3);
  });
});
