import { supabase } from '@/shared/lib/supabase/client';
import type { StockItem, StockMovement, Warehouse, WarehouseStock } from '@/shared/types';

export interface BranchScope {
  isAdmin: boolean;
  branchId: string | null;
}

// ============================================================
// Warehouse page — stock items list
// ============================================================

export async function fetchStockItems({ isAdmin, branchId }: BranchScope): Promise<StockItem[]> {
  let query = supabase
    .from('stock_items')
    .select('*, branch:branches(name)')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading stock items:', error);
    return [];
  }
  return (data as StockItem[]) ?? [];
}

// ============================================================
// Warehouses (locations) — shared by locations page and the new-item page
// ============================================================

export async function fetchWarehouses({ isAdmin, branchId }: BranchScope): Promise<Warehouse[]> {
  let query = supabase
    .from('warehouses')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading warehouses:', error);
    return [];
  }
  return (data as Warehouse[]) ?? [];
}

export interface WarehouseFormInput {
  name: string;
  city: string;
  address: string;
}

export async function createWarehouse(
  form: WarehouseFormInput,
  branchId: string,
  actor: { id: string }
): Promise<{ id: string }> {
  const { data: created, error } = await supabase
    .from('warehouses')
    .insert({
      name: form.name.trim(),
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      branch_id: branchId,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: branchId,
    action: 'warehouse.created',
    entity_type: 'warehouse',
    entity_id: created?.id,
    description: `Created warehouse "${form.name.trim()}"`,
  });

  return created as { id: string };
}

export async function editWarehouse(
  target: Warehouse,
  form: WarehouseFormInput,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase
    .from('warehouses')
    .update({
      name: form.name.trim(),
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      updated_by: actor.id,
    })
    .eq('id', target.id);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: target.branch_id,
    action: 'warehouse.updated',
    entity_type: 'warehouse',
    entity_id: target.id,
    description: `Updated warehouse "${form.name.trim()}"`,
  });
}

export async function deleteWarehouse(target: Warehouse, actor: { id: string }): Promise<void> {
  const { error } = await supabase
    .from('warehouses')
    .update({ deleted_at: new Date().toISOString(), updated_by: actor.id })
    .eq('id', target.id);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: target.branch_id,
    action: 'warehouse.deleted',
    entity_type: 'warehouse',
    entity_id: target.id,
    description: `Deleted warehouse "${target.name}"`,
  });
}

// ============================================================
// Stock item detail page
// ============================================================

export interface StockItemDetail {
  item: StockItem;
  stockRows: WarehouseStock[];
  movements: StockMovement[];
  warehouses: Warehouse[];
}

export async function fetchStockItemDetail(
  itemId: string,
  { isAdmin, branchId }: BranchScope
): Promise<StockItemDetail | null> {
  let whQuery = supabase
    .from('warehouses')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (!isAdmin && branchId) whQuery = whQuery.eq('branch_id', branchId);

  // stock/movements/warehouses are all independent of the item row and
  // of each other — one concurrent batch instead of four sequential
  // round trips.
  const [{ data: itemData, error: itemError }, { data: stock }, { data: moves }, { data: whRows }] =
    await Promise.all([
      supabase.from('stock_items').select('*').eq('id', itemId).is('deleted_at', null).maybeSingle(),
      supabase.from('warehouse_stock').select('*, warehouse:warehouses(*)').eq('item_id', itemId),
      supabase
        .from('stock_movements')
        .select(
          '*, warehouse:warehouses!stock_movements_warehouse_id_fkey(*), to_warehouse:warehouses!stock_movements_to_warehouse_id_fkey(*), created_by_user:profiles!stock_movements_created_by_fkey(id, full_name)'
        )
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(100),
      whQuery,
    ]);

  if (itemError || !itemData) return null;

  return {
    item: itemData as StockItem,
    stockRows: (stock as unknown as WarehouseStock[]) ?? [],
    movements: (moves as unknown as StockMovement[]) ?? [],
    warehouses: (whRows as Warehouse[]) ?? [],
  };
}

