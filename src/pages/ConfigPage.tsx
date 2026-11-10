import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileCog, FileText, RefreshCw, RotateCw, Save } from 'lucide-react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { isPrinting } from '@/lib/derive';
import { formatBytes, formatDateTime } from '@/lib/format';
import { configSectionsOf } from '@/lib/system';
import type { DirectoryFile, FileEntry } from '@/moonraker/types';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';
import { toast } from '@/store/toast';

/**
 * Edits Klipper and Moonraker config files in place. Saving uploads the file
 * back into the config root; Klipper only picks changes up after a restart.
 */
export default function ConfigPage() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? <Editor path={open} onClose={() => setOpen(null)} /> : <FileList onOpen={setOpen} />;
}

function FileList({ onOpen }: { onOpen: (path: string) => void }) {
  const client = usePrinterStore((s) => s.client);
  const connection = usePrinterStore((s) => s.connection);
  const [files, setFiles] = useState<DirectoryFile[] | null>(null);
  const [logs, setLogs] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!client || connection !== 'open') return;
    let cancelled = false;
    setError(null);
    Promise.allSettled([client.getDirectory('config', false), client.listFiles('logs')]).then(
      ([dir, logList]) => {
        if (cancelled) return;
        if (dir.status === 'fulfilled') {
          setFiles(
            [...dir.value.files].sort((a, b) =>
              a.filename === 'printer.cfg' ? -1 : b.filename === 'printer.cfg' ? 1 : a.filename.localeCompare(b.filename),
            ),
          );
        } else {
          setError(dir.reason instanceof Error ? dir.reason.message : String(dir.reason));
        }
        if (logList.status === 'fulfilled') setLogs(logList.value.filter((l) => l.path.endsWith('.log')));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, connection, reload]);

  return (
    <div className="space-y-3 p-3">
      <Card
        title="Konfiguration"
        padded={false}
        action={
          <Button size="sm" onClick={() => setReload((n) => n + 1)} aria-label="Aktualisieren">
            <RefreshCw className="size-3.5" />
          </Button>
        }
      >
        {error && <p className="p-4 text-sm text-danger-ink">{error}</p>}
        {!files && !error ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : files && !files.length ? (
          <EmptyState icon={<FileCog className="size-8" />} title="Keine Konfigurationsdateien" />
        ) : (
          <ul className="divide-y divide-line">
            {files?.map((file) => (
              <li key={file.filename}>
                <button
                  type="button"
                  onClick={() => onOpen(file.filename)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-elevated"
                >
                  <FileCog className="size-5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{file.filename}</p>
                    <p className="text-[11px] text-muted tabular">
                      {formatBytes(file.size)} · {formatDateTime(file.modified)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {logs.length > 0 && client && (
        <Card title="Logs" padded={false}>
          <ul className="divide-y divide-line">
            {logs.map((log) => (
              <li key={log.path}>
                <a
                  href={client.fileUrl('logs', log.path)}
                  download={log.path}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 px-4 py-3 active:bg-elevated"
                >
                  <FileText className="size-5 shrink-0 text-muted" />
                  <span className="flex-1 truncate font-mono text-sm">{log.path}</span>
                  <span className="text-[11px] text-muted tabular">{formatBytes(log.size)}</span>
                  <Download className="size-4 text-accent" />
                </a>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-[11px] text-muted">
            klippy.log hilft bei Fehlern wie „MCU shutdown" – bei Fragen im Forum immer mitschicken.
          </p>
        </Card>
      )}
    </div>
  );
}

function Editor({ path, onClose }: { path: string; onClose: () => void }) {
  const client = usePrinterStore((s) => s.client);
  const printing = usePrinterStore((s) => isPrinting(s.status));
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = original != null && text !== original;
  const isKlipperConfig = path.endsWith('.cfg');

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client
      .fetchText('config', path)
      .then((content) => {
        if (cancelled) return;
        setOriginal(content);
        setText(content);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [client, path]);

  // Losing an edit to a stray back-swipe hurts; ask the browser to warn.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const sections = useMemo(() => configSectionsOf(text), [text]);

  const jumpTo = (index: number) => {
    const area = areaRef.current;
    const section = sections[index];
    if (!area || !section) return;
    area.focus({ preventScroll: true });
    area.setSelectionRange(section.offset, section.offset);
    const lineHeight = Number.parseFloat(getComputedStyle(area).lineHeight) || 16;
    area.scrollTop = Math.max(0, section.line * lineHeight - lineHeight);
  };

  const close = async () => {
    if (dirty) {
      const ok = await confirmAction({
        title: 'Änderungen verwerfen?',
        message: `${path} hat ungespeicherte Änderungen.`,
        confirmLabel: 'Verwerfen',
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = async (restart: boolean) => {
    if (!client) return;
    if (restart && printing) {
      toast.warning('Während eines Drucks kein Neustart – erst nur speichern');
      return;
    }
    setSaving(true);
    try {
      await client.saveText('config', path, text);
      setOriginal(text);
      toast.success(`${path} gespeichert`);
      if (restart) {
        if (path === 'moonraker.conf') await client.restartService('moonraker');
        else await sendGcode('FIRMWARE_RESTART');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Button size="sm" tone="ghost" onClick={() => void close()} aria-label="Zurück">
          <ArrowLeft className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-sm">
          {path}
          {dirty && <span className="ml-1 text-accent">●</span>}
        </p>
        <Button size="sm" onClick={() => void save(false)} disabled={!dirty || saving}>
          <Save className="size-3.5" /> Speichern
        </Button>
        <Button
          size="sm"
          tone="accent"
          onClick={() => void save(true)}
          disabled={saving || printing || (!dirty && !isKlipperConfig)}
          title={path === 'moonraker.conf' ? 'Speichern und Moonraker neu starten' : 'Speichern und FIRMWARE_RESTART'}
          aria-label="Speichern und neu starten"
        >
          <RotateCw className="size-3.5" />
        </Button>
      </div>

      {sections.length > 1 && (
        <div className="border-b border-line px-3 py-2">
          <select
            aria-label="Zu Abschnitt springen"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-ink"
            value=""
            onChange={(e) => jumpTo(Number(e.target.value))}
          >
            <option value="" disabled>
              Zu Abschnitt springen ({sections.length})
            </option>
            {sections.map((s, i) => (
              <option key={`${s.name}-${s.line}`} value={i}>
                [{s.name}]
              </option>
            ))}
          </select>
        </div>
      )}

      {error ? (
        <p className="p-4 text-sm text-danger-ink">{error}</p>
      ) : original == null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          wrap="off"
          aria-label={`Inhalt von ${path}`}
          className="min-h-0 flex-1 resize-none bg-bg p-3 font-mono text-[12px] leading-5 text-ink focus:outline-none"
        />
      )}
      {printing && (
        <p className="border-t border-line px-3 py-2 text-[11px] text-warn-ink">
          Es läuft ein Druck: Speichern geht, der Neustart erst danach.
        </p>
      )}
    </div>
  );
}
