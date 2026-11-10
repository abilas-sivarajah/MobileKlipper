import { useEffect, useState } from 'react';
import { Flame, Printer, Trash2 } from 'lucide-react';
import { PreheatSheet } from '@/features/dashboard/PreheatSheet';
import { metadataTemps } from '@/lib/preheat';
import { Button, Row, Sheet, Spinner } from '@/components/ui';
import type { DirectoryFile } from '@/moonraker/types';
import { usePrinterStore } from '@/store/printer';
import { confirmAction } from '@/store/confirm';
import { toast } from '@/store/toast';
import {
  basename,
  filamentGrams,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatLength,
  stripGcodeExtension,
} from '@/lib/format';
import { isPrinting } from '@/lib/derive';

export function FileDetailSheet({
  file,
  path,
  onClose,
  onDeleted,
}: {
  file: DirectoryFile | null;
  path: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const client = usePrinterStore((s) => s.client);
  const printing = usePrinterStore((s) => isPrinting(s.status));
  const [busy, setBusy] = useState(false);
  const [preheatOpen, setPreheatOpen] = useState(false);

  const relativePath = file
    ? path === 'gcodes'
      ? file.filename
      : `${path.slice(7)}/${file.filename}`
    : '';

  // A directory listing can predate Moonraker's metadata scan, so a file may
  // arrive without thumbnails or slicer fields; fetch them on open.
  const [detail, setDetail] = useState<DirectoryFile | null>(file);
  useEffect(() => {
    setDetail(file);
    if (!file || !client || file.thumbnails?.length) return;
    let cancelled = false;
    client
      .metadata(relativePath)
      .then((meta) => {
        if (!cancelled) setDetail({ ...file, ...meta });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file, client, relativePath]);

  if (!file) return null;

  const info = detail ?? file;
  const fileTemps = metadataTemps(info);
  const thumbnail = info.thumbnails?.length
    ? client?.thumbnailUrl(
        relativePath,
        [...info.thumbnails].sort((a, b) => b.width - a.width)[0]!.relative_path,
      )
    : null;

  const startPrint = async () => {
    if (printing) {
      toast.warning('Es läuft bereits ein Druck');
      return;
    }
    const ok = await confirmAction({
      title: 'Druck starten?',
      message: stripGcodeExtension(basename(relativePath)),
      confirmLabel: 'Drucken',
      tone: 'accent',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await client?.startPrint(relativePath);
      toast.success('Druck gestartet');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Start fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Datei löschen?',
      message: relativePath,
      confirmLabel: 'Löschen',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await client?.deleteFile(`gcodes/${relativePath}`);
      toast.success('Datei gelöscht');
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title={stripGcodeExtension(file.filename)} onClose={onClose}>
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="mb-3 aspect-square w-full rounded-xl border border-line bg-elevated object-contain"
          loading="lazy"
        />
      )}

      <div className="divide-y divide-line">
        <Row label="Größe" value={formatBytes(info.size)} />
        <Row label="Geändert" value={formatDateTime(info.modified)} />
        <Row label="Druckzeit (Slicer)" value={formatDuration(info.estimated_time, true)} />
        <Row label="Filament" value={formatLength(info.filament_total)} />
        <Row
          label="Gewicht"
          value={
            info.filament_weight_total
              ? `${info.filament_weight_total.toFixed(1)} g`
              : `ca. ${filamentGrams(info.filament_total)}`
          }
        />
        {fileTemps && (
          <Row
            label="Erste Schicht"
            value={`${fileTemps.extruder ?? '--'}° / ${fileTemps.bed ?? '--'}°`}
          />
        )}
        <Row label="Höhe" value={info.object_height ? `${info.object_height} mm` : '--'} />
        <Row
          label="Schichthöhe"
          value={info.layer_height ? `${info.layer_height} mm` : '--'}
        />
        <Row label="Material" value={info.filament_type ?? '--'} />
        <Row label="Slicer" value={info.slicer ? `${info.slicer} ${info.slicer_version ?? ''}` : '--'} />
      </div>

      <div className="mt-4 flex gap-2">
        <Button tone="danger" onClick={() => void remove()} disabled={busy} aria-label="Löschen">
          <Trash2 className="size-4" />
        </Button>
        <Button onClick={() => setPreheatOpen(true)} disabled={printing} aria-label="Vorheizen">
          <Flame className="size-4" />
        </Button>
        <Button block tone="accent" onClick={() => void startPrint()} disabled={busy || printing}>
          {busy ? <Spinner /> : <Printer className="size-4" />} Drucken
        </Button>
      </div>
      <PreheatSheet
        open={preheatOpen}
        onClose={() => setPreheatOpen(false)}
        fileTemps={fileTemps}
        fileLabel="Wie in Datei"
      />
    </Sheet>
  );
}
