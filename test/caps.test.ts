import { describe, expect, it } from 'vitest';
import { getCapabilities, getScrews, parsePoint, zOffsetApplyCommand } from '@/lib/caps';
import type { PrinterStatus } from '@/moonraker/types';

function withSettings(settings: Record<string, Record<string, unknown>>): PrinterStatus {
  return { configfile: { settings } };
}

/** Stock-ish Ender 3 V2: Z endstop switch, manual bed screws, no probe. */
const ender3v2 = withSettings({
  printer: { kinematics: 'cartesian' },
  stepper_z: { endstop_pin: '^PA7', position_endstop: 0 },
  extruder: { max_extrude_only_distance: 100, min_extrude_temp: 170 },
  bed_screws: {
    screw1: [30.5, 37],
    screw1_name: 'vorne links',
    screw2: [200.5, 37],
    screw3: [200.5, 207],
    screw4: [30.5, 207],
  },
  'gcode_macro load_filament': {},
});

/** Neptune 4 style: probe as Z endstop, mesh, segmented bed, exclude_object. */
const neptune4 = withSettings({
  printer: { kinematics: 'cartesian' },
  stepper_z: { endstop_pin: 'probe:z_virtual_endstop' },
  probe: { z_offset: 1.2 },
  bed_mesh: { probe_count: [11, 11] },
  exclude_object: {},
  'heater_generic heater_bed_outer': { max_temp: 120 },
  screws_tilt_adjust: { screw1: '30, 40', screw1_name: 'front left', screw2: '200, 40' },
});

describe('getCapabilities', () => {
  it('recognises an Ender 3 V2 without probe', () => {
    const caps = getCapabilities(ender3v2);
    expect(caps.probe).toBeNull();
    expect(caps.zEndstopIsProbe).toBe(false);
    expect(caps.bedScrews).toBe(true);
    expect(caps.bedMesh).toBe(false);
    expect(caps.maxExtrudeOnlyDistance).toBe(100);
    expect(caps.macros.has('LOAD_FILAMENT')).toBe(true);
    expect(zOffsetApplyCommand(caps)).toBe('Z_OFFSET_APPLY_ENDSTOP');
  });

  it('recognises a probe used as virtual Z endstop', () => {
    const caps = getCapabilities(neptune4);
    expect(caps.probe).toBe('probe');
    expect(caps.zEndstopIsProbe).toBe(true);
    expect(caps.bedMesh).toBe(true);
    expect(caps.excludeObject).toBe(true);
    expect(caps.screwsTilt).toBe(true);
    expect(zOffsetApplyCommand(caps)).toBe('Z_OFFSET_APPLY_PROBE');
  });

  it('keeps a probe-for-mesh-only setup on the endstop command', () => {
    // CR Touch for the mesh, but Z still homes on the physical switch.
    const caps = getCapabilities(
      withSettings({ bltouch: {}, stepper_z: { endstop_pin: '^PA7' }, bed_mesh: {} }),
    );
    expect(caps.probe).toBe('bltouch');
    expect(zOffsetApplyCommand(caps)).toBe('Z_OFFSET_APPLY_ENDSTOP');
  });

  it('falls back to Klipper defaults when the config is not loaded', () => {
    const caps = getCapabilities({});
    expect(caps.maxExtrudeOnlyDistance).toBe(50);
    expect(caps.minExtrudeTemp).toBe(170);
    expect(caps.probe).toBeNull();
  });

  it('needs both a resonance tester and an accelerometer for input shaping', () => {
    expect(getCapabilities(withSettings({ resonance_tester: {} })).resonance).toBe(false);
    expect(getCapabilities(withSettings({ resonance_tester: {}, adxl345: {} })).resonance).toBe(true);
    expect(getCapabilities(withSettings({ resonance_tester: {}, 'lis2dw toolboard': {} })).resonance).toBe(true);
  });

  it('reads raw config when parsed settings are missing', () => {
    const caps = getCapabilities({ configfile: { config: { 'Bed_Mesh': {}, extruder: { max_extrude_only_distance: '150' } } } });
    expect(caps.bedMesh).toBe(true);
    expect(caps.maxExtrudeOnlyDistance).toBe(150);
  });
});

describe('getScrews', () => {
  it('reads positions and names from list or string values', () => {
    expect(getScrews(ender3v2, 'bed_screws')).toEqual([
      { key: 'screw1', name: 'vorne links', x: 30.5, y: 37 },
      { key: 'screw2', name: 'Schraube 2', x: 200.5, y: 37 },
      { key: 'screw3', name: 'Schraube 3', x: 200.5, y: 207 },
      { key: 'screw4', name: 'Schraube 4', x: 30.5, y: 207 },
    ]);
    expect(getScrews(neptune4, 'screws_tilt_adjust').map((s) => [s.name, s.x, s.y])).toEqual([
      ['front left', 30, 40],
      ['Schraube 2', 200, 40],
    ]);
  });

  it('returns nothing when the section is absent', () => {
    expect(getScrews(neptune4, 'bed_screws')).toEqual([]);
  });

  it('parses points defensively', () => {
    expect(parsePoint(' 10.5 , 20 ')).toEqual([10.5, 20]);
    expect(parsePoint('10')).toBeNull();
    expect(parsePoint(['a', 2])).toBeNull();
  });
});
