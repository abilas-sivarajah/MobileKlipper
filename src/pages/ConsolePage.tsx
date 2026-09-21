import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Filter, SendHorizonal } from 'lucide-react';
import { Button, TextInput } from '@/components/ui';
import { usePrinterStore, type ConsoleLine } from '@/store/printer';
import { useUiStore } from '@/store/ui';
import { completionsFor, isTemperatureReply } from '@/lib/console';
import { getMacros } from '@/lib/derive';

const KIND_CLASS: Record<ConsoleLine['kind'], string> = {
  command: 'text-accent',
  response: 'text-ink',
  info: 'text-muted',
  error: 'text-danger-ink',
};

export default function ConsolePage() {
  const lines = usePrinterStore((s) => s.console);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const clearConsole = usePrinterStore((s) => s.clearConsole);
  const status = usePrinterStore((s) => s.status);
  const hideTemps = useUiStore((s) => s.hideTemperatureReplies);
  const toggle = useUiStore((s) => s.toggle);

  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const macros = useMemo(() => getMacros(status, true).map((m) => m.name), [status]);
  const suggestions = useMemo(() => completionsFor(input, macros), [input, macros]);

  const visible = useMemo(
    () => (hideTemps ? lines.filter((l) => !isTemperatureReply(l.message)) : lines),
    [lines, hideTemps],
  );

  // Autoscroll only while the user is already at the bottom, so reading back
  // through the log is not yanked away by incoming responses.
  useEffect(() => {
    const el = logRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const submit = async () => {
    const command = input.trim();
    if (!command) return;
    setInput('');
    setHistory((h) => [command, ...h.filter((c) => c !== command)].slice(0, 50));
    setHistoryIndex(-1);
    await sendGcode(command);
  };

  const recall = (direction: 1 | -1) => {
    const next = historyIndex + direction;
    if (next < -1 || next >= history.length) return;
    setHistoryIndex(next);
    setInput(next === -1 ? '' : (history[next] ?? ''));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button
          size="sm"
          tone={hideTemps ? 'accent' : 'default'}
          onClick={() => toggle('hideTemperatureReplies')}
        >
          <Filter className="size-3.5" /> Temperaturen
        </Button>
        <span className="flex-1 text-[11px] text-muted tabular">
          {visible.length} Zeilen
        </span>
        <Button size="sm" onClick={clearConsole} aria-label="Konsole leeren">
          <Eraser className="size-3.5" />
        </Button>
      </div>

      <div
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 overflow-y-auto overscroll-contain px-3 pb-2 font-mono text-[11px] leading-relaxed"
      >
        {visible.map((line) => (
          <p key={line.id} className={`whitespace-pre-wrap break-words ${KIND_CLASS[line.kind]}`}>
            <span className="mr-2 text-muted/60">
              {new Date(line.time * 1000).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            {line.kind === 'command' ? '> ' : ''}
            {line.message}
          </p>
        ))}
        {!visible.length && (
          <p className="py-8 text-center text-muted">Noch keine Ausgaben.</p>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar border-t border-line px-3 py-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setInput(suggestion)}
              className="shrink-0 rounded-lg border border-line bg-elevated px-2 py-1 font-mono text-[11px]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-line bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              recall(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              recall(-1);
            } else if (e.key === 'Tab' && suggestions[0]) {
              e.preventDefault();
              setInput(suggestions[0]);
            }
          }}
          placeholder="G-Code eingeben"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 font-mono"
        />
        <Button type="submit" tone="accent" disabled={!input.trim()} aria-label="Senden">
          <SendHorizonal className="size-4" />
        </Button>
      </form>
    </div>
  );
}
