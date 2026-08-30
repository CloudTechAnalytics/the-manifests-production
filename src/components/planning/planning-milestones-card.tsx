'use client';

import { Check, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlanningMilestone } from '@/lib/utils/planning';

interface PlanningMilestonesCardProps {
  milestones: PlanningMilestone[];
}

export function PlanningMilestonesCard({ milestones }: PlanningMilestonesCardProps) {
  const doneCount = milestones.filter((m) => m.done).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Milestones</CardTitle>
        <span className="text-xs text-muted-foreground">
          {doneCount} / {milestones.length} complete
        </span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {milestones.map((m) => (
            <li key={m.key} className="flex items-center gap-2.5 text-sm">
              {m.done ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Circle className="h-3 w-3" />
                </span>
              )}
              <span className={m.done ? 'text-foreground' : 'text-muted-foreground'}>{m.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
