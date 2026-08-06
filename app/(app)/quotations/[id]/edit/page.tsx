'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getErrorMessage } from '@/lib/utils';
import {
  quotationSchema,
  computeQuotationTotals,
  computeLineTotal,
  type QuotationFormValues,
} from '@/lib/quotation-schema';
import { CustomerSection } from '@/components/quotations/customer-section';
import { ShipmentInfoSection, CargoInfoSection } from '@/components/quotations/shipment-cargo-section';
import { ServicesChargeSection } from '@/components/quotations/services-charge-section';
import {
  PaymentTermsSection,
  RequiredDocumentsSection,
  ValiditySection,
} from '@/components/quotations/payment-docs-validity-section';
import { QuotationSummaryPanel } from '@/components/quotations/quotation-summary-panel';
import type { Customer, Profile, Quotation, QuotationItem, QuotationStatus } from '@/types';

type QuotationWithItems = Quotation & { items: QuotationItem[] };

export default function EditQuotationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const quotationId = params.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quotation, setQuotation] = useState<QuotationWithItems | null>(null);
  const [existingItemIds, setExistingItemIds] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [salesReps, setSalesReps] = useState<Profile[]>([]);

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const methods = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
  });
  const { handleSubmit, reset } = methods;

  const loadCustomers = useCallback(async () => {
    if (!profile) return;
    setLoadingCustomers(true);
    try {
      let query = supabase
        .from('customers')
        .select('*, branch:branches(*)')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('company_name', { ascending: true });
      if (!isAdmin && userBranchId) {
        query = query.eq('branch_id', userBranchId);
      }
      const { data } = await query;
      setCustomers((data as Customer[]) ?? []);
    } finally {
      setLoadingCustomers(false);
    }
  }, [profile, isAdmin, userBranchId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const loadQuotation = useCallback(async () => {
    if (!quotationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, items:quotation_items(*)')
        .eq('id', quotationId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) {
        setQuotation(null);
        return;
      }

      const q = data as QuotationWithItems;
      setQuotation(q);
      setExistingItemIds((q.items ?? []).filter((i) => !i.deleted_at).map((i) => i.id));

      reset({
        customer_id: q.customer_id,
        contact_person: q.contact_person ?? '',
        contact_email: q.contact_email ?? '',
        contact_phone: q.contact_phone ?? '',
        sales_rep_id: q.sales_rep_id ?? '',
        shipment_direction: q.shipment_direction ?? 'import',
        shipment_type: q.shipment_type ?? 'sea',
        cargo_type: q.cargo_type ?? '',
        incoterm: q.incoterm ?? '',
        currency: q.currency,
        origin_country: q.origin_country ?? '',
        origin_port: q.origin_port ?? q.origin ?? '',
        destination_country: q.destination_country ?? '',
        destination_port: q.destination_port ?? q.destination ?? '',
        expected_shipping_date: q.expected_shipping_date ?? '',
        expected_arrival_date: q.expected_arrival_date ?? '',
        commodity_description: q.commodity_description ?? '',
        hs_code: q.hs_code ?? '',
        container_count: q.container_count ?? undefined,
        container_size: q.container_size ?? '',
        weight: q.weight ?? undefined,
        weight_unit: (q.weight_unit as 'KG' | 'TON') ?? 'KG',
        cbm: q.cbm ?? undefined,
        packages_count: q.packages_count ?? undefined,
        package_type: q.package_type ?? '',
        dangerous_cargo: q.dangerous_cargo,
        temperature_controlled: q.temperature_controlled,
        insurance_required: q.insurance_required,
        cargo_value: q.cargo_value ?? undefined,
        services: q.services ?? [],
        items: (q.items ?? [])
          .filter((i) => !i.deleted_at)
          .map((i) => ({
            id: i.id,
            service_key: i.service_key,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_rate: i.discount_rate,
            tax_rate: i.tax_rate,
          })),
        payment_terms: q.payment_terms ?? '',
        payment_method: q.payment_method ?? '',
        required_documents: q.required_documents ?? [],
        valid_until: q.valid_until ? q.valid_until.slice(0, 10) : '',
        priority: q.priority ?? 'normal',
        notes: q.notes ?? '',
        customer_notes: q.customer_notes ?? '',
        terms: q.terms ?? '',
      });
    } finally {
      setLoading(false);
    }
  }, [quotationId, reset]);

  useEffect(() => {
    loadQuotation();
  }, [loadQuotation]);

  useEffect(() => {
    if (!quotation?.branch_id) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('branch_id', quotation.branch_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })
      .then(({ data }) => setSalesReps((data as Profile[]) ?? []));
  }, [quotation?.branch_id]);

  const onSubmit = async (values: QuotationFormValues) => {
    if (!profile || !quotation) return;
    setSubmitting(true);
    try {
      const totals = computeQuotationTotals(values.items);

      const { error: quotationError } = await supabase
        .from('quotations')
        .update({
          customer_id: values.customer_id,
          contact_person: values.contact_person || null,
          contact_email: values.contact_email || null,
          contact_phone: values.contact_phone || null,
          sales_rep_id: values.sales_rep_id || null,
          shipment_direction: values.shipment_direction,
          shipment_type: values.shipment_type,
          cargo_type: values.cargo_type || null,
          incoterm: values.incoterm || null,
          origin: values.origin_port,
          destination: values.destination_port,
          origin_country: values.origin_country || null,
          origin_port: values.origin_port,
          destination_country: values.destination_country || null,
          destination_port: values.destination_port,
          expected_shipping_date: values.expected_shipping_date || null,
          expected_arrival_date: values.expected_arrival_date || null,
          commodity_description: values.commodity_description || null,
          hs_code: values.hs_code || null,
          container_count: values.container_count ?? null,
          container_size: values.container_size || null,
          weight: values.weight ?? null,
          weight_unit: values.weight_unit,
          cbm: values.cbm ?? null,
          packages_count: values.packages_count ?? null,
          package_type: values.package_type || null,
          dangerous_cargo: values.dangerous_cargo,
          temperature_controlled: values.temperature_controlled,
          insurance_required: values.insurance_required,
          cargo_value: values.cargo_value ?? null,
          services: values.services,
          payment_terms: values.payment_terms || null,
          payment_method: values.payment_method || null,
          required_documents: values.required_documents,
          priority: values.priority,
          valid_until: values.valid_until,
          currency: values.currency,
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          total: totals.total,
          notes: values.notes || null,
          customer_notes: values.customer_notes || null,
          terms: values.terms || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotationId);

      if (quotationError) throw quotationError;

      // Sync charge rows: soft-delete removed, update existing, insert new —
      // same pattern this page already used before the ERP expansion.
      const submittedIds = values.items.map((i) => i.id).filter((id): id is string => Boolean(id));
      const removedIds = existingItemIds.filter((id) => !submittedIds.includes(id));

      if (removedIds.length > 0) {
        const { error: delErr } = await supabase
          .from('quotation_items')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', removedIds);
        if (delErr) console.error('Item delete error:', delErr);
      }

      for (const item of values.items) {
        const payload = {
          quotation_id: quotationId,
          service_key: item.service_key,
          description: item.description,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          discount_rate: Number(item.discount_rate),
          tax_rate: Number(item.tax_rate),
          total: Math.round(computeLineTotal(item) * 100) / 100,
        };

        if (item.id) {
          const { error: upErr } = await supabase
            .from('quotation_items')
            .update(payload)
            .eq('id', item.id);
          if (upErr) console.error('Item update error:', upErr);
        } else {
          const { error: insErr } = await supabase.from('quotation_items').insert(payload);
          if (insErr) console.error('Item insert error:', insErr);
        }
      }

      const customer = customers.find((c) => c.id === values.customer_id);
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.updated',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Updated quotation for "${customer?.company_name ?? 'Unknown customer'}"`,
      });

      toast.success('Quotation updated successfully');
      router.push(`/quotations/${quotationId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update quotation'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Quotation not found</h2>
          <p className="text-sm text-muted-foreground">
            This quotation may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/quotations">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Quotations
          </Button>
        </Link>
      </div>
    );
  }

  if (quotation.converted_shipment_id) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">This quotation has already converted to a shipment</h2>
          <p className="text-sm text-muted-foreground">
            Edit the live shipment instead — changes here would no longer be reflected there.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/quotations/${quotationId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Quotation
            </Button>
          </Link>
          <Link href={`/shipments/${quotation.converted_shipment_id}`}>
            <Button size="sm">View Shipment</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/quotations">Quotations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/quotations/${quotationId}`}>
                {quotation.quotation_number ?? 'Quotation'}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href={`/quotations/${quotationId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <FileText className="h-6 w-6 text-primary" />
            Edit Quotation
          </h1>
          <p className="text-sm text-muted-foreground">{quotation.quotation_number}</p>
        </div>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <CustomerSection
              customers={customers}
              loadingCustomers={loadingCustomers}
              salesReps={salesReps}
              branchId={quotation.branch_id}
              onCustomerCreated={(c) => {
                setCustomers((prev) => [...prev, c].sort((a, b) => a.company_name.localeCompare(b.company_name)));
                methods.setValue('customer_id', c.id);
              }}
            />
            <ShipmentInfoSection />
            <CargoInfoSection />
            <ServicesChargeSection />
            <PaymentTermsSection />
            <RequiredDocumentsSection />
            <ValiditySection />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link href={`/quotations/${quotationId}`} className="sm:shrink-0">
                <Button type="button" variant="outline" className="w-full sm:w-auto">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <QuotationSummaryPanel customers={customers} status={quotation.status as QuotationStatus} />
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
