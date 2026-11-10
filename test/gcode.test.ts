import { describe, expect, it } from 'vitest';
import {
  adjustZOffset,
  bedMeshProfile,
  excludeObject,
  extrude,
  extrudeMoves,
  heaterName,
  home,
  persistZOffset,
  pidCalibrate,
  setPressureAdvance,
  setRetraction,
  testZ,
  jog,
  setExtrudeFactor,
  setFanSpeed,
  setHeaterTarget,
  setOutputPin,
  setSpeedFactor,
  setVelocityLimit,
} from '@/lib/gcode';

describe('movement', () => {
  it('wraps a jog in relative mode and restores absolute positioning', () => {
    expect(jog('X', 10, 100)).toBe('G91\nG1 X10 F6000\nG90');
    expect(jog('Z', -0.05, 25)).toBe('G91\nG1 Z-0.05 F1500\nG90');
  });

  it('homes all axes or just the named ones', () => {
    expect(home()).toBe('G28');
    expect(home(['X', 'Y'])).toBe('G28 X Y');
    expect(home([])).toBe('G28');
  });
});

describe('extrusion', () => {
  it('switches to relative extrusion first', () => {
    expect(extrude(10, 5)).toBe('M83\nG1 E10 F300');
  });

  it('retracts with a negative length', () => {
    expect(extrude(-25, 5)).toBe('M83\nG1 E-25 F300');
  });

  it('splits long moves at max_extrude_only_distance', () => {
    // A Bowden unload on an Ender 3 V2 is ~400 mm; Klipper refuses that as one
    // move with "Extrude only move too long".
    expect(extrude(-120, 30, 50)).toBe('M83\nG1 E-40 F1800\nG1 E-40 F1800\nG1 E-40 F1800');
    expect(extrudeMoves(100, 5, 50)).toEqual(['G1 E50 F300', 'G1 E50 F300']);
  });

  it('never lets a chunk exceed the limit, even with awkward lengths', () => {
    const moves = extrudeMoves(101, 5, 33.3);
    const lengths = moves.map((m) => Number(/E(-?[\d.]+)/.exec(m)![1]));
    expect(lengths.every((l) => l <= 33.3)).toBe(true);
    expect(lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(101, 6);
  });

  it('emits nothing for a zero length', () => {
    expect(extrudeMoves(0, 5, 50)).toEqual([]);
  });
});

describe('heaters and factors', () => {
  it('addresses generic heaters by the last word of their section', () => {
    // Klipper resolves HEATER= against "chamber", not "heater_generic chamber";
    // the space would also split the parameter. Neptune 4 Pro outer bed zone.
    expect(setHeaterTarget('heater_generic chamber', 50.4)).toBe(
      'SET_HEATER_TEMPERATURE HEATER=chamber TARGET=50',
    );
    expect(setHeaterTarget('heater_generic heater_bed_outer', 60)).toBe(
      'SET_HEATER_TEMPERATURE HEATER=heater_bed_outer TARGET=60',
    );
    expect(setHeaterTarget('extruder', 210)).toBe('SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210');
    expect(setHeaterTarget('heater_bed', -5)).toBe('SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=0');
  });

  it('derives heater names from object keys', () => {
    expect(heaterName('extruder1')).toBe('extruder1');
    expect(heaterName('heater_generic chamber')).toBe('chamber');
  });

  it('builds PID calibration for any heater', () => {
    expect(pidCalibrate('heater_bed', 60)).toBe('PID_CALIBRATE HEATER=heater_bed TARGET=60');
    expect(pidCalibrate('heater_generic heater_bed_outer', 60.4)).toBe(
      'PID_CALIBRATE HEATER=heater_bed_outer TARGET=60',
    );
  });

  it('sets speed and flow as percentages', () => {
    expect(setSpeedFactor(150)).toBe('M220 S150');
    expect(setExtrudeFactor(97.6)).toBe('M221 S98');
  });

  it('only includes the limits it was given', () => {
    expect(setVelocityLimit({ accel: 3000 })).toBe('SET_VELOCITY_LIMIT ACCEL=3000');
    expect(setVelocityLimit({ velocity: 200, accel: 3000 })).toBe(
      'SET_VELOCITY_LIMIT VELOCITY=200 ACCEL=3000',
    );
  });
});

describe('z offset', () => {
  it('applies the move immediately only while printing', () => {
    expect(adjustZOffset(0.01, true)).toBe('SET_GCODE_OFFSET Z_ADJUST=0.01 MOVE=1');
    expect(adjustZOffset(-0.01, false)).toBe('SET_GCODE_OFFSET Z_ADJUST=-0.01');
  });

  it('never sends SAVE_CONFIG during a print', () => {
    expect(persistZOffset('Z_OFFSET_APPLY_PROBE', true)).toBe('Z_OFFSET_APPLY_PROBE');
    expect(persistZOffset('Z_OFFSET_APPLY_ENDSTOP', false)).toBe('Z_OFFSET_APPLY_ENDSTOP\nSAVE_CONFIG');
  });

  it('formats TESTZ steps and bisection', () => {
    expect(testZ(-0.05)).toBe('TESTZ Z=-0.05');
    expect(testZ('+')).toBe('TESTZ Z=+');
  });
});

describe('tuning and objects', () => {
  it('sets pressure advance with a floor of zero', () => {
    expect(setPressureAdvance(0.0425)).toBe('SET_PRESSURE_ADVANCE EXTRUDER=extruder ADVANCE=0.0425');
    expect(setPressureAdvance(-1)).toBe('SET_PRESSURE_ADVANCE EXTRUDER=extruder ADVANCE=0');
  });

  it('only includes the retraction parameters given', () => {
    expect(setRetraction({ length: 0.8 })).toBe('SET_RETRACTION RETRACT_LENGTH=0.8');
    expect(setRetraction({ length: 5, speed: 40.2 })).toBe(
      'SET_RETRACTION RETRACT_LENGTH=5 RETRACT_SPEED=40',
    );
  });

  it('excludes objects and manages mesh profiles', () => {
    expect(excludeObject('PART_2')).toBe('EXCLUDE_OBJECT NAME=PART_2');
    expect(bedMeshProfile('SAVE', ' my mesh ')).toBe('BED_MESH_PROFILE SAVE=my_mesh');
    expect(bedMeshProfile('LOAD', 'default')).toBe('BED_MESH_PROFILE LOAD=default');
  });
});

describe('fans and pins', () => {
  it('uses M106/M107 for the part cooling fan', () => {
    expect(setFanSpeed({ key: 'fan', kind: 'part' }, 1)).toBe('M106 S255');
    expect(setFanSpeed({ key: 'fan', kind: 'part' }, 0.5)).toBe('M106 S128');
    expect(setFanSpeed({ key: 'fan', kind: 'part' }, 0)).toBe('M107');
  });

  it('uses SET_FAN_SPEED for generic fans, dropping the object prefix', () => {
    expect(setFanSpeed({ key: 'fan_generic filter', kind: 'generic' }, 0.4)).toBe(
      'SET_FAN_SPEED FAN=filter SPEED=0.40',
    );
  });

  it('sets a temperature fan by target temperature', () => {
    expect(setFanSpeed({ key: 'temperature_fan chamber', kind: 'temperature' }, 0.5)).toBe(
      'SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=chamber TARGET=50',
    );
  });

  it('clamps out-of-range speeds', () => {
    expect(setFanSpeed({ key: 'fan', kind: 'part' }, 5)).toBe('M106 S255');
    expect(setFanSpeed({ key: 'fan_generic x', kind: 'generic' }, -1)).toBe(
      'SET_FAN_SPEED FAN=x SPEED=0.00',
    );
  });

  it('sets output pins by name', () => {
    expect(setOutputPin('output_pin caselight', 0.75)).toBe('SET_PIN PIN=caselight VALUE=0.75');
  });
});
