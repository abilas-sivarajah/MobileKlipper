import { useEffect, useState } from 'react';
import { Cpu, TriangleAlert } from 'lucide-react';
import { Card, ProgressBar, Row } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { cpuUsage, memoryUsage, throttleWarnings } from '@/lib/system';
import type { SystemInfo } from '@/moonraker/types';
import { usePrinterStore } from '@/store/printer';

export function HostCard() {
  const client = usePrinterStore((s) => s.client);
  const connection = usePrinterStore((s) => s.connection);
  const stats = usePrinterStore((s) => s.procStats);
  const printerInfo = usePrinterStore((s) => s.printerInfo);
  const serverInfo = usePrinterStore((s) => s.serverInfo);
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (!client || connection !== 'open') return;
    let cancelled = false;
    client
      .systemInfo()
      .then((r) => !cancelled && setInfo(r.system_info))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, connection]);

  const cpu = cpuUsage(stats);
  const mem = memoryUsage(stats);
  const warnings = throttleWarnings(stats);
  const model = (info?.cpu_info?.model as string | undefined) || (info?.cpu_info?.cpu_desc as string | undefined);
  const distro = info?.distribution?.name as string | undefined;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Cpu className="size-4 text-muted" /> Host
        </span>
      }
    >
      {warnings.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-xl border border-warn/40 bg-warn/10 p-3">
          {warnings.map((w) => (
            <li key={w.text} className="flex items-start gap-2 text-xs text-warn-ink">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {w.text}
                {w.active ? ' (jetzt)' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {cpu != null && (
        <div className="py-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted">CPU</span>
            <span className="tabular">{cpu.toFixed(0)} %</span>
          </div>
          <ProgressBar value={cpu / 100} tone={cpu > 85 ? 'warn' : 'accent'} className="mt-1 h-1.5" />
        </div>
      )}
      {mem != null && (
        <div className="py-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Arbeitsspeicher</span>
            <span className="tabular">{Math.round(mem * 100)} %</span>
          </div>
          <ProgressBar value={mem} tone={mem > 0.9 ? 'warn' : 'accent'} className="mt-1 h-1.5" />
        </div>
      )}
      <div className="divide-y divide-line">
        {stats?.cpu_temp != null && <Row label="CPU-Temperatur" value={`${stats.cpu_temp.toFixed(1)} °C`} />}
        {stats?.system_uptime != null && (
          <Row label="Laufzeit" value={formatDuration(stats.system_uptime, true)} />
        )}
        {model && <Row label="Hardware" value={model} />}
        {distro && <Row label="System" value={distro} />}
        <Row label="Hostname" value={printerInfo?.hostname ?? '--'} />
        <Row label="Klipper" value={printerInfo?.software_version ?? '--'} />
        <Row label="Moonraker" value={serverInfo?.moonraker_version ?? '--'} />
        {stats?.websocket_connections != null && (
          <Row label="Verbundene Clients" value={stats.websocket_connections} />
        )}
      </div>
    </Card>
  );
}
