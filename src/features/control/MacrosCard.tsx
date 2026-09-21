import { useMemo, useState } from 'react';
import { Play, Search, Star } from 'lucide-react';
import { Card, TextInput } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { useActivePrinter, usePrintersStore } from '@/store/printers';
import { useUiStore } from '@/store/ui';
import { getMacros } from '@/lib/derive';

export function MacrosCard() {
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const printer = useActivePrinter();
  const toggleFavorite = usePrintersStore((s) => s.toggleFavoriteMacro);
  const showHidden = useUiStore((s) => s.showHiddenMacros);
  const [query, setQuery] = useState('');

  const macros = useMemo(() => getMacros(status, showHidden), [status, showHidden]);
  const favorites = printer?.favoriteMacros ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? macros.filter((m) => m.name.toLowerCase().includes(needle))
      : macros;
    // Pinned macros first, so the ones used every print stay within reach.
    return [...matching].sort((a, b) => {
      const favDelta = Number(favorites.includes(b.name)) - Number(favorites.includes(a.name));
      return favDelta || a.name.localeCompare(b.name);
    });
  }, [macros, query, favorites]);

  if (!macros.length) return null;

  return (
    <Card title={`Makros (${macros.length})`}>
      {macros.length > 6 && (
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Makro suchen"
            className="pl-9"
          />
        </div>
      )}

      <ul className="divide-y divide-line">
        {filtered.map((macro) => {
          const pinned = favorites.includes(macro.name);
          return (
            <li key={macro.key} className="flex items-center gap-2 py-2">
              <button
                type="button"
                aria-label={pinned ? 'Von Schnellzugriff entfernen' : 'Zum Schnellzugriff'}
                aria-pressed={pinned}
                onClick={() => printer && toggleFavorite(printer.id, macro.name)}
                className="p-1"
              >
                <Star className={`size-4 ${pinned ? 'fill-warn text-warn-ink' : 'text-muted'}`} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{macro.name}</p>
                {macro.description && (
                  <p className="truncate text-[11px] text-muted">{macro.description}</p>
                )}
              </div>
              <button
                type="button"
                aria-label={`${macro.name} ausführen`}
                onClick={() => void sendGcode(macro.name)}
                className="rounded-lg border border-line bg-elevated p-2 active:bg-line"
              >
                <Play className="size-4 text-accent" />
              </button>
            </li>
          );
        })}
      </ul>

      {!filtered.length && <p className="py-3 text-center text-sm text-muted">Nichts gefunden</p>}
    </Card>
  );
}
