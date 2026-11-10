import { describe, expect, it } from 'vitest';
import { configSectionsOf, cpuUsage, memoryUsage, throttleWarnings, updateViews } from '@/lib/system';

describe('throttleWarnings', () => {
  it('translates Pi throttle flags and separates current from past', () => {
    expect(
      throttleWarnings({ throttled_state: { bits: 0x50005, flags: ['Under-Voltage Detected', 'Previously Throttled'] } }),
    ).toEqual([
      { text: 'Unterspannung – Netzteil zu schwach', active: true },
      { text: 'Seit dem Start wurde gedrosselt', active: false },
    ]);
  });

  it('is empty when the host is not a Pi or all is well', () => {
    expect(throttleWarnings({ throttled_state: null })).toEqual([]);
    expect(throttleWarnings(null)).toEqual([]);
  });
});

describe('host load', () => {
  it('reads cpu and memory usage', () => {
    const stats = { system_cpu_usage: { cpu: 12.5 }, system_memory: { total: 1000, available: 600, used: 400 } };
    expect(cpuUsage(stats)).toBe(12.5);
    expect(memoryUsage(stats)).toBe(0.4);
    expect(memoryUsage({})).toBeNull();
  });
});

describe('configSectionsOf', () => {
  it('finds section headers with line and offset', () => {
    const text = '[printer]\nkinematics: cartesian\n\n[extruder]\nmax_temp: 260\n#*# [bed_mesh default]';
    expect(configSectionsOf(text)).toEqual([
      { name: 'printer', line: 0, offset: 0 },
      { name: 'extruder', line: 3, offset: 33 },
    ]);
    expect(text.slice(33, 43)).toBe('[extruder]');
  });
});

describe('updateViews', () => {
  it('flags a manufacturer fork as not updatable', () => {
    const views = updateViews({
      klipper: { version: 'v0.12.0-1', remote_version: 'v0.12.0-9', is_valid: false, commits_behind: [{}, {}] },
      moonraker: { version: 'v0.9.3', remote_version: 'v0.9.3', is_valid: true, commits_behind: [] },
      mainsail: { version: 'v2.13.1', remote_version: 'v2.14.0' },
      system: { package_count: 3 },
    });
    expect(views.map((v) => [v.name, v.behind, v.blocked])).toEqual([
      ['klipper', 2, 'Kein offizielles Repository (z. B. Hersteller-Fork)'],
      ['mainsail', 1, null],
      ['moonraker', 0, null],
      ['system', 3, null],
    ]);
  });
});
