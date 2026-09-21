import { ExtrudeCard } from '@/features/control/ExtrudeCard';
import { FansCard } from '@/features/control/FansCard';
import { MacrosCard } from '@/features/control/MacrosCard';
import { MoveCard } from '@/features/control/MoveCard';
import { SpeedFlowCard } from '@/features/control/SpeedFlowCard';
import { SystemCard } from '@/features/control/SystemCard';
import { ZOffsetCard } from '@/features/control/ZOffsetCard';

export default function Control() {
  return (
    <div className="space-y-3 p-3">
      <MoveCard />
      <ZOffsetCard />
      <ExtrudeCard />
      <SpeedFlowCard />
      <FansCard />
      <MacrosCard />
      <SystemCard />
    </div>
  );
}
