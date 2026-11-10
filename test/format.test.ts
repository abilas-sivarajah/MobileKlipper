import { describe, expect, it } from 'vitest';
import {
  basename,
  filamentGrams,
  formatBytes,
  formatDuration,
  formatEta,
  formatLength,
  formatPercent,
  formatTemp,
  prettyObjectName,
  stripGcodeExtension,
  parseNumberList,
} from '@/lib/format';

describe('formatDuration', () => {
  it('scales the unit to the magnitude', () => {
    expect(formatDuration(45)).toBe('00:45');
    expect(formatDuration(3725)).toBe('01:02:05');
    expect(formatDuration(90_000)).toBe('1d 01:00:00');
  });

  it('has a compact form for tight layouts', () => {
    expect(formatDuration(45, true)).toBe('0m 45s');
    expect(formatDuration(3725, true)).toBe('1h 02m');
    expect(formatDuration(90_000, true)).toBe('1d 1h');
  });

  it('renders unknown and negative values as placeholders', () => {
    expect(formatDuration(undefined)).toBe('--');
    expect(formatDuration(-5)).toBe('--');
    expect(formatDuration(Number.NaN)).toBe('--');
  });
});

describe('formatBytes', () => {
  it('picks the largest fitting unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(4_812_340)).toBe('4.6 MB');
    expect(formatBytes(undefined)).toBe('--');
  });
});

describe('temperature and percentage', () => {
  it('formats with a fixed number of digits', () => {
    expect(formatTemp(248.44)).toBe('248.4°');
    expect(formatTemp(250, 0)).toBe('250°');
    expect(formatTemp(undefined)).toBe('--');
    expect(formatPercent(0.345)).toBe('35%');
  });
});

describe('filament', () => {
  it('converts length to grams for 1.75 mm PLA', () => {
    expect(filamentGrams(10_000)).toBe('29.8 g');
    expect(filamentGrams(undefined)).toBe('--');
  });

  it('switches to metres for long runs', () => {
    expect(formatLength(850)).toBe('850 mm');
    expect(formatLength(12_400)).toBe('12.40 m');
  });
});

describe('formatEta', () => {
  it('shows the clock time a print finishes', () => {
    const now = new Date('2026-05-01T10:00:00');
    expect(formatEta(3600, now)).toMatch(/11:00/);
  });

  it('adds the weekday when it lands on another day', () => {
    const now = new Date('2026-05-01T23:00:00');
    expect(formatEta(7200, now)).toMatch(/\w+ /);
  });

  it('has nothing to show without a remaining time', () => {
    expect(formatEta(null)).toBe('--');
    expect(formatEta(0)).toBe('--');
  });
});

describe('names', () => {
  it('strips directories and gcode extensions', () => {
    expect(basename('prints/sub/cube.gcode')).toBe('cube.gcode');
    expect(stripGcodeExtension('cube.gcode')).toBe('cube');
    expect(stripGcodeExtension('part_v2.ufp')).toBe('part_v2');
  });

  it('turns klipper object names into labels', () => {
    expect(prettyObjectName('temperature_sensor raspberry_pi')).toBe('Raspberry Pi');
    expect(prettyObjectName('heater_bed')).toBe('Heater Bed');
  });
});

describe('parseNumberList', () => {
  it('reads semicolon and space separated lists', () => {
    expect(parseNumberList('0.1; 1; 10; 50')).toEqual([0.1, 1, 10, 50]);
    expect(parseNumberList('50 10 1')).toEqual([1, 10, 50]);
  });

  it('accepts the old comma-separated format', () => {
    expect(parseNumberList('0.1, 1, 10, 50')).toEqual([0.1, 1, 10, 50]);
    expect(parseNumberList('0.1,1,10')).toEqual([0.1, 1, 10]);
  });

  it('reads German decimal commas', () => {
    expect(parseNumberList('0,005; 0,01; 0,05')).toEqual([0.005, 0.01, 0.05]);
  });

  it('drops junk, non-positive values and duplicates', () => {
    expect(parseNumberList('abc; -1; 0; 5; 5')).toEqual([5]);
    expect(parseNumberList('')).toEqual([]);
  });
});
