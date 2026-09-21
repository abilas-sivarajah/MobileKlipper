import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button, ProgressBar } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';
import { toast } from '@/store/toast';

export function UploadButton({ path, onUploaded }: { path: string; onUploaded: () => void }) {
  const client = usePrinterStore((s) => s.client);
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const upload = async (file: File) => {
    if (!client) return;
    setProgress(0);
    try {
      // "gcodes/sub/dir" -> "sub/dir", which is what the upload endpoint wants.
      const subPath = path === 'gcodes' ? '' : path.slice(7);
      await client.uploadFile(
        file,
        { root: 'gcodes', ...(subPath ? { path: subPath } : {}) },
        setProgress,
      );
      toast.success(`${file.name} hochgeladen`);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gcode,.g,.gco,.ufp,.nc"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {progress == null ? (
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={!client}>
          <Upload className="size-3.5" /> Upload
        </Button>
      ) : (
        <div className="flex w-28 items-center gap-2">
          <ProgressBar value={progress} />
          <span className="tabular text-[11px] text-muted">{Math.round(progress * 100)}%</span>
        </div>
      )}
    </>
  );
}
