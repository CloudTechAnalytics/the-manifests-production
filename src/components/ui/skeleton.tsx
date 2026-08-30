import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // .skeleton (globals.css) is a shimmer sweep, not a flat opacity
      // pulse — reads calmer/more premium at the density this app uses
      // loading states (tables, KPI tiles, whole-page skeletons) than
      // Tailwind's default animate-pulse did. rounded-md stays a normal
      // Tailwind utility (not baked into .skeleton) so a caller's own
      // rounded-* override (rounded-full for an avatar placeholder, etc.)
      // keeps winning via cn()/tailwind-merge exactly as before.
      className={cn('skeleton rounded-md', className)}
      {...props}
    />
  );
}

export { Skeleton };
