import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  FileCode2,
  Folder,
  History,
  Image as ImageIcon,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button, Card, EmptyState, SegmentedControl, Spinner, TextInput } from '@/components/ui';
import { FileDetailSheet } from '@/features/files/FileDetailSheet';
import { UploadButton } from '@/features/files/UploadButton';
import { useDirectory } from '@/features/files/useDirectory';
import { usePrinterStore } from '@/store/printer';
import type { DirectoryFile } from '@/moonraker/types';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  stripGcodeExtension,
} from '@/lib/format';

type SortKey = 'date' | 'name' | 'size';
const SORTS: SortKey[] = ['date', 'name', 'size'];
const SORT_LABELS: Record<SortKey, string> = { date: 'Datum', name: 'Name', size: 'Größe' };

export default function FilesPage() {
  const client = usePrinterStore((s) => s.client);
  const [path, setPath] = useState('gcodes');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [selected, setSelected] = useState<DirectoryFile | null>(null);
  const { data, loading, error, reload } = useDirectory(path);

  const segments = path.split('/');

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (data?.files ?? []).filter((f) =>
      needle ? f.filename.toLowerCase().includes(needle) : true,
    );
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.filename.localeCompare(b.filename);
      if (sort === 'size') return b.size - a.size;
      return b.modified - a.modified;
    });
  }, [data, query, sort]);

  const thumbnailFor = (file: DirectoryFile): string | null => {
    const thumbs = file.thumbnails;
    if (!thumbs?.length || !client) return null;
    // Smallest thumbnail that still looks sharp in a 48 px list row.
    const sorted = [...thumbs].sort((a, b) => a.width - b.width);
    const pick = sorted.find((t) => t.width >= 96) ?? sorted.at(-1)!;
    const relative = path === 'gcodes' ? file.filename : `${path.slice(7)}/${file.filename}`;
    return client.thumbnailUrl(relative, pick.relative_path);
  };

  return (
    <div className="space-y-3 p-3">
      <Card padded={false}>
        <div className="flex items-center gap-2 border-b border-line p-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dateien suchen"
              className="pl-9"
            />
          </div>
          <UploadButton path={path} onUploaded={reload} />
          <Button size="sm" onClick={reload} aria-label="Aktualisieren">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="space-y-2 px-3 py-2">
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs">
            {segments.map((segment, index) => {
              const target = segments.slice(0, index + 1).join('/');
              const isLast = index === segments.length - 1;
              return (
                <span key={target} className="flex shrink-0 items-center gap-1">
                  {index > 0 && <ChevronRight className="size-3 text-muted" />}
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => setPath(target)}
                    className={isLast ? 'text-ink' : 'text-accent'}
                  >
                    {index === 0 ? 'G-Code' : segment}
                  </button>
                </span>
              );
            })}
          </nav>
          <SegmentedControl
            options={SORTS}
            value={sort}
            onChange={setSort}
            formatLabel={(key) => SORT_LABELS[key]}
          />
        </div>
      </Card>

      {error && (
        <Card>
          <p className="text-sm text-danger-ink">{error}</p>
        </Card>
      )}

      <Card padded={false}>
        {loading && !data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !data?.dirs.length && !files.length ? (
          <EmptyState
            icon={<FileCode2 className="size-8" />}
            title="Keine Dateien"
            description={query ? 'Nichts gefunden.' : 'Lade eine G-Code-Datei hoch, um zu starten.'}
          />
        ) : (
          <ul className="divide-y divide-line">
            {data?.dirs.map((dir) => (
              <li key={dir.dirname}>
                <button
                  type="button"
                  onClick={() => setPath(`${path}/${dir.dirname}`)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-elevated"
                >
                  <Folder className="size-5 shrink-0 text-accent" />
                  <span className="flex-1 truncate text-sm">{dir.dirname}</span>
                  <ChevronRight className="size-4 text-muted" />
                </button>
              </li>
            ))}

            {files.map((file) => {
              const thumbnail = thumbnailFor(file);
              return (
                <li key={file.filename}>
                  <button
                    type="button"
                    onClick={() => setSelected(file)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-elevated"
                  >
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-elevated">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted">
                          <ImageIcon className="size-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{stripGcodeExtension(file.filename)}</p>
                      <p className="truncate text-[11px] text-muted tabular">
                        {formatBytes(file.size)}
                        {file.estimated_time ? ` · ${formatDuration(file.estimated_time, true)}` : ''}
                        {` · ${formatDateTime(file.modified)}`}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between px-1 text-[11px] text-muted">
        <Link to="/history" className="flex items-center gap-1 text-accent">
          <History className="size-3.5" /> Druckverlauf
        </Link>
        {data?.disk_usage && (
          <span className="tabular">
            {formatBytes(data.disk_usage.free)} frei von {formatBytes(data.disk_usage.total)}
          </span>
        )}
      </div>

      <FileDetailSheet
        file={selected}
        path={path}
        onClose={() => setSelected(null)}
        onDeleted={reload}
      />
    </div>
  );
}
