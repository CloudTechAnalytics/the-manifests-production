'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  DollarSign,
  PackageCheck,
  AlertTriangle,
  PackageX,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Settings2,
} from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { useWarehouseData } from '@/shared/hooks/use-warehouse-data';
import { Button } from '@/shared/components/ui/button';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
import { WarehouseSummary } from '@/features/warehouse/components/warehouse-summary';
import { InventoryByWarehouse } from '@/features/warehouse/components/inventory-by-warehouse';
import { WarehouseAlerts } from '@/features/warehouse/components/warehouse-alerts';
import { RecentWarehouseActivities } from '@/features/warehouse/components/recent-warehouse-activities';
import { WarehouseInventoryTabs } from '@/features/warehouse/components/warehouse-inventory-tabs';
import { MovementDialog, type MovementMode } from '@/features/warehouse/components/movement-dialog';
import { formatCurrency } from '@/shared/lib/utils/status';
import { ExportButton } from '@/shared/components/ui/export-button';
import type { ExportColumn } from '@/shared/lib/export';
import type { StockItem } from '@/shared/types';

const STOCK_EXPORT_COLUMNS: ExportColumn<StockItem>[] = [
  { header: 'SKU', value: (i) => i.sku },
  { header: 'Name', value: (i) => i.name },
  { header: 'Category', value: (i) => i.category },
  { header: 'Unit', value: (i) => i.unit },
  { header: 'Unit Cost', value: (i) => i.unit_cost },
  { header: 'Reorder Point', value: (i) => i.reorder_point },
  { header: 'Branch', value: (i) => i.branch?.name ?? '' },
  { header: 'Created', value: (i) => i.created_at },
];

export default function WarehousePage() {
  const { profile } = useAuth();
  const data = useWarehouseData();

  const [items, setItems] = useState<StockItem[]>([]);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode>('inbound');
  const [presetItemId, setPresetItemId] = useState<string | undefined>(undefined);

  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('stock_items')
      .select('*, branch:branches(name)')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (!isAdmin && branchId) query = query.eq('branch_id', branchId);
    query.then(({ data: rows, error }) => {
      if (error) return console.error('Error loading stock items:', error);
      setItems((rows as StockItem[]) ?? []);
    });
  }, [profile, isAdmin, branchId, data.stockRows.length]);

  const openMovement = (mode: MovementMode, itemId?: string) => {
    setMovementMode(mode);
    setPresetItemId(itemId);
    setMovementOpen(true);
  };

  const kpis = [
    {
      label: 'Total Items',
      value: data.stats.totalItems,
      icon: Boxes,
      href: '/warehouse?tab=items',
      caption: 'Stock lines',
    },
    {
      label: 'Total Value',
      value: formatCurrency(data.stats.totalValue),
      icon: DollarSign,
      href: '/warehouse?tab=items',
      caption: 'On hand',
      isCurrency: true,
    },
    {
      label: 'Available Stock',
      value: data.stats.availableCount,
      icon: PackageCheck,
      href: '/warehouse?tab=items&status=available',
      caption: 'Above reorder point',
    },
    {
      label: 'Low Stock Items',
      value: data.stats.lowStockCount,
      icon: AlertTriangle,
      href: '/warehouse?tab=items&status=low_stock',
      caption: 'Reorder soon',
    },
    {
      label: 'Out of Stock',
      value: data.stats.outOfStockCount,
      icon: PackageX,
      href: '/warehouse?tab=items&status=out_of_stock',
      caption: 'Zero quantity',
    },
    {
      label: 'Inbound Today',
      value: data.stats.inboundTodayQty,
      icon: ArrowDownToLine,
      href: '/warehouse?tab=inbound',
      caption: 'Units received',
    },
    {
      label: 'Outbound Today',
      value: data.stats.outboundTodayQty,
      icon: ArrowUpFromLine,
      href: '/warehouse?tab=outbound',
      caption: 'Units shipped',
    },
  ];

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Boxes className="h-6 w-6 text-primary" />
            Warehouse
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage inventory, stock locations, and warehouse operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton data={items} columns={STOCK_EXPORT_COLUMNS} filename="warehouse-stock" />
          <Link to="/warehouse/locations">
            <Button variant="outline" size="sm">
              <Settings2 className="mr-1.5 h-4 w-4" />
              Warehouses
            </Button>
          </Link>
          <Link to="/warehouse/items/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New Item
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={data.loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <WarehouseSummary
            stats={data.stats}
            donut={data.donut}
            periodTotals={data.periodTotals}
            loading={data.loading}
          />
        </div>
        <div className="lg:col-span-5">
          <InventoryByWarehouse rows={data.inventoryByWarehouse} loading={data.loading} />
        </div>
        <div className="lg:col-span-3">
          <WarehouseAlerts
            lowStockCount={data.stats.lowStockCount}
            outOfStockCount={data.stats.outOfStockCount}
            loading={data.loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <WarehouseInventoryTabs
            stockRows={data.stockRows}
            movements={data.movements}
            items={items}
            warehouses={data.warehouses}
            loading={data.loading}
            onOpenMovement={openMovement}
          />
        </div>
        <div className="xl:col-span-1">
          <RecentWarehouseActivities movements={data.movements} loading={data.loading} />
        </div>
      </div>

      <MovementDialog
        mode={movementMode}
        open={movementOpen}
        onOpenChange={setMovementOpen}
        items={items}
        warehouses={data.warehouses}
        stockRows={data.stockRows}
        presetItemId={presetItemId}
        onSuccess={data.refetch}
      />
    </div>
  );
}
