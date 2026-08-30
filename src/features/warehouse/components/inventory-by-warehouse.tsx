import { Link } from 'react-router-dom';
import { Warehouse as WarehouseIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import type { InventoryByWarehouse as InventoryByWarehouseRow } from '@/shared/hooks/use-warehouse-data';

interface InventoryByWarehouseProps {
  rows: InventoryByWarehouseRow[];
  loading?: boolean;
}

export function InventoryByWarehouse({ rows, loading }: InventoryByWarehouseProps) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Inventory by Warehouse</CardTitle>
        <Link to="/warehouse/locations" className="text-xs font-medium text-primary hover:underline">
          View all warehouses
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={WarehouseIcon} title="No warehouses yet" compact />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Warehouse</th>
                  <th className="pb-2 text-right font-medium">Total Items</th>
                  <th className="pb-2 text-right font-medium">Available</th>
                  <th className="pb-2 text-right font-medium">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.warehouse_id} className="border-b border-border last:border-0">
                    <td className="py-2.5 font-medium">{r.warehouse_name}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.totalItems}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.available}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              r.utilization >= 70
                                ? 'bg-green-500'
                                : r.utilization >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(r.utilization, 100)}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">
                          {r.utilization}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
