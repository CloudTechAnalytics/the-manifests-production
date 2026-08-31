'use client';

import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { updateTrainingRecordStatus } from '@/features/hr/services/training.service';
import { Button } from '@/shared/components/ui/button';
import { TrainingStatusBadge } from '@/features/hr/components/training/training-status-badge';
import type { EmployeeTraining } from '@/shared/types';

interface MyLearningRowProps {
  record: EmployeeTraining;
  onChanged: () => void;
}

/** Mark Started / Mark Complete — a plain update; the guard trigger
 *  (migration 089) fills started_at/completed_at/certificate_expiry_date
 *  server-side, never trusting these from the client. */
export function MyLearningRow({ record, onChanged }: MyLearningRowProps) {
  const updateMutation = useMutation({
    mutationFn: (status: 'in_progress' | 'completed') => updateTrainingRecordStatus(record.id, status),
    onSuccess: (_result, status) => {
      toast.success(status === 'completed' ? 'Marked complete' : 'Marked in progress');
      onChanged();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update'));
    },
  });
  const updating = updateMutation.isPending;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <Link to={`/hr/training/courses/${record.course_id}`} className="text-sm font-medium hover:underline">
          {record.course?.title ?? 'Course'}
        </Link>
        <p className="text-xs text-muted-foreground">
          {record.assigned_by ? 'Assigned by HR' : 'Self-enrolled'}
          {record.due_date && ` · Due ${record.due_date}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <TrainingStatusBadge status={record.status} dueDate={record.due_date} />
        {record.status !== 'completed' && (
          <Button
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => updateMutation.mutate(record.status === 'not_started' ? 'in_progress' : 'completed')}
          >
            {updating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {record.status === 'not_started' ? 'Start' : 'Mark Complete'}
          </Button>
        )}
      </div>
    </div>
  );
}