export async function deleteStockItem(item: StockItem, itemId: string, actor: { id: string }): Promise<void> {
  const { error } = await supabase
    .from('stock_items')
    .update({ deleted_at: new Date().toISOString(), updated_by: actor.id })
    .eq('id', itemId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: item.branch_id,
    action: 'stock_item.deleted',
    entity_type: 'stock_item',
    entity_id: itemId,
    description: `Deleted item "${item.name}"`,
  });
}

// ============================================================
// Stock item edit page
// ============================================================

export async function fetchStockItemForEdit(itemId: string): Promise<StockItem | null> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return data as StockItem;
}

export interface StockItemFormValues {
  sku: string;
  name: string;
  category?: string;
  unit: string;
  unit_cost: number;
  reorder_point: number;
  notes?: string;
}

export async function updateStockItem(
  itemId: string,
  values: StockItemFormValues,
  itemBranchId: string | null,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase
    .from('stock_items')
    .update({
      sku: values.sku.trim(),
      name: values.name.trim(),
      category: values.category?.trim() || null,
      unit: values.unit.trim(),
      unit_cost: values.unit_cost,
      reorder_point: values.reorder_point,
      notes: values.notes || null,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: itemBranchId,
    action: 'stock_item.updated',
    entity_type: 'stock_item',
    entity_id: itemId,
    description: `Updated item "${values.name.trim()}"`,
  });
}

// ============================================================
// New stock item page
// ============================================================

export interface NewStockItemFormValues extends StockItemFormValues {
  initial_warehouse_id?: string;
  initial_quantity?: number;
}

export async function createStockItem(
  values: NewStockItemFormValues,
  branchId: string,
  actor: { id: string }
): Promise<{ item: { id: string; name: string }; initialStockFailed: boolean }> {
  const { data: item, error } = await supabase
    .from('stock_items')
    .insert({
      sku: values.sku.trim(),
      name: values.name.trim(),
      category: values.category?.trim() || null,
      unit: values.unit.trim(),
      unit_cost: values.unit_cost,
      reorder_point: values.reorder_point,
      notes: values.notes || null,
      branch_id: branchId,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('id, name')
    .single();

  if (error || !item) {
    throw new Error(error?.message ?? 'Failed to create item');
  }

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: branchId,
    action: 'stock_item.created',
    entity_type: 'stock_item',
    entity_id: item.id,
    description: `Added item "${item.name}" to the catalog`,
  });

  let initialStockFailed = false;
  if (values.initial_warehouse_id && values.initial_quantity && values.initial_quantity > 0) {
    const { error: moveError } = await supabase.from('stock_movements').insert({
      item_id: item.id,
      warehouse_id: values.initial_warehouse_id,
      branch_id: branchId,
      movement_type: 'inbound',
      quantity: values.initial_quantity,
      reference: 'Initial stock',
      created_by: actor.id,
    });
    if (moveError) initialStockFailed = true;
  }

  return { item: item as { id: string; name: string }, initialStockFailed };
}

// ============================================================
// Movement dialog (Receive / Issue / Adjust / Transfer)
// ============================================================

export type MovementMode = 'inbound' | 'outbound' | 'adjustment' | 'transfer';

export interface RecordMovementInput {
  mode: MovementMode;
  itemId: string;
  itemBranchId: string;
  warehouseId: string;
  toWarehouseId: string;
  direction: 'increase' | 'decrease';
  quantity: number;
  movementDate: string;
  reference: string;
  notes: string;
}

export async function recordStockMovement(input: RecordMovementInput, actor: { id: string }): Promise<void> {
  const movementType =
    input.mode === 'inbound'
      ? 'inbound'
      : input.mode === 'outbound'
        ? 'outbound'
        : input.mode === 'transfer'
          ? 'transfer'
          : input.direction === 'increase'
            ? 'adjustment_increase'
            : 'adjustment_decrease';

  const { error } = await supabase.from('stock_movements').insert({
    item_id: input.itemId,
    warehouse_id: input.warehouseId,
    to_warehouse_id: input.mode === 'transfer' ? input.toWarehouseId : null,
    branch_id: input.itemBranchId,
    movement_type: movementType,
    quantity: input.quantity,
    movement_date: input.movementDate,
    reference: input.reference || null,
    notes: input.notes || null,
    created_by: actor.id,
  });
  if (error) throw error;
}
