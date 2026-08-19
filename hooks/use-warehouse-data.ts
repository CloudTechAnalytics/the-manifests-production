'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { getStockStatus } from '@/lib/utils/status';
import type { Warehouse, WarehouseStock, StockMovement } from '@/types';

export interface InventoryByWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  totalItems: number;
  available: number;
  utilization: number;
}

export interface WarehouseStats {
  totalItems: number;
  totalValue: number;
  availableCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  inboundTodayQty: number;
  outboundTodayQty: number;
}

export interface WarehouseData {
  loading: boolean;
  warehouses: Warehouse[];
  stockRows: WarehouseStock[];
  movements: StockMovement[];
  stats: WarehouseStats;
  donut: { available: number; low_stock: number; out_of_stock: number };
  periodTotals: { inboundValue: number; outboundValue: number; adjustmentValue: number };
  inventoryByWarehouse: InventoryByWarehouse[];
  isAdmin: boolean;
  refetch: () => void;
}

/**
 * Single consolidated fetch for the Warehouse module, same shape as
 * use-dashboard-data.ts: broad rows fetched once, every derived
 * stat/table computed client-side to avoid a query per widget.
 */
export function useWarehouseData(): WarehouseData {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchFilter = isAdmin ? null : profile?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockRows, setStockRows] = useState<WarehouseStock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      setLoading(true);
      try {
        let warehousesQuery = supabase
          .from('warehouses')
          .select('*')
          .is('deleted_at', null)
          .order('name', { ascending: true });
        if (branchFilter) warehousesQuery = warehousesQuery.eq('branch_id', branchFilter);

        let stockQuery = supabase
          .from('warehouse_stock')
          .select('*, item:stock_items(*), warehouse:warehouses(*)')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (branchFilter) stockQuery = stockQuery.eq('branch_id', branchFilter);

        let movementsQuery = supabase
          .from('stock_movements')
          .select(
            '*, item:stock_items(*), warehouse:warehouses!stock_movements_warehouse_id_fkey(*), to_warehouse:warehouses!stock_movements_to_warehouse_id_fkey(*), created_by_user:profiles!stock_movements_created_by_fkey(id, full_name)'
          )
          .order('created_at', { ascending: false })
          .limit(1000);
        if (branchFilter) movementsQuery = movementsQuery.eq('branch_id', branchFilter);

        // These three don't depend on each other — issue them as one
        // concurrent batch instead of three sequential round trips.
        const [{ data: warehouseRows }, { data: stock }, { data: movementRows }] = await Promise.all([
          warehousesQuery,
          stockQuery,
          movementsQuery,
        ]);

        setWarehouses((warehouseRows as Warehouse[]) ?? []);
        setStockRows((stock as unknown as WarehouseStock[]) ?? []);
        setMovements((movementRows as unknown as StockMovement[]) ?? []);
      } finally {
        setLoading(false);
      }
    }

    load();
  // Keyed on profile?.id, not the whole profile object — see
  // use-dashboard-data.ts for why.
  }, [profile?.id, branchFilter, reloadKey]);

  // --- Stats + donut, derived from stockRows -----------------------------
  let totalValue = 0;
  let availableCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  stockRows.forEach((row) => {
    const item = row.item;
    if (!item) return;
    totalValue += Number(row.quantity) * Number(item.unit_cost);
    const status = getStockStatus(Number(row.quantity), Number(item.reorder_point));
    if (status === 'available') availableCount++;
    else if (status === 'low_stock') lowStockCount++;
    else outOfStockCount++;
  });

  // --- Today / this-month movement aggregates -----------------------------
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const thisMonthYear = now.getFullYear();
  const thisMonth = now.getMonth();

  let inboundTodayQty = 0;
  let outboundTodayQty = 0;
  let inboundValue = 0;
  let outboundValue = 0;
  let adjustmentValue = 0;

  movements.forEach((m) => {
    const unitCost = Number(m.item?.unit_cost ?? 0);
    const value = Number(m.quantity) * unitCost;
    const d = new Date(m.movement_date);
    const isThisMonth = d.getFullYear() === thisMonthYear && d.getMonth() === thisMonth;

    if (m.movement_date === today) {
      if (m.movement_type === 'inbound') inboundTodayQty += Number(m.quantity);
      if (m.movement_type === 'outbound') outboundTodayQty += Number(m.quantity);
    }

    if (isThisMonth) {
      if (m.movement_type === 'inbound') inboundValue += value;
      if (m.movement_type === 'outbound') outboundValue += value;
      if (m.movement_type === 'adjustment_increase') adjustmentValue += value;
      if (m.movement_type === 'adjustment_decrease') adjustmentValue -= value;
    }
  });

  // --- Inventory by warehouse ---------------------------------------------
  const inventoryByWarehouse: InventoryByWarehouse[] = warehouses.map((w) => {
    const rows = stockRows.filter((r) => r.warehouse_id === w.id);
    const available = rows.filter((r) => {
      if (!r.item) return false;
      return getStockStatus(Number(r.quantity), Number(r.item.reorder_point)) === 'available';
    }).length;
    return {
      warehouse_id: w.id,
      warehouse_name: w.name,
      totalItems: rows.length,
      available,
      utilization: rows.length > 0 ? Math.round((available / rows.length) * 100) : 0,
    };
  });

  return {
    loading,
    warehouses,
    stockRows,
    movements,
    stats: {
      totalItems: stockRows.length,
      totalValue,
      availableCount,
      lowStockCount,
      outOfStockCount,
      inboundTodayQty,
      outboundTodayQty,
    },
    donut: { available: availableCount, low_stock: lowStockCount, out_of_stock: outOfStockCount },
    periodTotals: { inboundValue, outboundValue, adjustmentValue },
    inventoryByWarehouse,
    isAdmin,
    refetch,
  };
}
