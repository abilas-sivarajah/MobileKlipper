import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_VERSION,
  CHECK_INTERVAL_MS,
  fetchLatestRelease,
  isNewerVersion,
  parseRelease,
  releaseNotes,
  SNOOZE_MS,
} from '@/lib/appUpdate';

vi.mock('@/lib/sw', () => ({ reloadToLatest: vi.fn(async () => undefined) }));

import { reloadToLatest } from '@/lib/sw';
import { useAppUpdateStore } from '@/store/appUpdate';
import { usePrinterStore } from '@/store/printer';

function ghRelease(version: string, body = `Neu: Updater eingebaut\n\nStand: abc`) {
  return {
    tag_name: `v${version}`,
    name: `MobileKlipper ${version}`,
    body,
    html_url: `https://github.com/abilas-sivarajah/MobileKlipper/releases/tag/v${version}`,
    published_at: '2026-11-10T12:00:00Z',
    assets: [
      { name: 'mobileklipper.zip', browser_download_url: 'https://example.invalid/mobileklipper.zip' },
    ],
  };
}

function respond(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('isNewerVersion', () => {
  it('compares numerically, not as text', () => {
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true);
    expect(isNewerVersion('v1.0.0', '0.9.99')).toBe(true);
    expect(isNewerVersion('0.1.9', '0.1.10')).toBe(false);
  });

  it('treats equal versions and suffixes sensibly', () => {
    expect(isNewerVersion('0.1.5', '0.1.5')).toBe(false);
    expect(isNewerVersion('0.1.5-beta', '0.1.4')).toBe(true);
    expect(isNewerVersion('0.2', '0.1.99')).toBe(true);
  });
});

describe('release parsing', () => {
  it('takes the "Neu:" line the workflow writes', () => {
    expect(releaseNotes('Neu: Bed Mesh als Heatmap\n\n**Aktualisieren:** …')).toBe('Bed Mesh als Heatmap');
  });

  it('cleans generated GitHub notes', () => {
    const body = "## What's Changed\n* Add updater by @someone in https://github.com/x/y/pull/1\n\n**Full Changelog**: https://x";
    expect(releaseNotes(body)).toBe("What's Changed\n• Add updater");
    expect(releaseNotes('')).toBe('Allgemeine Verbesserungen und Fehlerbehebungen.');
  });

  it('reads version, notes and the Moonraker asset', () => {
    expect(parseRelease(ghRelease('0.1.7'))).toMatchObject({
      version: '0.1.7',
      tag: 'v0.1.7',
      notes: 'Updater eingebaut',
      assetUrl: 'https://example.invalid/mobileklipper.zip',
    });
    expect(() => parseRelease({})).toThrow();
  });

  it('turns HTTP failures into readable messages', async () => {
    await expect(fetchLatestRelease(respond({}, 404) as unknown as typeof fetch)).rejects.toThrow(
      'Noch kein Release veröffentlicht',
    );
    await expect(fetchLatestRelease(respond({}, 403) as unknown as typeof fetch)).rejects.toThrow(/später/);
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchLatestRelease(offline as unknown as typeof fetch)).rejects.toThrow('Keine Verbindung zu GitHub');
  });
});

