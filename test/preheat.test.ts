import { describe, expect, it } from 'vitest';
import type { HeaterView } from '@/lib/derive';
import { metadataTemps, preheatScript, preheatTargets } from '@/lib/preheat';
import { PROFILES, profileDefaults } from '@/lib/profiles';

function heater(key: string, kind: HeaterView['kind'], maxTemp = 300): HeaterView {
  return { key, name: key, kind, temperature: 20, target: 0, power: 0, minTemp: 0, maxTemp };
}

/** Neptune 4 Pro: extruder, inner bed and the outer ring as heater_generic. */
const neptune4Pro = [
  heater('extruder', 'extruder'),
  heater('heater_bed', 'bed', 120),
  heater('heater_generic heater_bed_outer', 'generic', 120),
];

describe('preheatTargets', () => {
  it('heats a segmented bed with the bed temperature on both zones', () => {
    const targets = preheatTargets(neptune4Pro, { extruder: 210, bed: 60 });
    expect(targets.map((t) => [t.key, t.target, t.optional])).toEqual([
      ['extruder', 210, false],
      ['heater_bed', 60, false],
      ['heater_generic heater_bed_outer', 60, true],
    ]);
  });

  it('leaves a chamber alone unless the preset names a chamber temperature', () => {
    const heaters = [heater('extruder', 'extruder'), heater('heater_generic chamber', 'generic', 70)];
    expect(preheatTargets(heaters, { extruder: 250, bed: 100 }).map((t) => t.key)).toEqual(['extruder']);
    expect(preheatTargets(heaters, { extruder: 250, bed: 100, chamber: 50 }).at(-1)).toMatchObject({
      key: 'heater_generic chamber',
      target: 50,
    });
  });

  it('never heats unknown generic heaters to a guess', () => {
    const heaters = [heater('heater_generic dryer', 'generic', 80)];
    expect(preheatTargets(heaters, { extruder: 210, bed: 60, chamber: 40 })).toEqual([]);
  });

  it('clamps to the configured max_temp', () => {
    const [target] = preheatTargets([heater('extruder', 'extruder', 245)], { extruder: 260 });
    expect(target?.target).toBe(245);
  });

  it('emits one SET_HEATER_TEMPERATURE per heater with Klipper heater names', () => {
    const script = preheatScript(preheatTargets(neptune4Pro, { extruder: 210, bed: 60 }));
    expect(script).toBe(
      [
        'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210',
        'SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=60',
        'SET_HEATER_TEMPERATURE HEATER=heater_bed_outer TARGET=60',
      ].join('\n'),
    );
  });
});

describe('metadataTemps', () => {
  it('reads the first-layer temperatures the slicer wrote', () => {
    expect(metadataTemps({ first_layer_extr_temp: 215, first_layer_bed_temp: 65 })).toEqual({
      extruder: 215,
      bed: 65,
      chamber: null,
    });
  });

  it('returns null when the file carries no temperatures', () => {
    expect(metadataTemps({ estimated_time: 100 })).toBeNull();
    expect(metadataTemps(null)).toBeNull();
  });
});

describe('profiles', () => {
  it('gives the Ender 3 V2 a Bowden-length filament path', () => {
    const ender = profileDefaults('ender3v2');
    const neptune = profileDefaults('neptune4');
    expect(ender.filament.unloadLength).toBeGreaterThan(300);
    expect(neptune.filament.unloadLength).toBeLessThan(150);
  });

  it('hands out copies, so editing one printer cannot leak into another', () => {
    const a = profileDefaults('ender3v2');
    a.tempPresets[0]!.extruder = 999;
    a.filament.unloadLength = 1;
    const b = profileDefaults('ender3v2');
    expect(b.tempPresets[0]!.extruder).not.toBe(999);
    expect(b.filament.unloadLength).not.toBe(1);
  });

  it('defines every profile completely', () => {
    for (const profile of PROFILES) {
      const d = profile.defaults;
      expect(d.moveSteps.length).toBeGreaterThan(0);
      expect(d.tempPresets.every((p) => p.extruder > 0 && p.bed >= 0)).toBe(true);
      expect(d.filament.purgeSpeed).toBeGreaterThan(0);
    }
  });
});
