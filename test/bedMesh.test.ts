import { describe, expect, it } from 'vitest';
import {
  DIVERGING,
  describeAdjust,
  divergingColor,
  flatnessVerdict,
  getMeshView,
  getScrewResults,
  hexToOklab,
  meshProfiles,
  oklabToHex,
  parseAdjust,
  parsePidResult,
  parseShaperRecommendation,
} from '@/lib/bedMesh';

const mesh = {
  profile_name: 'default',
  mesh_min: [20, 20] as [number, number],
  mesh_max: [200, 220] as [number, number],
  probed_matrix: [
    [-0.1, 0, 0.05],
    [0.02, 0.01, 0.12],
  ],
  mesh_matrix: [[0]],
  profiles: { pla: {}, default: {}, abs: {} },
};

describe('getMeshView', () => {
  it('maps matrix indices to bed coordinates', () => {
    const view = getMeshView(mesh)!;
    expect(view.xs).toEqual([20, 110, 200]);
    expect(view.ys).toEqual([20, 220]);
    expect(view.min).toMatchObject({ z: -0.1, x: 20, y: 20, row: 0, col: 0 });
    expect(view.max).toMatchObject({ z: 0.12, x: 200, y: 220, row: 1, col: 2 });
    expect(view.range).toBeCloseTo(0.22, 9);
    expect(view.maxAbs).toBeCloseTo(0.12, 9);
  });

  it('returns null for Klipper’s empty-mesh placeholder or ragged data', () => {
    expect(getMeshView({ probed_matrix: [[]] })).toBeNull();
    expect(getMeshView(undefined)).toBeNull();
    expect(getMeshView({ probed_matrix: [[1, 2], [3]] })).toBeNull();
  });

  it('lists profiles with default first', () => {
    expect(meshProfiles(mesh)).toEqual(['default', 'abs', 'pla']);
  });

  it('grades flatness', () => {
    expect(flatnessVerdict(0.05)).toBe('gut');
    expect(flatnessVerdict(0.2)).toBe('ok');
    expect(flatnessVerdict(0.6)).toBe('schief');
  });
});

describe('divergingColor', () => {
  it('round-trips through OKLab', () => {
    for (const hex of ['#1c5cab', '#f0efec', '#a32a26', '#383835']) {
      expect(oklabToHex(hexToOklab(hex))).toBe(hex);
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`is neutral at zero and hits the poles at ±max (${theme})`, () => {
      const poles = DIVERGING[theme];
      expect(divergingColor(0, 0.2, theme)).toBe(poles.mid);
      expect(divergingColor(-0.2, 0.2, theme)).toBe(poles.low);
      expect(divergingColor(0.2, 0.2, theme)).toBe(poles.high);
      expect(divergingColor(5, 0.2, theme)).toBe(poles.high);
    });

    it(`changes lightness monotonically along each arm (${theme})`, () => {
      const L = (z: number) => hexToOklab(divergingColor(z, 1, theme))[0];
      const steps = [0, 0.25, 0.5, 0.75, 1];
      for (const sign of [-1, 1]) {
        const ls = steps.map((t) => L(sign * t));
        const diffs = ls.slice(1).map((l, i) => l - ls[i]!);
        expect(diffs.every((d) => (theme === 'light' ? d < 0 : d > 0))).toBe(true);
      }
    });

    it(`gives both arms matched end lightness (${theme})`, () => {
      const poles = DIVERGING[theme];
      expect(Math.abs(hexToOklab(poles.low)[0] - hexToOklab(poles.high)[0])).toBeLessThan(0.03);
    });
  }
});

describe('screws tilt results', () => {
  const raw = {
    screw2: { z: 2.51, sign: 'CW', adjust: '00:15', is_base: false },
    screw1: { z: 2.49, sign: 'CW', adjust: '00:00', is_base: true },
    screw10: { z: 2.4, sign: 'CCW', adjust: '01:30', is_base: false },
    screw3: { z: 2.49, sign: 'CCW', adjust: '00:01', is_base: false },
  };

  it('sorts screws numerically and parses turns', () => {
    const results = getScrewResults(raw);
    expect(results.map((r) => r.key)).toEqual(['screw1', 'screw2', 'screw3', 'screw10']);
    expect(results[1]!.turns).toBe(0.25);
    expect(parseAdjust('01:30')).toBe(1.5);
    expect(parseAdjust('nonsense')).toBe(0);
  });

  it('describes turns in plain words', () => {
    const [base, quarter, tiny, more] = getScrewResults(raw);
    expect(describeAdjust(base!)).toBe('Referenz');
    expect(describeAdjust(quarter!)).toBe('¼ Umdrehung im Uhrzeigersinn');
    expect(describeAdjust(tiny!)).toBe('passt');
    expect(describeAdjust(more!)).toBe('1½ Umdrehungen gegen den Uhrzeigersinn');
    expect(describeAdjust({ turns: 1, sign: 'CW', isBase: false })).toBe('1 Umdrehung im Uhrzeigersinn');
  });

  it('ignores junk', () => {
    expect(getScrewResults(null)).toEqual([]);
    expect(getScrewResults({ screw1: 5 })).toEqual([]);
  });
});

describe('console result parsing', () => {
  it('picks up the shaper recommendation per axis', () => {
    const lines = [
      'Fitted shaper \'mzv\' frequency = 53.8 Hz (vibrations = 1.6%, smoothing ~= 0.130)',
      'Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz',
      'Recommended shaper_type_y = ei, shaper_freq_y = 41.2 Hz',
    ];
    expect(parseShaperRecommendation(lines)).toEqual({
      x: { type: 'mzv', freq: 53.8 },
      y: { type: 'ei', freq: 41.2 },
    });
  });

  it('takes the latest PID result', () => {
    const lines = [
      'PID parameters: pid_Kp=1.000 pid_Ki=2.000 pid_Kd=3.000',
      'PID parameters: pid_Kp=22.865 pid_Ki=1.292 pid_Kd=101.178',
      'The SAVE_CONFIG command will update the printer config file',
    ];
    expect(parsePidResult(lines)).toEqual({ kp: 22.865, ki: 1.292, kd: 101.178 });
    expect(parsePidResult(['ok'])).toBeNull();
  });
});
