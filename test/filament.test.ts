import { describe, expect, it } from 'vitest';
import { filamentMacro, planFilamentChange, readyToExtrude, TIP_FORMING_MM } from '@/lib/filament';
import { profileDefaults } from '@/lib/profiles';

const bowden = profileDefaults('ender3v2').filament; // 400 mm unload
const direct = profileDefaults('neptune4').filament;

function totalE(steps: Array<{ script: string }>): number {
  return steps.reduce((sum, s) => sum + Number(/E(-?[\d.]+)/.exec(s.script)![1]), 0);
}

describe('planFilamentChange', () => {
  it('unloads a Bowden printer in chunks Klipper accepts', () => {
    const steps = planFilamentChange('unload', bowden, 50);
    expect(steps[0]).toMatchObject({ label: 'Spitze formen' });
    const pull = steps.filter((s) => s.label === 'Herausziehen');
    expect(pull).toHaveLength(8);
    expect(pull.every((s) => s.length <= 50)).toBe(true);
    expect(totalE(steps)).toBeCloseTo(TIP_FORMING_MM - bowden.unloadLength, 6);
  });

  it('uses fewer, longer moves when max_extrude_only_distance allows it', () => {
    expect(planFilamentChange('unload', bowden, 100).filter((s) => s.label === 'Herausziehen')).toHaveLength(4);
  });

  it('loads fast first and purges slowly after', () => {
    const steps = planFilamentChange('load', direct, 50);
    expect(steps.map((s) => s.label)).toEqual(['Einführen', 'Spülen']);
    expect(steps[0]!.script).toContain(`F${direct.loadSpeed * 60}`);
    expect(steps[1]!.script).toContain(`F${direct.purgeSpeed * 60}`);
  });

  it('puts every step into relative extrusion mode', () => {
    for (const step of planFilamentChange('load', bowden, 50)) {
      expect(step.script.startsWith('M83\nG1 E')).toBe(true);
    }
  });

  it('skips phases with zero length', () => {
    const steps = planFilamentChange('load', { ...direct, loadLength: 0 }, 50);
    expect(steps.map((s) => s.label)).toEqual(['Spülen']);
  });
});

describe('filamentMacro', () => {
  it('prefers the printer’s own macros', () => {
    expect(filamentMacro('load', new Set(['LOAD_FILAMENT', 'M701']))).toBe('LOAD_FILAMENT');
    expect(filamentMacro('unload', new Set(['M702']))).toBe('M702');
    expect(filamentMacro('unload', new Set(['PRINT_START']))).toBeNull();
  });
});

describe('readyToExtrude', () => {
  it('waits for both the target and Klipper’s minimum', () => {
    expect(readyToExtrude(150, 160, 170)).toBe(false);
    expect(readyToExtrude(205, 210, 170)).toBe(false);
    expect(readyToExtrude(207.5, 210, 170)).toBe(true);
    expect(readyToExtrude(220, 0, 170)).toBe(false);
  });
});
