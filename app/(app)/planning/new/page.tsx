'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import type { Customer, Quotation, Profile, ShipmentType, PriorityLevel } from '@/types';

const planSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  quotation_id: z.string().optional().or(z.literal('')),
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
  assigned_to: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

type PlanFormValues = z.infer<typeof planSchema>;

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

export default function NewPlanPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);

  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      customer_id: '',
      quotation_id: '',
      priority: 'medium',
      shipment_type: '',
      origin: '',
      destination: '',
      goods_value_currency: 'NGN',
      insurance_required: false,
      assigned_to: '',
    },
  });

  const selectedCustomerId = watch('customer_id');

  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .order('company_name', { ascending: true });
    if (!isAdmin && branchId) query = query.eq('branch_id', branchId);
    query.then(({ data, error }) => {
      if (error) return console.error('Error loading customers:', error);
      setCustomers((data as Customer[]) ?? []);
    });

    let staffQuery = supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (!isAdmin && branchId) staffQuery = staffQuery.eq('branch_id', branchId);
    staffQuery.then(({ data, error }) => {
      if (error) return console.error('Error loading staff:', error);
      setStaff((data as Profile[]) ?? []);
    });
  }, [profile, isAdmin, branchId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setQuotations([]);
      return;
    }
    supabase
      .from('quotations')
      .select('*')
      .eq('customer_id', selectedCustomerId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) return console.error('Error loading quotations:', error);
        setQuotations((data as Quotation[]) ?? []);
      });
  }, [selectedCustomerId]);

  const handleQuotationSelect = (quotationId: string) => {
    setValue('quotation_id', quotationId);
    const q = quotations.find((x) => x.id === quotationId);
    if (!q) return;
    if (q.shipment_type) setValue('shipment_type', q.shipment_type);
    if (q.origin) setValue('origin', q.origin);
    if (q.destination) setValue('destination', q.destination);
    setValue('goods_value_currency', q.currency);
  };

  const onSubmit = async (values: PlanFormValues) => {
    if (!profile?.branch_id || !profile.id) {
      toast.error('Your account is not assigned to a branch.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('shipment_plans')
        .insert({
          customer_id: values.customer_id,
          quotation_id: values.quotation_id || null,
          branch_id: profile.branch_id,
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
          planned_by: profile.id,
          assigned_to: values.assigned_to || null,
          notes: values.notes || null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, plan_number')
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to create plan');
      }

      const customer = customers.find((c) => c.id === values.customer_id);
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: profile.branch_id,
        action: 'plan.created',
        entity_type: 'shipment_plan',
        entity_id: data.id,
        description: `Created plan ${data.plan_number ?? ''} for "${customer?.company_name ?? 'Unknown customer'}"`,
        metadata: { customer_id: values.customer_id },
      });

      toast.success('Plan created — fill in container, vessel, and transport details as they become available.');
      router.push(`/planning/${data.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create plan';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/planning">Planning</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Plan</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href="/planning">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            New Plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Start with the essentials — you can add container, vessel, and transport details
            later as they're confirmed.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  Customer <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="customer_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.customer_id && (
                  <p className="text-xs text-destructive">{errors.customer_id.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Approved Quotation (optional)</Label>
                <Controller
                  control={control}
                  name="quotation_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={handleQuotationSelect} disabled={!selectedCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Link a quotation" />
                      </SelectTrigger>
                      <SelectContent>
                        {quotations.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.quotation_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

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
                <Input placeholder="Lagos, Nigeria" {...control.register('origin')} />
              </div>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Input placeholder="London, UK" {...control.register('destination')} />
              </div>

              <div className="space-y-1.5">
                <Label>Incoterm</Label>
                <Input placeholder="FOB" {...control.register('incoterm')} />
              </div>
              <div className="space-y-1.5">
                <Label>Commodity</Label>
                <Input placeholder="Machinery Parts" {...control.register('commodity')} />
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
                <Input placeholder="8428.10.00" {...control.register('hs_code')} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
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
            <CardTitle className="text-base font-semibold">Notes</CardTitle>
            <CardDescription>
              Container, vessel/routing, transport, milestones, and cost estimate can all be
              filled in from the plan&apos;s page once you have them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea rows={3} {...control.register('notes')} />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href="/planning" className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create Plan
          </Button>
        </div>
      </form>
    </div>
  );
}
