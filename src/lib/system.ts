/** Host health and config-file helpers for the system and config pages. */
import type { ProcStats, UpdateComponent } from '@/moonraker/types';

/**
 * Raspberry Pi throttle flags as Moonraker reports them. Under-voltage is the
 * classic cause of random disconnects on a Pi powered from a weak supply.
 */
const THROTTLE_TEXT: Record<string, string> = {
  'Under-Voltage Detected': 'Unterspannung – Netzteil zu schwach',
  'Frequency Capped': 'CPU-Takt begrenzt',
  'Currently Throttled': 'CPU wird gedrosselt',
  'Temperature Limit Active': 'Temperaturlimit aktiv – Pi zu heiß',
  'Previously Under-Volted': 'Seit dem Start gab es Unterspannung',
  'Previously Frequency Capped': 'Seit dem Start war der Takt begrenzt',
  'Previously Throttled': 'Seit dem Start wurde gedrosselt',
  'Previously Temperature Limited': 'Seit dem Start griff das Temperaturlimit',
};

export interface ThrottleWarning {
  text: string;
  /** Happening right now, rather than at some point since boot. */
  active: boolean;
}

export function throttleWarnings(stats: ProcStats | null | undefined): ThrottleWarning[] {
  const flags = stats?.throttled_state?.flags ?? [];
  return flags.map((flag) => ({
    text: THROTTLE_TEXT[flag] ?? flag,
    active: !flag.startsWith('Previously'),
  }));
}

/** Overall CPU load in percent, from the "cpu" aggregate. */
export function cpuUsage(stats: ProcStats | null | undefined): number | null {
  const value = stats?.system_cpu_usage?.cpu;
  return typeof value === 'number' ? value : null;
}

/** Memory use as a 0..1 fraction; Moonraker reports kilobytes. */
export function memoryUsage(stats: ProcStats | null | undefined): number | null {
  const mem = stats?.system_memory;
  if (!mem?.total) return null;
  const used = mem.used ?? mem.total - (mem.available ?? 0);
  return Math.min(1, Math.max(0, used / mem.total));
}

export interface ConfigSection {
  name: string;
  /** Zero-based line of the [section] header. */
  line: number;
  /** Character offset of the header, for placing the caret. */
  offset: number;
}

/** [section] headers in a Klipper/Moonraker config, skipping SAVE_CONFIG's commented block. */
export function configSectionsOf(text: string): ConfigSection[] {
  const out: ConfigSection[] = [];
  let offset = 0;
  text.split('\n').forEach((raw, line) => {
    const match = /^\[([^\]]+)\]/.exec(raw);
    if (match) out.push({ name: match[1]!.trim(), line, offset });
    offset += raw.length + 1;
  });
  return out;
}

export interface UpdateView {
  name: string;
  current: string;
  remote: string | null;
  behind: number;
  /** Local changes or a non-official repo: updating would break or be refused. */
  blocked: string | null;
  isSystem: boolean;
}

export function updateViews(info: Record<string, UpdateComponent> | undefined): UpdateView[] {
  if (!info) return [];
  return Object.entries(info)
    .map(([name, c]) => {
      const isSystem = name === 'system';
      const behind = isSystem
        ? (c.package_count ?? 0)
        : (c.commits_behind_count ?? c.commits_behind?.length ?? 0);
      const remote = c.remote_version && c.remote_version !== '?' ? c.remote_version : null;
      const outdated = isSystem ? behind > 0 : behind > 0 || (remote != null && remote !== c.version);
      let blocked: string | null = null;
      if (c.corrupt) blocked = 'Repository beschädigt';
      else if (c.is_valid === false) blocked = 'Kein offizielles Repository (z. B. Hersteller-Fork)';
      else if (c.is_dirty) blocked = 'Lokale Änderungen im Repository';
      return {
        name,
        current: isSystem ? `${behind} Pakete` : (c.version ?? '?'),
        remote: isSystem ? null : remote,
        behind: outdated ? Math.max(behind, 1) : 0,
        blocked,
        isSystem,
      };
    })
    .sort((a, b) => Number(a.isSystem) - Number(b.isSystem) || a.name.localeCompare(b.name));
}
