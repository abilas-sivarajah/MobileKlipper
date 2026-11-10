/**
 * Self-update from GitHub Releases, the same scheme as GX Tube and ABI TV:
 * ask the API for the latest release, compare versions, offer the update.
 *
 * MobileKlipper is a web app, so it cannot overwrite itself. Installing goes
 * through Moonraker's update manager, which updates web clients like Mainsail
 * from a release zip (see README, "Updates").
 */

export const REPO = 'abilas-sivarajah/MobileKlipper';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
/** Section name in moonraker.conf, and therefore also the release asset name. */
export const MOONRAKER_UPDATER_NAME = 'mobileklipper';
export const RELEASE_ASSET = `${MOONRAKER_UPDATER_NAME}.zip`;

/** Check at most this often when the app opens or comes back to the foreground. */
export const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** "Später" hides that one version for this long. */
export const SNOOZE_MS = 12 * 60 * 60 * 1000;

/** Version of this build, injected by Vite (see vite.config.ts). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export interface AppRelease {
  version: string;
  tag: string;
  title: string;
  /** One readable paragraph for the dialog. */
  notes: string;
  url: string;
  /** Download of the zip Moonraker installs from, when the release has one. */
  assetUrl: string | null;
  publishedAt: string | null;
}

/** "v1.2.3-beta" -> [1, 2, 3]; anything non-numeric counts as 0. */
function versionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]!
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(remote: string, current: string): boolean {
  const a = versionParts(remote);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Release notes for a phone screen: the "Neu:" line the release workflow writes,
 * otherwise the body without markdown and GitHub's generated boilerplate.
 */
export function releaseNotes(body: string | null | undefined): string {
  const raw = body ?? '';
  const neu = raw.split('\n').find((line) => line.trim().startsWith('Neu:'));
  if (neu) return neu.trim().slice(4).trim();
  const cleaned = raw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !/^\s*\*\*Full Changelog\*\*/i.test(line) && !line.trimStart().startsWith('<!--'))
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^\s*[-*+]\s+/, '• ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/ by @\S+ in https?:\/\/\S+/g, '')
        .replace(/\*\*|__|`/g, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || 'Allgemeine Verbesserungen und Fehlerbehebungen.';
}

interface GhRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

export function parseRelease(json: unknown): AppRelease {
  const release = (json ?? {}) as GhRelease;
  if (!release.tag_name) throw new Error('GitHub lieferte kein Release');
  const asset = release.assets?.find((a) => a.name === RELEASE_ASSET);
  return {
    version: release.tag_name.replace(/^v/i, ''),
    tag: release.tag_name,
    title: release.name || `MobileKlipper ${release.tag_name}`,
    notes: releaseNotes(release.body),
    url: release.html_url || `${RELEASES_URL}/tag/${release.tag_name}`,
    assetUrl: asset?.browser_download_url ?? null,
    publishedAt: release.published_at ?? null,
  };
}

/** Latest published release; GitHub excludes drafts and pre-releases here. */
export async function fetchLatestRelease(fetchFn: typeof fetch = fetch): Promise<AppRelease> {
  let res: Response;
  try {
    res = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Keine Verbindung zu GitHub');
  }
  if (res.status === 404) throw new Error('Noch kein Release veröffentlicht');
  if (res.status === 403 || res.status === 429) {
    throw new Error('GitHub lässt gerade keine Abfrage zu – später erneut versuchen');
  }
  if (!res.ok) throw new Error(`GitHub antwortet mit HTTP ${res.status}`);
  return parseRelease(await res.json());
}
