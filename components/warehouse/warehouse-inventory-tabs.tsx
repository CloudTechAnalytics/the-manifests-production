'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Boxes,
  History,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  STOCK_STATUS_META,
  STOCK_MOVEMENT_TYPE_META,
  formatCurrency,
  formatDateTime,
  getStockStatus,
  type StockStatus,
} from '@/lib/utils/status';
import type { StockItem, StockMovement, Warehouse, WarehouseStock } from '@/types';
import type { MovementMode } from '@/components/warehouse/movement-dialog';

type TabKey = 'items' | 'movements' | 'inbound' | 'outbound' | 'adjustments';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'items', label: 'Stock Items' },
  { key: 'movements', label: 'Stock Movements' },
  { key: 'inbound', label: 'Inbound Shipments' },
  { key: 'outbound', label: 'Outbound Shipments' },
  { key: 'adjustments', label: 'Adjustments' },
];

const PAGE_SIZE = 10;

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface WarehouseInventoryTabsProps {
  stockRows: WarehouseStock[];
  movements: StockMovement[];
  items: StockItem[];
  warehouses: Warehouse[];
  loading?: boolean;
  onOpenMovement: (mode: MovementMode, presetItemId?: string) => void;
}

export function WarehouseInventoryTabs({
  stockRows,
  movements,
  items,
  warehouses,
  loading,
  onOpenMovement,
}: WarehouseInventoryTabsProps) {
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Support deep-links from alert cards: /warehouse?tab=items&status=low_stock
  useEffect(() => {
    const tab = searchParams.get('tab') as TabKey | null;
    const status = searchParams.get('status') as StockStatus | null;
    if (tab && TABS.some((t) => t.key === tab)) setActiveTab(tab);
    if (status) setStatusFilter(status);
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, categoryFilter, statusFilter, warehouseFilter]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items]
  );

  const filteredItemRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stockRows.filter((r) => {
      if (!r.item) return false;
      if (term && !r.item.name.toLowerCase().includes(term) && !r.item.sku.toLowerCase().includes(term)) {
        return false;
      }
      if (categoryFilter !== 'all' && r.item.category !== categoryFilter) return false;
      if (warehouseFilter !== 'all' && r.warehouse_id !== warehouseFilter) return false;
      if (statusFilter !== 'all') {
        const status = getStockStatus(Number(r.quantity), Number(r.item.reorder_point));
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [stockRows, search, categoryFilter, warehouseFilter, statusFilter]);

  const movementTypeFilter: StockMovement['movement_type'][] | null =
    activeTab === 'inbound'
      ? ['inbound']
      : activeTab === 'outbound'
        ? ['outbound']
        : activeTab === 'adjustments'
          ? ['adjustment_increase', 'adjustment_decrease']
          : null;

  const filteredMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (movementTypeFilter && !movementTypeFilter.includes(m.movement_type)) return false;
      if (
        term &&
        !(m.item?.name.toLowerCase().includes(term) || m.reference?.toLowerCase().includes(term))
      ) {
        return false;
      }
      if (warehouseFilter !== 'all' && m.warehouse_id !== warehouseFilter && m.to_warehouse_id !== warehouseFilter) {
        return false;
      }
      return true;
    });
  }, [movements, movementTypeFilter, search, warehouseFilter]);

  const isItemsTab = activeTab === 'items';
  const totalRows = isItemsTab ? filteredItemRows.length : filteredMovements.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedItemRows = filteredItemRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pagedMovements = filteredMovements.slice(pageStart, pageStart + PAGE_SIZE);

  const handleExport = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    if (isItemsTab) {
      downloadCsv(
        `warehouse-stock-items-${dateStr}.csv`,
        ['Item Name', 'SKU', 'Category', 'Warehouse', 'Available', 'Status', 'Value'],
        filteredItemRows.map((r) => [
          r.item?.name ?? '',
          r.item?.sku ?? '',
          r.item?.category ?? '',
          r.warehouse?.name ?? '',
          r.quantity,
          r.item ? STOCK_STATUS_META[getStockStatus(Number(r.quantity), Number(r.item.reorder_point))].label : '',
          r.item ? Number(r.quantity) * Number(r.item.unit_cost) : 0,
        ])
      );
    } else {
      downloadCsv(
        `warehouse-${activeTab}-${dateStr}.csv`,
        ['Date', 'Item', 'Type', 'Warehouse', 'To Warehouse', 'Quantity', 'Reference', 'By'],
        filteredMovements.map((m) => [
          m.movement_date,
          m.item?.name ?? '',
          STOCK_MOVEMENT_TYPE_META[m.movement_type].label,
          m.warehouse?.name ?? '',
          m.to_warehouse?.name ?? '',
          m.quantity,
          m.reference ?? '',
          m.created_by_user?.full_name ?? '',
        ])
      );
    }
  };

  return (
    <Card>
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Record Movement
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpenMovement('inbound')}>Receive Stock</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenMovement('outbound')}>Issue Stock</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenMovement('adjustment')}>Adjust Stock</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenMovement('transfer')}>Transfer Stock</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={
                isItemsTab
                  ? 'Search items by name, SKU, barcode…'
                  : 'Search by item name or reference…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            {isItemsTab && (
              <>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | StockStatus)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {(Object.keys(STOCK_STATUS_META) as StockStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STOCK_STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : isItemsTab ? (
          pagedItemRows.length === 0 ? (
            <EmptyState icon={Boxes} title="No stock items found" message="Try adjusting your search or filters." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItemRows.map((r) => {
                    if (!r.item) return null;
                    const status = getStockStatus(Number(r.quantity), Number(r.item.reorder_point));
                    const statusMeta = STOCK_STATUS_META[status];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-primary">
                          <Link href={`/warehouse/items/${r.item.id}`}>{r.item.name}</Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.item.sku}</TableCell>
                        <TableCell className="text-muted-foreground">{r.item.category ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r.warehouse?.name ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.quantity} {r.item.unit}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                            {statusMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(r.quantity) * Number(r.item.unit_cost))}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/warehouse/items/${r.item.id}`}>View History</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOpenMovement('inbound', r.item!.id)}>
                                Receive Stock
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOpenMovement('outbound', r.item!.id)}>
                                Issue Stock
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOpenMovement('adjustment', r.item!.id)}>
                                Adjust Stock
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOpenMovement('transfer', r.item!.id)}>
                                Transfer Stock
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )
        ) : pagedMovements.length === 0 ? (
          <EmptyState icon={History} title="No movements found" message="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedMovements.map((m) => {
                  const typeMeta = STOCK_MOVEMENT_TYPE_META[m.movement_type];
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                      <TableCell className="font-medium">
                        {m.item ? (
                          <Link href={`/warehouse/items/${m.item.id}`} className="text-primary">
                            {m.item.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[11px] ${typeMeta.color}`}>
                          {typeMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.movement_type === 'transfer'
                          ? `${m.warehouse?.name ?? '—'} → ${m.to_warehouse?.name ?? '—'}`
                          : m.warehouse?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.quantity} {m.item?.unit ?? ''}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.reference ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.created_by_user?.full_name ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {!loading && totalRows > 0 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {pageStart + 1} to {Math.min(pageStart + PAGE_SIZE, totalRows)} of {totalRows}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
