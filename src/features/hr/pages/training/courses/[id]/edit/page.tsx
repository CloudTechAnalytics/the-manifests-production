'use client';

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, GraduationCap, Loader2, Trash2, Upload, Link as LinkIcon } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { COURSE_FORM_DEFAULTS, courseSchema, type CourseFormValues } from '@/shared/lib/course-schema';
import { fetchCourseEditData, updateCourse } from '@/features/hr/services/training.service';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Switch } from '@/shared/components/ui/switch';
import { Separator } from '@/shared/components/ui/separator';
import { Checkbox } from '@/shared/components/ui/checkbox';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
  { value: 'customs', label: 'Customs' },
  { value: 'planning', label: 'Planning' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'examination', label: 'Examination' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'transport', label: 'Transport' },
];

export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id as string;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [materialFiles, setMaterialFiles] = useState<Record<number, File | undefined>>({});
  const [existingMaterialIds, setExistingMaterialIds] = useState<string[]>([]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: COURSE_FORM_DEFAULTS,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'materials' });
  const isCertification = watch('is_certification');
  const targetRoles = watch('target_roles');

  const toggleRole = (role: string, checked: boolean, onChange: (v: string[]) => void) => {
    onChange(checked ? [...targetRoles, role] : targetRoles.filter((r) => r !== role));
  };

  const { data, isLoading: loading } = useQuery({
    queryKey: ['training-courses', courseId, 'edit-form'],
    queryFn: () => fetchCourseEditData(courseId),
    enabled: !!courseId,
  });

  useEffect(() => {
    if (!data) return;
    const { course, materials } = data;
    if (!course) {
      toast.error('Course not found.');
      return;
    }
    setExistingMaterialIds(materials.map((m) => m.id));
    reset({
      title: course.title,
      description: course.description ?? '',
      category: course.category ?? '',
      target_roles: course.target_roles,
      provider: course.provider ?? '',
      estimated_duration_minutes: course.estimated_duration_minutes ?? undefined,
      is_certification: course.is_certification,
      certification_validity_months: course.certification_validity_months ?? undefined,
      is_active: course.is_active,
      materials: materials.map((m) => ({
        id: m.id,
        material_type: m.material_type,
        title: m.title,
        external_url: m.external_url ?? '',
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (values: CourseFormValues) => {
      if (!profile?.organization_id) throw new Error('No organization found for your account.');
      return updateCourse({
        courseId,
        values,
        organizationId: profile.organization_id,
        updatedBy: profile.id,
        branchId: profile.branch_id,
        materialFiles,
        existingMaterialIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-courses', courseId] });
      queryClient.invalidateQueries({ queryKey: ['training-courses'] });
      toast.success('Course updated');
      navigate(`/hr/training/courses/${courseId}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update course'));
    },
  });

  const onSubmit = async (values: CourseFormValues) => {
    if (!profile?.organization_id) return;
    updateMutation.mutate(values);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
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
            <BreadcrumbPage>Edit Course</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to={`/hr/training/courses/${params.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="flex items-center gap-2 page-title">
          <GraduationCap className="h-6 w-6 text-blue-600" />
          Edit Course
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Course Details</CardTitle>
            <CardDescription>What this course covers and who it&apos;s for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input id="title" {...register('title')} />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={3} {...register('description')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Input id="category" {...register('category')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="provider">Provider</Label>
                <Input id="provider" {...register('provider')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated_duration_minutes">Duration (minutes)</Label>
                <Input id="estimated_duration_minutes" type="number" min={0} {...register('estimated_duration_minutes')} />
              </div>

              <div className="space-y-1.5 sm:col-span-3">
                <Label>Recommended for roles</Label>
                <Controller
                  control={control}
                  name="target_roles"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-3">
                      {ROLE_OPTIONS.map((o) => (
                        <div key={o.value} className="flex items-center gap-1.5">
                          <Checkbox
                            id={`role-${o.value}`}
                            checked={field.value.includes(o.value)}
                            onCheckedChange={(checked) => toggleRole(o.value, !!checked, field.onChange)}
                          />
                          <Label htmlFor={`role-${o.value}`} className="text-sm font-normal">
                            {o.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                />
              </div>

              <div className="flex items-center gap-3">
                <Controller
                  control={control}
                  name="is_certification"
                  render={({ field }) => <Switch id="is_certification" checked={field.value} onCheckedChange={field.onChange} />}
                />
                <Label htmlFor="is_certification" className="text-sm font-normal">
                  Grants a certification
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} />}
                />
                <Label htmlFor="is_active" className="text-sm font-normal">
                  Active (visible in the catalog)
                </Label>
              </div>
              {isCertification && (
                <div className="space-y-1.5">
                  <Label htmlFor="certification_validity_months">
                    Valid for (months) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="certification_validity_months"
                    type="number"
                    min={1}
                    {...register('certification_validity_months')}
                  />
                  {errors.certification_validity_months && (
                    <p className="text-xs text-destructive">{errors.certification_validity_months.message}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Materials</CardTitle>
              <CardDescription>Files or links employees will learn from.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => append({ material_type: 'link', title: '', external_url: '' })}>
                <LinkIcon className="mr-1.5 h-4 w-4" />
                Add Link
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ material_type: 'file', title: '' })}>
                <Upload className="mr-1.5 h-4 w-4" />
                Add File
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No materials added yet.</p>
            ) : (
              fields.map((field, index) => (
                <div key={field.id} className="space-y-3">
                  {index > 0 && <Separator />}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize">
                      {field.material_type} {index + 1}
                      {field.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(saved)</span>}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`materials.${index}.title`}>Title</Label>
                      <Input id={`materials.${index}.title`} {...register(`materials.${index}.title`)} />
                    </div>
                    {field.material_type === 'link' ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`materials.${index}.external_url`}>URL</Label>
                        <Input
                          id={`materials.${index}.external_url`}
                          placeholder="https://…"
                          {...register(`materials.${index}.external_url`)}
                        />
                      </div>
                    ) : !field.id ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`materials.${index}.file`}>File</Label>
                        <Input
                          id={`materials.${index}.file`}
                          type="file"
                          onChange={(e) => setMaterialFiles((prev) => ({ ...prev, [index]: e.target.files?.[0] }))}
                        />
                      </div>
                    ) : (
                      <p className="self-end text-xs text-muted-foreground">Already uploaded</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link to={`/hr/training/courses/${params.id}`} className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={updateMutation.isPending} className="w-full sm:w-auto">
            {updateMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
