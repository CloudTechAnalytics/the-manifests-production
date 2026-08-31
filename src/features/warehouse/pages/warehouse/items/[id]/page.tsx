'use client';

import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Boxes,
  Pencil,
  Trash2,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  ArrowLeftRight,
} from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { canDeleteOwnRecord } from '@/shared/lib/utils/ownership';
import { useAuth } from '@/shared/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/shared/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { MovementDialog, type MovementMode } from '@/features/warehouse/components/movement-dialog';
import {
  STOCK_STATUS_META,
  STOCK_MOVEMENT_TYPE_META,
  formatCurrency,
  formatDateTime,
  getStockStatus,
} from '@/shared/lib/utils/status';
import { deleteStockItem, fetchStockItemDetail } from '@/features/warehouse/services/warehouse.service';

export default function StockItemDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const itemId = params.id!;
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const { data: detail, isLoading: loading } = useQuery({
    queryKey: ['stock-item-detail', itemId],
    queryFn: () => fetchStockItemDetail(itemId, { isAdmin, branchId }),
    enabled: !!itemId,
  });
  const item = detail?.item ?? null;
  const stockRows = detail?.stockRows ?? [];
  const movements = detail?.movements ?? [];
  const warehouses = detail?.warehouses ?? [];

  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDelete =
    !!item && canDeleteOwnRecord({ hasRole });

  const [movementOpen, setMovementOpen] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode>('inbound');

  const handleMovementSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-item-detail', itemId] });
    queryClient.invalidateQueries({ queryKey: ['stock-items'] });
  };

  const openMovement = (mode: MovementMode) => {
    setMovementMode(mode);
    setMovementOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteStockItem(item!, itemId, { id: profile!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      toast.success('Item deleted');
      navigate('/warehouse');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to delete item'));
    },
    onSettled: () => setDeleteOpen(false),
  });

  const handleDelete = () => {
    if (!item || !profile) return;
    deleteMutation.mutate();
  };
  const deleting = deleteMutation.isPending;

  if (loading) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Boxes className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Item not found</h2>
          <p className="text-sm text-muted-foreground">
            This item may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link to="/warehouse">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Warehouse
          </Button>
        </Link>
      </div>
    );
  }

  const totalQuantity = stockRows.reduce((sum, r) => sum + Number(r.quantity), 0);
  const totalValue = totalQuantity * Number(item.unit_cost);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/warehouse">Warehouse</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/warehouse">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">{item.name}</h1>
            <p className="text-sm text-muted-foreground">
              {item.sku} {item.category && `• ${item.category}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openMovement('inbound')}>
            <ArrowDownToLine className="mr-1.5 h-4 w-4" />
            Receive
          </Button>
          <Button size="sm" variant="outline" onClick={() => openMovement('outbound')}>
            <ArrowUpFromLine className="mr-1.5 h-4 w-4" />
            Issue
          </Button>
          <Button size="sm" variant="outline" onClick={() => openMovement('adjustment')}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            Adjust
          </Button>
          <Button size="sm" variant="outline" onClick={() => openMovement('transfer')}>
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            Transfer
          </Button>
          <Link to={`/warehouse/items/${itemId}/edit`}>
            <Button size="sm" variant="outline">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
          {canDelete && (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete item?</DialogTitle>
                  <DialogDescription>
                    This will soft-delete &quot;{item.name}&quot; from the catalog. Its stock and
                    movement history are preserved.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                    {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Item Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit Cost</span>
                <span className="font-medium">{formatCurrency(item.unit_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reorder Point</span>
                <span className="font-medium">
                  {item.reorder_point} {item.unit}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total Stock</span>
                <span className="font-bold">
                  {totalQuantity} {item.unit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Value</span>
                <span className="font-medium">{formatCurrency(totalValue)}</span>
              </div>
            </CardContent>
          </Card>

          {item.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Stock by Warehouse</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stockRows.length === 0 ? (
                <EmptyState icon={Boxes} title="No stock recorded yet" compact />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockRows.map((r) => {
                      const status = getStockStatus(Number(r.quantity), Number(item.reorder_point));
                      const statusMeta = STOCK_STATUS_META[status];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.warehouse?.name ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.quantity} {item.unit}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                              {statusMeta.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Movement History</CardTitle>
              <CardDescription>Most recent 100 movements for this item.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <EmptyState icon={Boxes} title="No movements yet" compact />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => {
                      const typeMeta = STOCK_MOVEMENT_TYPE_META[m.movement_type] ?? {
                        label: m.movement_type ?? 'Unknown',
                        color: 'bg-muted text-muted-foreground',
                      };
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(m.created_at)}
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
                            {m.quantity} {item.unit}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {m.created_by_user?.full_name ?? '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <MovementDialog
        mode={movementMode}
        open={movementOpen}
        onOpenChange={setMovementOpen}
        items={[item]}
        warehouses={warehouses}
        stockRows={stockRows}
        presetItemId={item.id}
        onSuccess={handleMovementSuccess}
      />
    </div>
  );
}
