import type { ComponentType } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  href: string;
  color: string;
  /** Optional trend badge, e.g. { direction: 'up', label: '3 this week' } */
  trend?: { direction: 'up' | 'down'; label: string };
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  color,
  trend,
  loading,
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={href} className="block h-full">
      <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${color}`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </div>
            {trend && (
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${
                  trend.direction === 'up'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {trend.direction === 'up' ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.label}
              </span>
            )}
          </div>
          <p className="mt-3.5 font-serif text-[28px] font-bold leading-none tracking-tight">
            {value}
          </p>
          <p className="mt-1.5 truncate text-sm font-normal text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
