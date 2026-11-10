import { SystemCard } from '@/features/control/SystemCard';
import { HostCard } from '@/features/system/HostCard';
import { PowerCard } from '@/features/system/PowerCard';
import { UpdatesCard } from '@/features/system/UpdatesCard';

export default function SystemPage() {
  return (
    <div className="space-y-3 p-3">
      <PowerCard />
      <HostCard />
      <UpdatesCard />
      <SystemCard />
    </div>
  );
}
