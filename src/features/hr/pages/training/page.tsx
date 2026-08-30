'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Plus, Search, ListChecks } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { usePaginatedList } from '@/shared/hooks/use-paginated-list';
import { CourseCard } from '@/features/hr/components/training/course-card';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { Course, UserRole } from '@/shared/types';

export default function TrainingCatalogPage() {
  const { roles, hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('hr_manager') || hasRole('hr_officer');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(() => {
    let query = supabase
      .from('courses')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (debouncedSearch) {
      const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
      query = query.or(`title.ilike.%${sanitized}%,category.ilike.%${sanitized}%`);
    }
    return query;
  }, [debouncedSearch]);

  const fetchPage = useCallback(
    async (offset: number, limit: number): Promise<Course[]> => {
      const { data, error } = await buildQuery().range(offset, offset + limit - 1);
      if (error) {
        console.error('Error loading courses:', error);
        return [];
      }
      return (data as Course[]) ?? [];
    },
    [buildQuery]
  );

  const { rows: courses, loading, loadingMore, hasMore, loadMore } = usePaginatedList<Course>(fetchPage);

  const isRecommended = (course: Course) =>
    course.target_roles.length > 0 && course.target_roles.some((r: UserRole) => roles.includes(r));

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <GraduationCap className="h-6 w-6 text-blue-600" />
            Training
          </h1>
          <p className="text-sm text-muted-foreground">Browse courses, or pick up what HR has assigned you.</p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Link to="/hr/training/my">
            <Button variant="outline" size="sm">
              <ListChecks className="mr-1.5 h-4 w-4" />
              My Learning
            </Button>
          </Link>
          {canManage && (
            <Link to="/hr/training/courses/new">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Course
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <GraduationCap className="h-7 w-7 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium">No courses yet</p>
              <p className="text-sm text-muted-foreground">
                {debouncedSearch ? 'Try a different search.' : 'HR hasn’t added any courses yet.'}
              </p>
            </div>
            {!debouncedSearch && canManage && (
              <Link to="/hr/training/courses/new">
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Course
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} recommended={isRecommended(course)} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
