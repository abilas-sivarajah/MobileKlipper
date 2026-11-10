import { Link } from 'react-router-dom';
import { ChevronRight, Cpu, FileCog, History, Ruler, Settings, type LucideIcon } from 'lucide-react';
import { throttleWarnings } from '@/lib/system';
import { Card } from '@/components/ui';
import { usePrinterStore } from '@/store/printer';

interface Entry {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  badge?: string | undefined;
}

export default function MorePage() {
  const savePending = usePrinterStore((s) => s.status.configfile?.save_config_pending === true);
  const hostWarning = usePrinterStore((s) => throttleWarnings(s.procStats).some((w) => w.active));

  const entries: Entry[] = [
    {
      to: '/calibrate',
      label: 'Kalibrieren & Leveling',
      hint: 'Bettschrauben, Bed Mesh, Z-Offset, PID, Input Shaper',
      icon: Ruler,
      badge: savePending ? 'ungespeichert' : undefined,
    },
    {
      to: '/config',
      label: 'Konfiguration',
      hint: 'printer.cfg & Co. bearbeiten, Logs herunterladen',
      icon: FileCog,
    },
    {
      to: '/system',
      label: 'System & Strom',
      hint: 'Steckdosen, Host-Zustand, Updates, Neustarts',
      icon: Cpu,
      badge: hostWarning ? 'Warnung' : undefined,
    },
    { to: '/history', label: 'Druckverlauf', hint: 'Vergangene Drucke und Statistik', icon: History },
    { to: '/settings', label: 'Einstellungen', hint: 'Drucker, Darstellung, Verhalten', icon: Settings },
  ];

  return (
    <div className="space-y-3 p-3">
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {entries.map(({ to, label, hint, icon: Icon, badge }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 px-4 py-3 active:bg-elevated">
                <Icon className="size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="truncate text-[11px] text-muted">{hint}</p>
                </div>
                {badge && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                    {badge}
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
