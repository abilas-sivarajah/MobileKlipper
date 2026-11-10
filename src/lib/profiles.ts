/**
 * Starting values per printer model. A profile only seeds the app-side
 * preferences (jog steps, speeds, material presets, filament path); what the
 * printer can actually do is always read from its live config (see caps.ts).
 */

export type PrinterModel = 'generic' | 'ender3v2' | 'neptune4';

export interface TempPreset {
  id: string;
  name: string;
  extruder: number;
  bed: number;
  chamber?: number;
}

/**
 * How filament travels from the extruder gears to the nozzle. A Bowden printer
 * like the Ender 3 V2 has ~40 cm of PTFE tube in between; a direct drive like
 * the Neptune 4 only a few centimetres.
 */
export interface FilamentSettings {
  /** Retract this far to pull the filament clear of the extruder gears. */
  unloadLength: number;
  unloadSpeed: number;
  /** Fast feed through the tube, stopping short of the melt zone. */
  loadLength: number;
  loadSpeed: number;
  /** Slow extrusion through the nozzle until the new material runs clean. */
  purgeLength: number;
  purgeSpeed: number;
}

export interface ProfileDefaults {
  moveSteps: number[];
  babyStepSizes: number[];
  extrudeLengths: number[];
  extrudeFeedrate: number;
  feedrateXY: number;
  feedrateZ: number;
  tempPresets: TempPreset[];
  filament: FilamentSettings;
}

export interface PrinterProfile {
  model: PrinterModel;
  label: string;
  /** One line shown under the label in pickers. */
  summary: string;
  defaults: ProfileDefaults;
  /** Model-specific advice, shown in the printer settings. */
  tips: string[];
}

const GENERIC: PrinterProfile = {
  model: 'generic',
  label: 'Anderer Klipper-Drucker',
  summary: 'Neutrale Startwerte',
  defaults: {
    moveSteps: [0.1, 1, 10, 50],
    babyStepSizes: [0.005, 0.01, 0.05, 0.1],
    extrudeLengths: [5, 10, 25, 50],
    extrudeFeedrate: 5,
    feedrateXY: 100,
    feedrateZ: 25,
    tempPresets: [
      { id: 'pla', name: 'PLA', extruder: 210, bed: 60 },
      { id: 'petg', name: 'PETG', extruder: 240, bed: 80 },
      { id: 'abs', name: 'ABS', extruder: 255, bed: 100 },
      { id: 'tpu', name: 'TPU', extruder: 225, bed: 50 },
    ],
    filament: {
      unloadLength: 80,
      unloadSpeed: 25,
      loadLength: 50,
      loadSpeed: 10,
      purgeLength: 40,
      purgeSpeed: 4,
    },
  },
  tips: [],
};

const ENDER3V2: PrinterProfile = {
  model: 'ender3v2',
  label: 'Creality Ender 3 V2',
  summary: 'Bowden, Z über Endschalter oder CR Touch',
  defaults: {
    moveSteps: [0.1, 1, 10, 50],
    babyStepSizes: [0.01, 0.025, 0.05, 0.1],
    extrudeLengths: [5, 10, 25, 50],
    extrudeFeedrate: 4,
    feedrateXY: 80,
    // The stock config caps Z at 5 mm/s; Klipper would clamp faster jogs anyway.
    feedrateZ: 5,
    tempPresets: [
      { id: 'pla', name: 'PLA', extruder: 200, bed: 60 },
      { id: 'petg', name: 'PETG', extruder: 235, bed: 70 },
      { id: 'tpu', name: 'TPU', extruder: 220, bed: 50 },
      // The stock hotend has a PTFE liner down to the nozzle; stay at 240 °C.
      { id: 'abs', name: 'ABS', extruder: 240, bed: 100 },
    ],
    filament: {
      unloadLength: 400,
      unloadSpeed: 40,
      loadLength: 350,
      loadSpeed: 30,
      purgeLength: 50,
      purgeSpeed: 4,
    },
  },
  tips: [
    'Das Original-Display des V2 funktioniert unter Klipper nicht – diese App ersetzt es.',
    'Ohne Sonde: [bed_screws] in der printer.cfg anlegen, dann führt „Kalibrieren → Bettschrauben" Schraube für Schraube durch.',
    'Mit CR Touch/BLTouch: [screws_tilt_adjust] eintragen, dann rechnet die App die Schraubendrehungen aus.',
    'Filamentweg auf deine Bowden-Länge anpassen (Extruderzahnrad bis Düse, typisch 380–420 mm).',
    'Die PTFE-Auskleidung im Hotend verträgt dauerhaft nicht mehr als etwa 240 °C.',
  ],
};

const NEPTUNE4: PrinterProfile = {
  model: 'neptune4',
  label: 'Elegoo Neptune 4 / Pro / Plus / Max',
  summary: 'Direct Drive, Sonde, Klipper ab Werk',
  defaults: {
    moveSteps: [0.1, 1, 10, 50],
    babyStepSizes: [0.01, 0.025, 0.05, 0.1],
    extrudeLengths: [5, 10, 25, 50],
    extrudeFeedrate: 5,
    feedrateXY: 150,
    feedrateZ: 10,
    tempPresets: [
      { id: 'pla', name: 'PLA', extruder: 210, bed: 60 },
      { id: 'petg', name: 'PETG', extruder: 240, bed: 70 },
      { id: 'abs', name: 'ABS', extruder: 250, bed: 100 },
      { id: 'tpu', name: 'TPU', extruder: 225, bed: 50 },
    ],
    filament: {
      unloadLength: 80,
      unloadSpeed: 25,
      loadLength: 40,
      loadSpeed: 8,
      purgeLength: 40,
      purgeSpeed: 4,
    },
  },
  tips: [
    'Moonraker läuft ab Werk – als Adresse die IP des Druckers mit Port 7125 eintragen.',
    'Die Pro/Plus/Max haben ein geteiltes Heizbett. Die äußere Zone erscheint als eigener Heizer und wird beim Vorheizen mit der Betttemperatur belegt – im Vorheiz-Dialog abwählbar.',
    'Elegoos Klipper ist ein angepasster Fork. Updates über den Moonraker-Update-Manager können ihn unbrauchbar machen.',
    'Bei älteren Klipper-Versionen speichert SAVE_CONFIG die PID-Werte eines heater_generic unter falschem Abschnittsnamen – nach PID-Tuning der Außenzone die printer.cfg prüfen.',
  ],
};

export const PROFILES: PrinterProfile[] = [ENDER3V2, NEPTUNE4, GENERIC];

export function profileFor(model: PrinterModel | undefined): PrinterProfile {
  return PROFILES.find((p) => p.model === model) ?? GENERIC;
}

/** Fresh copies, so editing one printer's presets never touches another's. */
export function profileDefaults(model: PrinterModel | undefined): ProfileDefaults {
  const d = profileFor(model).defaults;
  return {
    ...d,
    moveSteps: [...d.moveSteps],
    babyStepSizes: [...d.babyStepSizes],
    extrudeLengths: [...d.extrudeLengths],
    tempPresets: d.tempPresets.map((p) => ({ ...p })),
    filament: { ...d.filament },
  };
}
