/** Formatting helpers shared across screens. */

export function formatDuration(seconds: number | undefined | null, compact = false): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--';
  const total = Math.floor(seconds);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return compact ? `${d}d ${h}h` : `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h > 0) return compact ? `${h}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (compact) return `${m}m ${pad(s)}s`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatTemp(value: number | undefined | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits)}°`;
}

export function formatPercent(fraction: number | undefined | null, digits = 0): string {
  if (fraction == null || !Number.isFinite(fraction)) return '--';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Millimetres of 1.75 mm filament to grams, assuming PLA density 1.24 g/cm³. */
export function filamentGrams(millimetres: number | undefined, diameter = 1.75, density = 1.24): string {
  if (millimetres == null || !Number.isFinite(millimetres)) return '--';
  const areaMm2 = Math.PI * (diameter / 2) ** 2;
  const volumeCm3 = (areaMm2 * millimetres) / 1000;
  return `${(volumeCm3 * density).toFixed(1)} g`;
}

export function formatLength(millimetres: number | undefined | null): string {
  if (millimetres == null || !Number.isFinite(millimetres)) return '--';
  if (millimetres >= 1000) return `${(millimetres / 1000).toFixed(2)} m`;
  return `${millimetres.toFixed(0)} mm`;
}

/** Clock time at which a print with `remaining` seconds left finishes. */
export function formatEta(remainingSeconds: number | undefined | null, now = new Date()): string {
  if (remainingSeconds == null || !Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return '--';
  }
  const eta = new Date(now.getTime() + remainingSeconds * 1000);
  const time = eta.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const sameDay = eta.toDateString() === now.toDateString();
  if (sameDay) return time;
  const day = eta.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${time}`;
}

export function formatDateTime(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return '--';
  return new Date(epochSeconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** "prints/benchy.gcode" -> "benchy.gcode" */
export function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

export function stripGcodeExtension(name: string): string {
  return name.replace(/\.(gcode|g|gco|ufp|nc)$/i, '');
}

/** Turns "temperature_sensor raspberry_pi" into "Raspberry Pi". */
export function prettyObjectName(objectName: string): string {
  const withoutPrefix = objectName.includes(' ')
    ? objectName.slice(objectName.indexOf(' ') + 1)
    : objectName;
  return withoutPrefix
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
