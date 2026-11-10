/**
 * Per-printer command history for the console, kept across navigation and
 * reloads. Storage can be unavailable (private mode, blocked site data), in
 * which case the history simply lives for the session.
 */
const LIMIT = 50;
const memory = new Map<string, string[]>();

function storageKey(printerId: string): string {
  return `mobileklipper.console.${printerId}`;
}

export function loadConsoleHistory(printerId: string | null): string[] {
  if (!printerId) return [];
  const cached = memory.get(printerId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(storageKey(printerId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
    memory.set(printerId, list);
    return list;
  } catch {
    return [];
  }
}

/** Most recent first, de-duplicated, capped. Returns the new list. */
export function pushConsoleHistory(printerId: string | null, command: string): string[] {
  const trimmed = command.trim();
  if (!printerId || !trimmed) return loadConsoleHistory(printerId);
  const next = [trimmed, ...loadConsoleHistory(printerId).filter((c) => c !== trimmed)].slice(0, LIMIT);
  memory.set(printerId, next);
  try {
    localStorage.setItem(storageKey(printerId), JSON.stringify(next));
  } catch {
    /* session-only history */
  }
  return next;
}
