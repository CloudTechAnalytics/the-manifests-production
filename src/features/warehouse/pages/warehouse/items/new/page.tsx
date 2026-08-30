'use client';

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Boxes, Loader2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { useBranchSelector } from '@/shared/hooks/use-branch-selector';
import { BranchSelectField } from '@/shared/components/branch-select-field';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import type { Warehouse } from '@/shared/types';

const itemSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Item name is required'),
  category: z.string().optional().or(z.literal('')),
  unit: z.string().min(1, 'Unit is required'),
  unit_cost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  reorder_point: z.coerce.number().min(0, 'Reorder point cannot be negative'),
  notes: z.string().optional().or(z.literal('')),
  initial_warehouse_id: z.string().optional().or(z.literal('')),
  initial_quantity: z.coerce.number().min(0).optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

export default function NewStockItemPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const isAdmin = profile?.role === 'admin';
  const myBranchId = profile?.branch_id ?? null;
  const [branchError, setBranchError] = useState('');
  const {
    needsSelection: needsBranchSelection,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    branchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      sku: '',
      name: '',
      category: '',
      unit: 'units',
      unit_cost: 0,
      reorder_point: 0,
      notes: '',
      initial_warehouse_id: '',
      initial_quantity: 0,
    },
  });

  const initialWarehouseId = watch('initial_warehouse_id');

  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('warehouses')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (!isAdmin && myBranchId) query = query.eq('branch_id', myBranchId);
    query.then(({ data, error }) => {
      if (error) return console.error('Error loading warehouses:', error);
      setWarehouses((data as Warehouse[]) ?? []);
    });
  }, [profile, isAdmin, myBranchId]);

  const onSubmit = async (values: ItemFormValues) => {
    if (!profile?.id) return;
    if (!branchId) {
      setBranchError('Please select a branch');
      return;
    }
    setBranchError('');
    setSubmitting(true);
    try {
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
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, name')
        .single();

      if (error || !item) {
        throw new Error(error?.message ?? 'Failed to create item');
      }

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'stock_item.created',
        entity_type: 'stock_item',
        entity_id: item.id,
        description: `Added item "${item.name}" to the catalog`,
      });

      if (values.initial_warehouse_id && values.initial_quantity && values.initial_quantity > 0) {
        const { error: moveError } = await supabase.from('stock_movements').insert({
          item_id: item.id,
          warehouse_id: values.initial_warehouse_id,
          branch_id: branchId,
          movement_type: 'inbound',
          quantity: values.initial_quantity,
          reference: 'Initial stock',
          created_by: profile.id,
        });
        if (moveError) {
          toast.warning('Item created, but initial stock failed to save.');
        }
      }

      toast.success('Item added to catalog');
      navigate(`/warehouse/items/${item.id}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create item');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/warehouse">Warehouse</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Item</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to="/warehouse">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Boxes className="h-6 w-6 text-primary" />
            New Item
          </h1>
          <p className="text-sm text-muted-foreground">Add a new item to your warehouse catalog.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {needsBranchSelection && (
          <BranchSelectField
            branches={branches}
            value={selectedBranchId}
            onChange={setSelectedBranchId}
            loading={branchesLoading}
            error={branchError}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Item Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  Item Name <span className="text-destructive">*</span>
                </Label>
                <Input id="name" placeholder="Engine Oil 15W-40" {...control.register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku">
                  SKU / Barcode <span className="text-destructive">*</span>
                </Label>
                <Input id="sku" placeholder="OIL-15W40-001" {...control.register('sku')} />
                {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Input id="category" placeholder="Lubricants" {...control.register('category')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit">
                  Unit <span className="text-destructive">*</span>
                </Label>
                <Input id="unit" placeholder="units" {...control.register('unit')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit_cost">
                  Unit Cost <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="unit_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  {...control.register('unit_cost', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reorder_point">
                  Reorder Point <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reorder_point"
                  type="number"
                  step="1"
                  min="0"
                  {...control.register('reorder_point', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
                />
                <p className="text-xs text-muted-foreground">
                  Stock at or below this quantity is flagged &quot;Low Stock&quot;.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} {...control.register('notes')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Initial Stock (optional)</CardTitle>
            <CardDescription>
              Stock this item into a warehouse right away, or leave blank and receive stock later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="initial_warehouse_id">Warehouse</Label>
                <Controller
                  control={control}
                  name="initial_warehouse_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="initial_warehouse_id">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {warehouses.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No warehouses yet —{' '}
                    <Link to="/warehouse/locations" className="text-primary hover:underline">
                      add one first
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="initial_quantity">Quantity</Label>
                <Input
                  id="initial_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!initialWarehouseId}
                  {...control.register('initial_quantity', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/warehouse" className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Add Item
          </Button>
        </div>
      </form>
    </div>
  );
}
