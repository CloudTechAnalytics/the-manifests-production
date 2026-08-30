'use client';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TrainingStatusBadge } from '@/components/hr/training/training-status-badge';
import type { EmployeeTraining } from '@/types';

interface MyLearningRowProps {
  record: EmployeeTraining;
  onChanged: () => void;
}

/** Mark Started / Mark Complete — a plain update; the guard trigger
 *  (migration 089) fills started_at/completed_at/certificate_expiry_date
 *  server-side, never trusting these from the client. */
export function MyLearningRow({ record, onChanged }: MyLearningRowProps) {
  const [updating, setUpdating] = useState(false);

  const updateStatus = async (status: 'in_progress' | 'completed') => {
    setUpdating(true);
    try {
      const { error } = await supabase.from('employee_training').update({ status }).eq('id', record.id);
      if (error) throw new Error(error.message);
      toast.success(status === 'completed' ? 'Marked complete' : 'Marked in progress');
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update'));
    } finally {
      setUpdating(false);
    }
  };

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
            onClick={() => updateStatus(record.status === 'not_started' ? 'in_progress' : 'completed')}
          >
            {updating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {record.status === 'not_started' ? 'Start' : 'Mark Complete'}
          </Button>
        )}
      </div>
    </div>
  );
}
