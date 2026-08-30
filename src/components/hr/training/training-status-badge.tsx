import { AlertTriangle, CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TrainingStatus } from '@/types';

interface TrainingStatusBadgeProps {
  status: TrainingStatus;
  dueDate: string | null;
}

const STATUS_META: Record<TrainingStatus, { label: string; className: string; icon: typeof Clock }> = {
  not_started: { label: 'Not Started', className: 'bg-slate-100 text-slate-700', icon: Clock },
  in_progress: { label: 'In Progress', className: 'bg-blue-50 text-blue-700', icon: PlayCircle },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
};

/** Overdue/due-soon is always computed live from due_date here — never
 *  a stored status value (migration 089's explicit design decision) —
 *  so this stays correct the instant a record is marked complete, with
 *  no scheduled job involved anywhere. */
export function TrainingStatusBadge({ status, dueDate }: TrainingStatusBadgeProps) {
  if (status !== 'completed' && dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      return (
        <Badge variant="secondary" className="gap-1 bg-red-50 text-red-700">
          <AlertTriangle className="h-3 w-3" />
          Overdue
        </Badge>
      );
    }
    if (daysUntilDue <= 3) {
      return (
        <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700">
          <Clock className="h-3 w-3" />
          Due in {daysUntilDue}d
        </Badge>
      );
    }
  }

  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="secondary" className={`gap-1 ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}
