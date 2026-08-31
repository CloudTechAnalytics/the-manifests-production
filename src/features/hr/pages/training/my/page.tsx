'use client';

import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ListChecks, Loader2 } from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { fetchMyLearning } from '@/features/hr/services/training.service';
import { MyLearningRow } from '@/features/hr/components/training/my-learning-row';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';

/** The signed-in employee's own current-per-course training rows —
 *  self-enrolled and HR-assigned together. "Current" per course is
 *  whichever row has the latest created_at (history is kept for
 *  recertification, see migration 089's design note). */
export default function MyLearningPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['my-learning', profile?.id],
    queryFn: () => fetchMyLearning(profile!.id),
    enabled: !!profile,
  });

  const records = data?.records ?? [];
  const hasEmployeeRecord = data?.hasEmployeeRecord ?? true;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-learning', profile?.id] });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link to="/hr/training">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <ListChecks className="h-6 w-6 text-blue-600" />
            My Learning
          </h1>
          <p className="text-sm text-muted-foreground">Everything assigned to you or you&apos;ve enrolled in.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : !hasEmployeeRecord ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You don&apos;t have an Employee record linked to your account yet — ask HR to link one.
          </CardContent>
        </Card>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing assigned yet.{' '}
            <Link to="/hr/training" className="text-primary hover:underline">
              Browse the catalog
            </Link>{' '}
            to self-enroll in something.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <MyLearningRow key={r.id} record={r} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
