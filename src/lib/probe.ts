/**
 * Connection probe used by the printer setup screen.
 *
 * A browser cannot tell a DNS failure from a blocked CORS preflight — both
 * surface as a bare TypeError — so the failure path guesses the likely cause
 * from the page's own origin and reports it as a hint.
 */
import { normalizeBaseUrl } from '@/moonraker/client';
import type { ServerInfo } from '@/moonraker/types';

export type ProbeResult =
  | { ok: true; baseUrl: string; info: ServerInfo }
  | { ok: false; error: string; hint?: string };

export async function probeMoonraker(
  rawUrl: string,
  apiKey?: string,
  timeoutMs = 8000,
): Promise<ProbeResult> {
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(rawUrl);
  } catch {
    return { ok: false, error: 'Ungültige Adresse' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/server/info`, {
      headers: apiKey ? { 'X-Api-Key': apiKey } : {},
      signal: controller.signal,
    });
    if (res.status === 401) {
      return { ok: false, error: 'Nicht autorisiert', hint: 'Moonraker verlangt einen API-Key.' };
    }
    if (!res.ok) {
      return { ok: false, error: `Moonraker antwortete mit ${res.status} ${res.statusText}` };
    }
    const body = (await res.json()) as { result?: ServerInfo };
    if (!body.result) return { ok: false, error: 'Unerwartete Antwort von Moonraker' };
    return { ok: true, baseUrl, info: body.result };
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: 'Zeitüberschreitung',
        hint: 'Ist der Drucker im selben Netzwerk erreichbar?',
      };
    }
    return { ok: false, error: 'Verbindung fehlgeschlagen', hint: diagnose(baseUrl) };
  } finally {
    clearTimeout(timer);
  }
}

export function diagnose(baseUrl: string): string {
  const pageIsHttps = globalThis.location?.protocol === 'https:';
  const targetIsHttp = baseUrl.startsWith('http://');
  if (pageIsHttps && targetIsHttp) {
    return 'Die App läuft über HTTPS, der Drucker über HTTP – der Browser blockiert das (Mixed Content). Nutze die App über HTTP, einen HTTPS-Reverse-Proxy oder die Capacitor-App.';
  }
  return 'Meist fehlt in der moonraker.conf unter [authorization] der Eintrag cors_domains (z. B. "*") oder die Adresse ist falsch.';
}
