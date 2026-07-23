import Link from 'next/link';
import { AlertTriangle, PackageX, ChevronRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface WarehouseAlertsProps {
  lowStockCount: number;
  outOfStockCount: number;
  loading?: boolean;
}

export function WarehouseAlerts({
  lowStockCount,
  outOfStockCount,
  loading,
}: WarehouseAlertsProps) {
  const alerts = [
    lowStockCount > 0 && {
      key: 'low_stock',
      icon: AlertTriangle,
      color: 'bg-amber-50 text-amber-600',
      title: `${lowStockCount} item${lowStockCount === 1 ? '' : 's'} ${lowStockCount === 1 ? 'is' : 'are'} low in stock`,
      subtitle: 'Reorder soon to avoid stockout',
      href: '/warehouse?tab=items&status=low_stock',
    },
    outOfStockCount > 0 && {
      key: 'out_of_stock',
      icon: PackageX,
      color: 'bg-red-50 text-red-600',
      title: `${outOfStockCount} item${outOfStockCount === 1 ? '' : 's'} ${outOfStockCount === 1 ? 'is' : 'are'} out of stock`,
      subtitle: 'Unable to fulfill orders',
      href: '/warehouse?tab=items&status=out_of_stock',
    },
  ].filter(Boolean) as {
    key: string;
    icon: typeof AlertTriangle;
    color: string;
    title: string;
    subtitle: string;
    href: string;
  }[];

  return (
    <Card className="h-full">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Operational Alerts</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No alerts" message="Stock levels look healthy." compact />
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.key}
                  href={a.href}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/60"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.color}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