describe('update store', () => {
  const newer = '99.0.0';

  beforeEach(() => {
    useAppUpdateStore.setState({
      phase: 'idle',
      release: null,
      error: null,
      dialogOpen: false,
      moonrakerManaged: null,
      swUpdateReady: false,
      autoCheck: true,
      lastCheck: 0,
      snoozedVersion: null,
      snoozedAt: 0,
    });
    usePrinterStore.setState({ client: null, connection: 'idle', serverInfo: null, status: {} });
    vi.mocked(reloadToLatest).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the dialog when GitHub has a newer version', async () => {
    vi.stubGlobal('fetch', respond(ghRelease(newer)));
    await useAppUpdateStore.getState().checkOnOpen(1_000_000);
    const s = useAppUpdateStore.getState();
    expect(s.phase).toBe('available');
    expect(s.dialogOpen).toBe(true);
    expect(s.release?.version).toBe(newer);
  });

  it('stays quiet when this build is current', async () => {
    vi.stubGlobal('fetch', respond(ghRelease(APP_VERSION)));
    await useAppUpdateStore.getState().checkOnOpen(1_000_000);
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'up-to-date', dialogOpen: false });
  });

  it('checks at most every 15 minutes on open', async () => {
    const fetchMock = respond(ghRelease(APP_VERSION));
    vi.stubGlobal('fetch', fetchMock);
    const t0 = 10_000_000;
    await useAppUpdateStore.getState().checkOnOpen(t0);
    await useAppUpdateStore.getState().checkOnOpen(t0 + CHECK_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await useAppUpdateStore.getState().checkOnOpen(t0 + CHECK_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not check on open when automatic checks are off', async () => {
    const fetchMock = respond(ghRelease(newer));
    vi.stubGlobal('fetch', fetchMock);
    useAppUpdateStore.setState({ autoCheck: false });
    await useAppUpdateStore.getState().checkOnOpen(1_000_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"Später" hides that version for 12 hours, then asks again', async () => {
    vi.stubGlobal('fetch', respond(ghRelease(newer)));
    const t0 = 50_000_000;
    await useAppUpdateStore.getState().checkOnOpen(t0);
    useAppUpdateStore.getState().snooze(t0);
    expect(useAppUpdateStore.getState().dialogOpen).toBe(false);

    useAppUpdateStore.setState({ phase: 'idle' });
    await useAppUpdateStore.getState().checkOnOpen(t0 + CHECK_INTERVAL_MS);
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'available', dialogOpen: false });

    useAppUpdateStore.setState({ phase: 'idle' });
    await useAppUpdateStore.getState().checkOnOpen(t0 + SNOOZE_MS);
    expect(useAppUpdateStore.getState().dialogOpen).toBe(true);
  });

  it('reports errors only for a manual check', async () => {
    vi.stubGlobal('fetch', respond({}, 500));
    await useAppUpdateStore.getState().checkOnOpen(1_000_000);
    expect(useAppUpdateStore.getState().phase).toBe('idle');
    await useAppUpdateStore.getState().checkNow();
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'failed' });
    expect(useAppUpdateStore.getState().error).toMatch(/HTTP 500/);
  });

  it('installs through Moonraker: refresh, upgrade, then reload', async () => {
    const calls: string[] = [];
    const client = {
      updateStatus: vi.fn(async () => ({ version_info: { mobileklipper: { version: 'v0.1.0' } } })),
      refreshUpdate: vi.fn(async (name: string) => {
        calls.push(`refresh ${name}`);
        return { version_info: {} };
      }),
      upgrade: vi.fn(async (name: string) => {
        calls.push(`upgrade ${name}`);
        return 'ok';
      }),
    };
    usePrinterStore.setState({
      client: client as never,
      connection: 'open',
      serverInfo: { klippy_connected: true, klippy_state: 'ready', components: ['update_manager'] },
      status: { print_stats: { state: 'standby' } },
    });
    useAppUpdateStore.setState({ phase: 'available', release: parseRelease(ghRelease(newer)), dialogOpen: true });

    await useAppUpdateStore.getState().install();
    expect(calls).toEqual(['refresh mobileklipper', 'upgrade mobileklipper']);
    expect(reloadToLatest).toHaveBeenCalledTimes(1);
    expect(useAppUpdateStore.getState().phase).toBe('reloading');
  });

  it('explains instead of failing when Moonraker does not manage the app', async () => {
    const client = {
      updateStatus: vi.fn(async () => ({ version_info: { klipper: {} } })),
      refreshUpdate: vi.fn(),
      upgrade: vi.fn(),
    };
    usePrinterStore.setState({
      client: client as never,
      connection: 'open',
      serverInfo: { klippy_connected: true, klippy_state: 'ready', components: ['update_manager'] },
      status: {},
    });
    useAppUpdateStore.setState({ phase: 'available', release: parseRelease(ghRelease(newer)), dialogOpen: true });
    await useAppUpdateStore.getState().install();
    expect(client.upgrade).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'available', moonrakerManaged: false });
  });

  it('refuses to update during a print', async () => {
    const client = { updateStatus: vi.fn(), refreshUpdate: vi.fn(), upgrade: vi.fn() };
    usePrinterStore.setState({
      client: client as never,
      connection: 'open',
      status: { print_stats: { state: 'printing' } },
    });
    useAppUpdateStore.setState({ phase: 'available', release: parseRelease(ghRelease(newer)) });
    await useAppUpdateStore.getState().install();
    expect(client.upgrade).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().error).toMatch(/Druck/);
  });

  it('just reloads when the server already has the new files', async () => {
    useAppUpdateStore.setState({ phase: 'available', release: parseRelease(ghRelease(newer)), swUpdateReady: true });
    await useAppUpdateStore.getState().install();
    expect(reloadToLatest).toHaveBeenCalledTimes(1);
  });
});
