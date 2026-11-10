/**
 * Plans a filament load or unload as a list of small steps.
 *
 * Every step is sent as its own gcode call: a 400 mm Bowden unload at 40 mm/s
 * takes ten seconds, and splitting it lets the wizard show progress and stop
 * between chunks. Chunks also respect Klipper's max_extrude_only_distance,
 * which otherwise rejects the move outright.
 */
import { extrudeMoves } from './gcode';
import type { FilamentSettings } from './profiles';

export type FilamentAction = 'load' | 'unload';

export interface FilamentStep {
  /** Short label for the progress line. */
  label: string;
  script: string;
  /** Filament length this step moves, for progress weighting. */
  length: number;
}

/** Pushing a little first softens the tip so it pulls out without a blob. */
export const TIP_FORMING_MM = 10;

export function planFilamentChange(
  action: FilamentAction,
  settings: FilamentSettings,
  maxPerMove: number,
): FilamentStep[] {
  const steps: FilamentStep[] = [];
  const add = (label: string, length: number, speed: number) => {
    for (const move of extrudeMoves(length, speed, maxPerMove)) {
      // M83 on every step: something else may switch back to absolute E
      // between two calls, and the moves are only correct in relative mode.
      const mm = Math.abs(Number(/E(-?[\d.]+)/.exec(move)?.[1] ?? 0));
      steps.push({ label, script: `M83\n${move}`, length: mm });
    }
  };

  if (action === 'unload') {
    add('Spitze formen', TIP_FORMING_MM, settings.purgeSpeed);
    add('Herausziehen', -settings.unloadLength, settings.unloadSpeed);
  } else {
    if (settings.loadLength > 0) add('Einführen', settings.loadLength, settings.loadSpeed);
    if (settings.purgeLength > 0) add('Spülen', settings.purgeLength, settings.purgeSpeed);
  }
  return steps;
}

/** Seconds the plan takes at the requested speeds; Klipper may go slower. */
export function estimateSeconds(action: FilamentAction, settings: FilamentSettings): number {
  if (action === 'unload') {
    return TIP_FORMING_MM / settings.purgeSpeed + settings.unloadLength / settings.unloadSpeed;
  }
  return settings.loadLength / settings.loadSpeed + settings.purgeLength / settings.purgeSpeed;
}

/** Printer macros that do the whole job, if the config defines them. */
export function filamentMacro(action: FilamentAction, macros: Set<string>): string | null {
  const candidates =
    action === 'load' ? ['LOAD_FILAMENT', 'FILAMENT_LOAD', 'M701'] : ['UNLOAD_FILAMENT', 'FILAMENT_UNLOAD', 'M702'];
  return candidates.find((name) => macros.has(name)) ?? null;
}

/** Hot enough to move filament: Klipper's own limit plus a small margin. */
export function readyToExtrude(
  temperature: number,
  target: number,
  minExtrudeTemp: number,
): boolean {
  return temperature >= minExtrudeTemp && target > 0 && temperature >= target - 3;
}
