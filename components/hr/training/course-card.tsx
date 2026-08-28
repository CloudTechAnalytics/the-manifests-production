import Link from 'next/link';
import { GraduationCap, Clock, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Course } from '@/types';

interface CourseCardProps {
  course: Course;
  recommended: boolean;
}

/** `recommended` is a display badge only — it never hides a course
 *  from anyone. Every employee can browse the whole catalog. */
export function CourseCard({ course, recommended }: CourseCardProps) {
  return (
    <Link href={`/hr/training/courses/${course.id}`}>
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader className="space-y-2 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <GraduationCap className="h-4 w-4" />
            </div>
            {recommended && (
              <Badge variant="secondary" className="bg-violet-50 text-[10px] text-violet-700">
                Recommended for you
              </Badge>
            )}
          </div>
          <CardTitle className="text-sm font-semibold leading-tight">{course.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {course.description && <p className="line-clamp-2 text-xs text-muted-foreground">{course.description}</p>}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {course.category && (
              <Badge variant="outline" className="text-[10px]">
                {course.category}
              </Badge>
            )}
            {course.estimated_duration_minutes != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {course.estimated_duration_minutes} min
              </span>
            )}
            {course.is_certification && (
              <span className="inline-flex items-center gap-1">
                <Award className="h-3 w-3" /> Certification
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
