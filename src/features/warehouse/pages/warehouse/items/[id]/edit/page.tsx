'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Boxes, Loader2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
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
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import type { StockItem } from '@/shared/types';

const itemSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Item name is required'),
  category: z.string().optional().or(z.literal('')),
  unit: z.string().min(1, 'Unit is required'),
  unit_cost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  reorder_point: z.coerce.number().min(0, 'Reorder point cannot be negative'),
  notes: z.string().optional().or(z.literal('')),
});

type ItemFormValues = z.infer<typeof itemSchema>;

export default function EditStockItemPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const itemId = params.id!;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [itemName, setItemName] = useState<string | null>(null);
  const [itemBranchId, setItemBranchId] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
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
    },
  });

  const loadItem = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_items')
        .select('*')
        .eq('id', itemId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        return;
      }

      const item = data as StockItem;
      setItemName(item.name);
      setItemBranchId(item.branch_id);
      reset({
        sku: item.sku,
        name: item.name,
        category: item.category ?? '',
        unit: item.unit,
        unit_cost: Number(item.unit_cost),
        reorder_point: Number(item.reorder_point),
        notes: item.notes ?? '',
      });
    } finally {
      setLoading(false);
    }
  }, [itemId, reset]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const onSubmit = async (values: ItemFormValues) => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
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
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: itemBranchId,
        action: 'stock_item.updated',
        entity_type: 'stock_item',
        entity_id: itemId,
        description: `Updated item "${values.name.trim()}"`,
      });

      toast.success('Item updated successfully');
      navigate(`/warehouse/items/${itemId}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update item');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (notFound) {
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
            <BreadcrumbLink asChild>
              <Link to={`/warehouse/items/${itemId}`}>{itemName ?? 'Item'}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to={`/warehouse/items/${itemId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Boxes className="h-6 w-6 text-primary" />
            Edit Item
          </h1>
          <p className="text-sm text-muted-foreground">{itemName}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Item Details</CardTitle>
            <CardDescription>
              Stock quantity isn&apos;t edited here — use Receive, Issue, Adjust, or Transfer on
              the item&apos;s page to change quantities.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  Item Name <span className="text-destructive">*</span>
                </Label>
                <Input id="name" {...control.register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku">
                  SKU / Barcode <span className="text-destructive">*</span>
                </Label>
                <Input id="sku" {...control.register('sku')} />
                {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Input id="category" {...control.register('category')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit">
                  Unit <span className="text-destructive">*</span>
                </Label>
                <Input id="unit" {...control.register('unit')} />
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
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} {...control.register('notes')} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link to={`/warehouse/items/${itemId}`} className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
