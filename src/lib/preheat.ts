/**
 * Maps a material preset onto whatever heaters the printer has.
 *
 * Extruders take the nozzle temperature and the bed the bed temperature. A
 * generic heater whose name says "bed" is a second bed zone (the outer ring of
 * a Neptune 4 Pro/Plus/Max) and follows the bed; one that says "chamber"
 * takes the chamber value when the preset has one. Anything else is left
 * alone rather than heated to a guess.
 */
import type { GcodeMetadata } from '@/moonraker/types';
import type { HeaterView } from './derive';
import type { TempPreset } from './profiles';
import { setHeaterTarget } from './gcode';

export interface PreheatTarget {
  key: string;
  name: string;
  target: number;
  /** A secondary zone the user may want to leave off for small prints. */
  optional: boolean;
}

export function isBedZone(heater: Pick<HeaterView, 'key' | 'kind'>): boolean {
  return heater.kind === 'bed' || (heater.kind === 'generic' && /bed/i.test(heater.key));
}

function isChamber(heater: Pick<HeaterView, 'key' | 'kind'>): boolean {
  return heater.kind === 'generic' && /chamber|kammer/i.test(heater.key);
}

export interface PreheatTemps {
  extruder?: number | null;
  bed?: number | null;
  chamber?: number | null;
}

export function preheatTargets(heaters: HeaterView[], temps: PreheatTemps): PreheatTarget[] {
  const out: PreheatTarget[] = [];
  for (const heater of heaters) {
    let target: number | null | undefined = null;
    if (heater.kind === 'extruder') target = temps.extruder;
    else if (isBedZone(heater)) target = temps.bed;
    else if (isChamber(heater)) target = temps.chamber;
    if (target == null || !Number.isFinite(target) || target <= 0) continue;
    out.push({
      key: heater.key,
      name: heater.name,
      target: Math.min(Math.round(target), heater.maxTemp || Infinity),
      optional: heater.kind === 'generic',
    });
  }
  return out;
}

export function presetTemps(preset: TempPreset): PreheatTemps {
  return { extruder: preset.extruder, bed: preset.bed, chamber: preset.chamber ?? null };
}

/** First-layer temperatures the slicer wrote into the file, when present. */
export function metadataTemps(meta: Partial<GcodeMetadata> | null | undefined): PreheatTemps | null {
  if (!meta) return null;
  const extruder = meta.first_layer_extr_temp ?? null;
  const bed = meta.first_layer_bed_temp ?? null;
  if (!extruder && !bed) return null;
  return { extruder, bed, chamber: meta.chamber_temp ?? null };
}

export function preheatScript(targets: Array<Pick<PreheatTarget, 'key' | 'target'>>): string {
  return targets.map((t) => setHeaterTarget(t.key, t.target)).join('\n');
}
