import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  message?: string;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'py-8' : 'py-12',
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}
