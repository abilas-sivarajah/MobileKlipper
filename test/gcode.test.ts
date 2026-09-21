import { describe, expect, it } from 'vitest';
import {
  adjustZOffset,
  extrude,
  home,
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
});

describe('heaters and factors', () => {
  it('targets any heater by its object name', () => {
    expect(setHeaterTarget('heater_generic chamber', 50.4)).toBe(
      'SET_HEATER_TEMPERATURE HEATER=heater_generic chamber TARGET=50',
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
