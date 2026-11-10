/**
 * Bed mesh and screw-levelling results as view models.
 *
 * Mesh heights are signed deviations around Z=0 (bed too high vs. too low),
 * so the heatmap uses a diverging scale: blue below, red above, neutral grey at
 * zero, symmetric around zero so equal deviations get equal colour weight.
 * See docs/DESIGN.md for how the poles were chosen.
 */
import type { BedMeshObject } from '@/moonraker/types';

export interface MeshPoint {
  x: number;
  y: number;
  z: number;
  row: number;
  col: number;
}

export interface MeshView {
  /** rows[0] is the front of the bed (lowest Y), as Klipper orders it. */
  rows: number[][];
  xs: number[];
  ys: number[];
  min: MeshPoint;
  max: MeshPoint;
  /** max - min: the single number that says how flat the bed is. */
  range: number;
  mean: number;
  /** Largest absolute deviation from zero; the scale runs ±this. */
  maxAbs: number;
}

function axis(min: number, max: number, count: number): number[] {
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

export function getMeshView(
  mesh: BedMeshObject | undefined,
  which: 'probed' | 'mesh' = 'probed',
): MeshView | null {
  const matrix = which === 'probed' ? mesh?.probed_matrix : mesh?.mesh_matrix;
  if (!matrix?.length || !matrix[0]?.length) return null;
  const cols = matrix[0].length;
  if (!matrix.every((row) => row.length === cols)) return null;
  const [minX, minY] = mesh?.mesh_min ?? [0, 0];
  const [maxX, maxY] = mesh?.mesh_max ?? [cols - 1, matrix.length - 1];
  const xs = axis(minX, maxX, cols);
  const ys = axis(minY, maxY, matrix.length);

  let min: MeshPoint | null = null;
  let max: MeshPoint | null = null;
  let sum = 0;
  let count = 0;
  matrix.forEach((row, r) =>
    row.forEach((z, c) => {
      const point = { x: xs[c]!, y: ys[r]!, z, row: r, col: c };
      if (!min || z < min.z) min = point;
      if (!max || z > max.z) max = point;
      sum += z;
      count++;
    }),
  );
  if (!min || !max) return null;
  const lo = min as MeshPoint;
  const hi = max as MeshPoint;
  return {
    rows: matrix,
    xs,
    ys,
    min: lo,
    max: hi,
    range: hi.z - lo.z,
    mean: sum / count,
    maxAbs: Math.max(Math.abs(lo.z), Math.abs(hi.z), 1e-6),
  };
}

/** Rough verdict for the mesh range, for a one-word summary. */
export function flatnessVerdict(range: number): 'gut' | 'ok' | 'schief' {
  if (range <= 0.1) return 'gut';
  if (range <= 0.25) return 'ok';
  return 'schief';
}

export function meshProfiles(mesh: BedMeshObject | undefined): string[] {
  return Object.keys(mesh?.profiles ?? {}).sort((a, b) =>
    a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b),
  );
}

// --- colour ------------------------------------------------------------------

type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklab(hex: string): Lab {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * The two arms end at matched OKLCH lightness (≈0.48 light, ≈0.71 dark) so
 * neither direction looks more severe than the other.
 */
export const DIVERGING = {
  light: { low: '#1c5cab', mid: '#f0efec', high: '#a32a26' },
  dark: { low: '#6da7ec', mid: '#383835', high: '#e57f78' },
} as const;

export type ThemeName = keyof typeof DIVERGING;

const labCache = new Map<string, Lab>();
function lab(hex: string): Lab {
  let value = labCache.get(hex);
  if (!value) {
    value = hexToOklab(hex);
    labCache.set(hex, value);
  }
  return value;
}

/** Colour for a deviation `z` on a scale of ±`maxAbs`. */
export function divergingColor(z: number, maxAbs: number, theme: ThemeName): string {
  const poles = DIVERGING[theme];
  const t = maxAbs > 0 ? Math.max(-1, Math.min(1, z / maxAbs)) : 0;
  const from = lab(poles.mid);
  const to = lab(t < 0 ? poles.low : poles.high);
  const k = Math.abs(t);
  return oklabToHex([
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k,
  ]);
}

// --- screws ------------------------------------------------------------------

export interface ScrewResult {
  key: string;
  z: number;
  sign: 'CW' | 'CCW';
  /** Klipper's "HH:MM": full turns and clock-face minutes of a turn. */
  adjust: string;
  isBase: boolean;
  /** Turns as a number, e.g. "01:15" -> 1.25. */
  turns: number;
}

export function parseAdjust(adjust: string): number {
  const match = /^(\d+):(\d+)$/.exec(adjust.trim());
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function getScrewResults(raw: unknown): ScrewResult[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: ScrewResult[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const adjust = typeof v.adjust === 'string' ? v.adjust : '00:00';
    out.push({
      key,
      z: typeof v.z === 'number' ? v.z : 0,
      sign: v.sign === 'CCW' ? 'CCW' : 'CW',
      adjust,
      isBase: v.is_base === true,
      turns: parseAdjust(adjust),
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

/** "01:15" CW -> "1¼ Umdrehungen im Uhrzeigersinn"; small values read as fine. */
export function describeAdjust(result: Pick<ScrewResult, 'turns' | 'sign' | 'isBase'>): string {
  if (result.isBase) return 'Referenz';
  if (result.turns < 2 / 60) return 'passt';
  const eighths = Math.max(1, Math.round(result.turns * 8));
  const whole = Math.floor(eighths / 8);
  const fraction = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][eighths % 8];
  const amount = `${whole > 0 ? whole : ''}${fraction}` || '0';
  const unit = eighths === 8 ? 'Umdrehung' : eighths > 8 ? 'Umdrehungen' : 'Umdrehung';
  const direction = result.sign === 'CW' ? 'im Uhrzeigersinn' : 'gegen den Uhrzeigersinn';
  return `${amount} ${unit} ${direction}`;
}

/** Klipper prints the shaper recommendation into the console; pick it up there. */
export function parseShaperRecommendation(
  lines: string[],
): Partial<Record<'x' | 'y', { type: string; freq: number }>> {
  const out: Partial<Record<'x' | 'y', { type: string; freq: number }>> = {};
  const re = /Recommended shaper_type_([xy])\s*=\s*([a-z0-9_]+),\s*shaper_freq_\1\s*=\s*([\d.]+)/i;
  for (const line of lines) {
    const match = re.exec(line);
    if (match) {
      out[match[1]!.toLowerCase() as 'x' | 'y'] = { type: match[2]!, freq: Number(match[3]) };
    }
  }
  return out;
}

/** "PID parameters: pid_Kp=22.865 pid_Ki=1.292 pid_Kd=101.178" */
export function parsePidResult(lines: string[]): { kp: number; ki: number; kd: number } | null {
  const re = /pid_Kp=([\d.]+)\s+pid_Ki=([\d.]+)\s+pid_Kd=([\d.]+)/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = re.exec(lines[i]!);
    if (match) return { kp: Number(match[1]), ki: Number(match[2]), kd: Number(match[3]) };
  }
  return null;
}
