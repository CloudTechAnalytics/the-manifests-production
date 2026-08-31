'use client';

import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Award,
  Clock,
  Edit,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { getCourseMaterialSignedUrl } from '@/shared/lib/utils/course-material-upload';
import {
  enrollInCourse,
  fetchCourseDetail,
  fetchCourseManageOptions,
} from '@/features/hr/services/training.service';
import { AssignTrainingDialog } from '@/features/hr/components/training/assign-training-dialog';
import { TrainingStatusBadge } from '@/features/hr/components/training/training-status-badge';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import type { AssignTrainingResult, CourseMaterial } from '@/shared/types';

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id as string;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('hr_manager') || hasRole('hr_officer');

  const detailQuery = useQuery({
    queryKey: ['training-courses', courseId, 'detail'],
    queryFn: () => fetchCourseDetail(courseId, profile?.id),
    enabled: !!courseId,
  });

  const manageOptionsQuery = useQuery({
    queryKey: ['training-courses', courseId, 'manage-options'],
    queryFn: fetchCourseManageOptions,
    enabled: canManage,
  });

  const course = detailQuery.data?.course ?? null;
  const materials = detailQuery.data?.materials ?? [];
  const roster = detailQuery.data?.roster ?? [];
  const myEmployeeId = detailQuery.data?.myEmployeeId ?? null;
  const myEnrollment = detailQuery.data?.myEnrollment ?? null;
  const employeeOptions = manageOptionsQuery.data?.employeeOptions ?? [];
  const departments = manageOptionsQuery.data?.departments ?? [];
  const branches = manageOptionsQuery.data?.branches ?? [];
  const loading = detailQuery.isLoading;

  const enrollMutation = useMutation({
    mutationFn: () => {
      if (!myEmployeeId || !course) {
        throw new Error('You need an Employee record linked to your account to enroll.');
      }
      return enrollInCourse(myEmployeeId, course.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-courses', courseId] });
      toast.success('Enrolled — find it under My Learning.');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to enroll'));
    },
  });

  const handleAssigned = (result: AssignTrainingResult) => {
    void result;
    queryClient.invalidateQueries({ queryKey: ['training-courses', courseId] });
  };

  const openMaterial = async (material: CourseMaterial) => {
    if (material.material_type === 'link' && material.external_url) {
      window.open(material.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (material.file_path) {
      const url = await getCourseMaterialSignedUrl(material.file_path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast.error('Could not open this file.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/hr/training">Training</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{course.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/hr/training')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 page-title">
              <GraduationCap className="h-6 w-6 text-blue-600" />
              {course.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {course.category && <Badge variant="outline">{course.category}</Badge>}
              {course.provider && <span>{course.provider}</span>}
              {course.estimated_duration_minutes != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {course.estimated_duration_minutes} min
                </span>
              )}
              {course.is_certification && (
                <span className="inline-flex items-center gap-1">
                  <Award className="h-3 w-3" /> Certification · valid {course.certification_validity_months} mo
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {myEnrollment ? (
            <TrainingStatusBadge status={myEnrollment.status} dueDate={myEnrollment.due_date} />
          ) : (
            <Button size="sm" variant="outline" onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending || !myEmployeeId}>
              {enrollMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enroll
            </Button>
          )}
          {canManage && (
            <>
              <Link to={`/hr/training/courses/${course.id}/edit`}>
                <Button size="sm" variant="outline">
                  <Edit className="mr-1.5 h-4 w-4" />
                  Edit
                </Button>
              </Link>
              <AssignTrainingDialog
                courseId={course.id}
                employees={employeeOptions}
                departments={departments}
                branches={branches}
                onAssigned={handleAssigned}
              />
            </>
          )}
        </div>
      </div>

      {course.description && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">{course.description}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Materials</CardTitle>
        </CardHeader>
        <CardContent>
          {materials.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No materials attached.</p>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openMaterial(m)}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left text-sm transition-colors hover:bg-accent/40"
                >
                  <span className="flex items-center gap-2">
                    {m.material_type === 'link' ? <ExternalLink className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    {m.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Roster</CardTitle>
            <CardDescription>Who&apos;s assigned or enrolled, and where they stand.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {roster.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nobody assigned or enrolled yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.assigned_by ? 'HR-assigned' : 'Self-enrolled'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.due_date ?? '—'}</TableCell>
                      <TableCell>
                        <TrainingStatusBadge status={r.status} dueDate={r.due_date} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!myEmployeeId && (
        <p className="text-xs text-muted-foreground">
          <UserPlus className="mr-1 inline h-3.5 w-3.5" />
          You don&apos;t have an Employee record linked to your account yet — ask HR to link one so you can self-enroll.
        </p>
      )}
    </div>
  );
}
