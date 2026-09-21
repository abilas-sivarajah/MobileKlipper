import { useEffect, useMemo, useState } from 'react';
import { CameraOff, RefreshCw } from 'lucide-react';
import type { WebcamConfig } from '@/moonraker/types';
import { usePrinterStore } from '@/store/printer';

export type StreamMode = 'mjpeg' | 'snapshot' | 'unsupported';

/**
 * Moonraker records which service serves a camera. Continuous MJPEG can go
 * straight into an <img>; "adaptive" and WebRTC services cannot, so those fall
 * back to polling the snapshot endpoint.
 */
export function streamModeFor(service: string | undefined): StreamMode {
  const name = (service ?? '').toLowerCase();
  if (!name || name === 'mjpegstreamer' || name === 'ipstream' || name === 'uv4l-mjpeg') {
    return 'mjpeg';
  }
  if (name === 'mjpegstreamer-adaptive') return 'snapshot';
  return 'unsupported';
}

export function WebcamView({
  webcam,
  className = '',
}: {
  webcam: WebcamConfig;
  className?: string;
}) {
  const client = usePrinterStore((s) => s.client);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);

  const mode = streamModeFor(webcam.service);
  const fps = Math.min(30, Math.max(1, webcam.target_fps ?? 10));

  const src = useMemo(() => {
    if (!client) return '';
    const raw = mode === 'mjpeg' ? webcam.stream_url : webcam.snapshot_url;
    const url = client.resolveUrl(raw || webcam.stream_url);
    if (mode === 'mjpeg') return url;
    // Snapshot mode needs a fresh URL per frame or the browser serves the cache.
    return `${url}${url.includes('?') ? '&' : '?'}_=${tick}`;
  }, [client, webcam, mode, tick]);

  useEffect(() => {
    if (mode === 'mjpeg') return;
    const id = setInterval(() => setTick(Date.now()), 1000 / fps);
    return () => clearInterval(id);
  }, [mode, fps]);

  useEffect(() => setFailed(false), [webcam.uid, webcam.stream_url]);

  const transform = [
    webcam.flip_horizontal ? 'scaleX(-1)' : '',
    webcam.flip_vertical ? 'scaleY(-1)' : '',
    webcam.rotation ? `rotate(${webcam.rotation}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (failed) {
    return (
      <div
        className={`flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-line bg-elevated text-muted ${className}`}
      >
        <CameraOff className="size-8" />
        <p className="text-sm">Stream nicht erreichbar</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setTick(Date.now());
          }}
          className="flex items-center gap-1 text-xs text-accent"
        >
          <RefreshCw className="size-3.5" /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-black ${className}`}>
      <img
        src={src}
        alt={`Kamerabild ${webcam.name}`}
        className="w-full object-contain"
        style={transform ? { transform } : undefined}
        onError={() => setFailed(true)}
      />
      {mode === 'unsupported' && (
        <p className="bg-warn/10 px-3 py-1.5 text-[11px] text-warn">
          {webcam.service} wird noch nicht nativ unterstützt – es werden Einzelbilder geladen.
        </p>
      )}
    </div>
  );
}
