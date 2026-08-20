import { Users, UserCheck, UserMinus, UserPlus, FileClock, BadgeCheck, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { HrDashboardStats } from '@/types';

interface Tile {
  label: string;
  value: number;
  icon: typeof Users;
  iconClassName: string;
}

/** Six-tile summary row for HR → Dashboard, all from one hr_dashboard_stats()
 *  call (migration 087) — no per-tile query. */
export function HrDashboardStatTiles({ stats }: { stats: HrDashboardStats }) {
  const tiles: Tile[] = [
    { label: 'Total Employees', value: stats.total_employees, icon: Users, iconClassName: 'bg-blue-50 text-blue-600' },
    { label: 'Active', value: stats.active_employees, icon: UserCheck, iconClassName: 'bg-emerald-50 text-emerald-600' },
    { label: 'On Leave', value: stats.on_leave_employees, icon: UserMinus, iconClassName: 'bg-amber-50 text-amber-600' },
    { label: 'New Hires (30d)', value: stats.new_hires_30d, icon: UserPlus, iconClassName: 'bg-violet-50 text-violet-600' },
    { label: 'Contracts Ending (60d)', value: stats.contracts_ending_60d, icon: FileClock, iconClassName: 'bg-orange-50 text-orange-600' },
    { label: 'Confirmation Due (30d)', value: stats.confirmation_due_30d, icon: BadgeCheck, iconClassName: 'bg-cyan-50 text-cyan-600' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className={`flex h-8 w-8 items-center justify-center rounded-md ${tile.iconClassName}`}>
              <tile.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-tight">{tile.value}</p>
              <p className="text-xs text-muted-foreground">{tile.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
      {stats.employees_without_login > 0 && (
        <Card className="col-span-2 sm:col-span-3 lg:col-span-6">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <KeyRound className="h-4 w-4" />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{stats.employees_without_login}</span> employee
              {stats.employees_without_login === 1 ? '' : 's'} without a Manifest login (e.g. drivers, warehouse
              staff) — tracked in HR, but excluded from capacity scoring since there&apos;s no system activity to measure.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
