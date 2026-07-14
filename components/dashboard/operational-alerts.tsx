import Link from 'next/link';
import {
  CheckCircle2,
  FileClock,
  FileQuestion,
  Clock,
  FolderX,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardData } from '@/hooks/use-dashboard-data';

interface AlertDef {
  key: keyof DashboardData['alerts'];
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

const ALERT_DEFS: AlertDef[] = [
  {
    key: 'awaitingDocumentation',
    label: 'Awaiting Documentation',
    description: 'Need paperwork',
    href: '/shipments?status=documentation',
    icon: FileClock,
    color: 'bg-amber-50 text-amber-600',
  },
  {
    key: 'quotationsPendingApproval',
    label: 'Quotations Pending',
    description: 'Awaiting customer response',
    href: '/quotations?status=sent',
    icon: FileQuestion,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    key: 'shipmentsDelayed',
    label: 'Shipments Delayed',
    description: 'Past estimated arrival',
    href: '/shipments',
    icon: Clock,
    color: 'bg-red-50 text-red-600',
  },
  {
    key: 'shipmentsMissingDocuments',
    label: 'Documents Missing',
    description: 'No documents on file',
    href: '/shipments',
    icon: FolderX,
    color: 'bg-purple-50 text-purple-600',
  },
];

interface OperationalAlertsProps {
  alerts: DashboardData['alerts'];
  loading?: boolean;
}

export function OperationalAlerts({ alerts, loading }: OperationalAlertsProps) {
  const active = ALERT_DEFS.filter((def) => alerts[def.key] > 0);

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-3">
        <CardTitle className="text-base font-semibold">
          Operational Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="flex items-center justify-center gap-2.5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">
              Everything is up to date — no alerts right now.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {active.map((def) => {
              const Icon = def.icon;
              const count = alerts[def.key];
              return (
                <Link
                  key={def.key}
                  href={def.href}
                  className="flex items-center gap-2.5 rounded-lg border border-border p-3 transition-colors hover:border-primary/30 hover:bg-accent"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${def.color}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {count} {def.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {def.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
