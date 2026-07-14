'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PRIORITY_META } from '@/lib/utils/status';
import type { ShipmentPlan, Profile, ShipmentType, PriorityLevel } from '@/types';

const planSchema = z.object({
  priority: z.enum(['low', 'medium', 'high']),
  shipment_type: z.enum(['air', 'sea', 'road', 'rail', 'multimodal']).optional().or(z.literal('')),
  origin: z.string().optional().or(z.literal('')),
  destination: z.string().optional().or(z.literal('')),
  incoterm: z.string().optional().or(z.literal('')),
  commodity: z.string().optional().or(z.literal('')),
  goods_value: z.coerce.number().min(0).optional(),
  goods_value_currency: z.string().min(1),
  insurance_required: z.boolean(),
  total_packages: z.coerce.number().min(0).optional(),
  total_weight: z.coerce.number().min(0).optional(),
  total_volume: z.coerce.number().min(0).optional(),
  hs_code: z.string().optional().or(z.literal('')),
  cargo_description: z.string().optional().or(z.literal('')),
  special_instructions: z.string().optional().or(z.literal('')),
  container_type: z.string().optional().or(z.literal('')),
  container_quantity: z.coerce.number().min(0).optional(),
  equipment_supplier: z.string().optional().or(z.literal('')),
  container_pickup_date: z.string().optional().or(z.literal('')),
  container_return_date: z.string().optional().or(z.literal('')),
  carrier_line: z.string().optional().or(z.literal('')),
  vessel_name: z.string().optional().or(z.literal('')),
  voyage_number: z.string().optional().or(z.literal('')),
  port_of_loading: z.string().optional().or(z.literal('')),
  port_of_discharge: z.string().optional().or(z.literal('')),
  service_route: z.string().optional().or(z.literal('')),
  pre_carriage_mode: z.string().optional().or(z.literal('')),
  transport_carrier: z.string().optional().or(z.literal('')),
  truck_number: z.string().optional().or(z.literal('')),
  estimated_transport_time: z.string().optional().or(z.literal('')),
  booking_confirmed_date: z.string().optional().or(z.literal('')),
  documentation_date: z.string().optional().or(z.literal('')),
  cargo_ready_date: z.string().optional().or(z.literal('')),
  planned_etd: z.string().optional().or(z.literal('')),
  planned_eta: z.string().optional().or(z.literal('')),
  delivery_date: z.string().optional().or(z.literal('')),
  estimated_cost: z.coerce.number().min(0).optional(),
  estimated_revenue: z.coerce.number().min(0).optional(),
  risk_level: z.enum(['low', 'medium', 'high']).optional().or(z.literal('')),
  assigned_to: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

type PlanFormValues = z.infer<typeof planSchema>;

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

export default function EditPlanPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const planId = params.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [planNumber, setPlanNumber] = useState<string | null>(null);
  const [staff, setStaff] = useState<Profile[]>([]);

  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: { priority: 'medium', goods_value_currency: 'NGN', insurance_required: false },
  });

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipment_plans')
        .select('*')
        .eq('id', planId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        return;
      }

      const p = data as ShipmentPlan;
      setPlanNumber(p.plan_number);
      reset({
        priority: p.priority,
        shipment_type: p.shipment_type ?? '',
        origin: p.origin ?? '',
        destination: p.destination ?? '',
        incoterm: p.incoterm ?? '',
        commodity: p.commodity ?? '',
        goods_value: p.goods_value ?? undefined,
        goods_value_currency: p.goods_value_currency,
        insurance_required: p.insurance_required,
        total_packages: p.total_packages ?? undefined,
        total_weight: p.total_weight ?? undefined,
        total_volume: p.total_volume ?? undefined,
        hs_code: p.hs_code ?? '',
        cargo_description: p.cargo_description ?? '',
        special_instructions: p.special_instructions ?? '',
        container_type: p.container_type ?? '',
        container_quantity: p.container_quantity ?? undefined,
        equipment_supplier: p.equipment_supplier ?? '',
        container_pickup_date: p.container_pickup_date ?? '',
        container_return_date: p.container_return_date ?? '',
        carrier_line: p.carrier_line ?? '',
        vessel_name: p.vessel_name ?? '',
        voyage_number: p.voyage_number ?? '',
        port_of_loading: p.port_of_loading ?? '',
        port_of_discharge: p.port_of_discharge ?? '',
        service_route: p.service_route ?? '',
        pre_carriage_mode: p.pre_carriage_mode ?? '',
        transport_carrier: p.transport_carrier ?? '',
        truck_number: p.truck_number ?? '',
        estimated_transport_time: p.estimated_transport_time ?? '',
        booking_confirmed_date: p.booking_confirmed_date ?? '',
        documentation_date: p.documentation_date ?? '',
        cargo_ready_date: p.cargo_ready_date ?? '',
        planned_etd: p.planned_etd ?? '',
        planned_eta: p.planned_eta ?? '',
        delivery_date: p.delivery_date ?? '',
        estimated_cost: p.estimated_cost ?? undefined,
        estimated_revenue: p.estimated_revenue ?? undefined,
        risk_level: p.risk_level ?? '',
        assigned_to: p.assigned_to ?? '',
        notes: p.notes ?? '',
      });
    } finally {
      setLoading(false);
    }
  }, [planId, reset]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (!isAdmin && branchId) query = query.eq('branch_id', branchId);
    query.then(({ data, error }) => {
      if (error) return console.error('Error loading staff:', error);
      setStaff((data as Profile[]) ?? []);
    });
  }, [profile, isAdmin, branchId]);

  const onSubmit = async (values: PlanFormValues) => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({
          priority: values.priority,
          shipment_type: values.shipment_type || null,
          origin: values.origin || null,
          destination: values.destination || null,
          incoterm: values.incoterm || null,
          commodity: values.commodity || null,
          goods_value: values.goods_value ?? null,
          goods_value_currency: values.goods_value_currency,
          insurance_required: values.insurance_required,
          total_packages: values.total_packages ?? null,
          total_weight: values.total_weight ?? null,
          total_volume: values.total_volume ?? null,
          hs_code: values.hs_code || null,
          cargo_description: values.cargo_description || null,
          special_instructions: values.special_instructions || null,
          container_type: values.container_type || null,
          container_quantity: values.container_quantity ?? null,
          equipment_supplier: values.equipment_supplier || null,
          container_pickup_date: values.container_pickup_date || null,
          container_return_date: values.container_return_date || null,
          carrier_line: values.carrier_line || null,
          vessel_name: values.vessel_name || null,
          voyage_number: values.voyage_number || null,
          port_of_loading: values.port_of_loading || null,
          port_of_discharge: values.port_of_discharge || null,
          service_route: values.service_route || null,
          pre_carriage_mode: values.pre_carriage_mode || null,
          transport_carrier: values.transport_carrier || null,
          truck_number: values.truck_number || null,
          estimated_transport_time: values.estimated_transport_time || null,
          booking_confirmed_date: values.booking_confirmed_date || null,
          documentation_date: values.documentation_date || null,
          cargo_ready_date: values.cargo_ready_date || null,
          planned_etd: values.planned_etd || null,
          planned_eta: values.planned_eta || null,
          delivery_date: values.delivery_date || null,
          estimated_cost: values.estimated_cost ?? null,
          estimated_revenue: values.estimated_revenue ?? null,
          risk_level: values.risk_level || null,
          assigned_to: values.assigned_to || null,
          notes: values.notes || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId);

      if (error) throw error;

      toast.success('Plan updated successfully');
      router.push(`/planning/${planId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update plan';
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
          <ClipboardList className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Plan not found</h2>
          <p className="text-sm text-muted-foreground">
            This plan may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/planning">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Planning
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
              <Link href="/planning">Planning</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/planning/${planId}`}>{planNumber}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href={`/planning/${planId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-medium tracking-tight">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            Edit Plan
          </h1>
          <p className="text-sm text-muted-foreground">{planNumber}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Overview</CardTitle>
            <CardDescription>Customer and linked quotation can&apos;t be changed after creation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v as PriorityLevel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORITY_META) as PriorityLevel[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_META[p].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Controller
                  control={control}
                  name="shipment_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v as ShipmentType)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="air">Air Freight</SelectItem>
                        <SelectItem value="sea">Sea Freight</SelectItem>
                        <SelectItem value="road">Road Freight</SelectItem>
                        <SelectItem value="rail">Rail Freight</SelectItem>
                        <SelectItem value="multimodal">Multimodal</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Origin</Label>
                <Input {...control.register('origin')} />
              </div>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Input {...control.register('destination')} />
              </div>

              <div className="space-y-1.5">
                <Label>Incoterm</Label>
                <Input {...control.register('incoterm')} />
              </div>
              <div className="space-y-1.5">
                <Label>Commodity</Label>
                <Input {...control.register('commodity')} />
              </div>

              <div className="space-y-1.5">
                <Label>Goods Value</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    {...control.register('goods_value', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                  />
                  <Controller
                    control={control}
                    name="goods_value_currency"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-24 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="flex items-end space-x-2 pb-2">
                <Controller
                  control={control}
                  name="insurance_required"
                  render={({ field }) => (
                    <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} id="insurance" />
                  )}
                />
                <Label htmlFor="insurance" className="font-normal">Insurance required</Label>
              </div>

              <div className="space-y-1.5">
                <Label>Total Packages</Label>
                <Input
                  type="number"
                  min="0"
                  {...control.register('total_packages', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...control.register('total_weight', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total Volume (CBM)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...control.register('total_volume', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>HS Code</Label>
                <Input {...control.register('hs_code')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Cargo Description</Label>
              <Textarea rows={2} {...control.register('cargo_description')} />
            </div>
            <div className="space-y-1.5">
              <Label>Special Instructions</Label>
              <Textarea rows={2} {...control.register('special_instructions')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Container Plan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Container Type</Label>
              <Input {...control.register('container_type')} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0"
                {...control.register('container_quantity', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Equipment Supplier</Label>
              <Input {...control.register('equipment_supplier')} />
            </div>
            <div className="space-y-1.5" />
            <div className="space-y-1.5">
              <Label>Pick Up Date</Label>
              <Input type="date" {...control.register('container_pickup_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Return Date</Label>
              <Input type="date" {...control.register('container_return_date')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Vessel & Routing</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Carrier / Line</Label>
              <Input {...control.register('carrier_line')} />
            </div>
            <div className="space-y-1.5">
              <Label>Vessel</Label>
              <Input {...control.register('vessel_name')} />
            </div>
            <div className="space-y-1.5">
              <Label>Voyage</Label>
              <Input {...control.register('voyage_number')} />
            </div>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Input {...control.register('service_route')} />
            </div>
            <div className="space-y-1.5">
              <Label>Port of Loading</Label>
              <Input {...control.register('port_of_loading')} />
            </div>
            <div className="space-y-1.5">
              <Label>Port of Discharge</Label>
              <Input {...control.register('port_of_discharge')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Transport Plan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pre-Carriage</Label>
              <Input {...control.register('pre_carriage_mode')} />
            </div>
            <div className="space-y-1.5">
              <Label>Carrier / Driver</Label>
              <Input {...control.register('transport_carrier')} />
            </div>
            <div className="space-y-1.5">
              <Label>Truck Number</Label>
              <Input {...control.register('truck_number')} />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Time</Label>
              <Input {...control.register('estimated_transport_time')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Booking Confirmed</Label>
              <Input type="date" {...control.register('booking_confirmed_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Documentation</Label>
              <Input type="date" {...control.register('documentation_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo Ready</Label>
              <Input type="date" {...control.register('cargo_ready_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Planned ETD</Label>
              <Input type="date" {...control.register('planned_etd')} />
            </div>
            <div className="space-y-1.5">
              <Label>Planned ETA</Label>
              <Input type="date" {...control.register('planned_eta')} />
            </div>
            <div className="space-y-1.5">
              <Label>Delivery</Label>
              <Input type="date" {...control.register('delivery_date')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Financials & Assignment</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estimated Cost</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...control.register('estimated_cost', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Revenue</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...control.register('estimated_revenue', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Risk Level</Label>
              <Controller
                control={control}
                name="risk_level"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Not assessed" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORITY_META) as PriorityLevel[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_META[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Controller
                control={control}
                name="assigned_to"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={3} {...control.register('notes')} />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href={`/planning/${planId}`} className="sm:shrink-0">
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
