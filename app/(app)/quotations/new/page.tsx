'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { useBranchSelector } from '@/hooks/use-branch-selector';
import { BranchSelectField } from '@/components/shared/branch-select-field';
import { Button } from '@/components/ui/button';
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
  QUOTATION_FORM_DEFAULTS,
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
import { ScopeOfServiceSection } from '@/components/quotations/scope-of-service-section';
import { QuotationSummaryPanel } from '@/components/quotations/quotation-summary-panel';
import type { Customer, Profile } from '@/types';

export default function NewQuotationPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [salesReps, setSalesReps] = useState<Profile[]>([]);

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;
  const [branchError, setBranchError] = useState('');
  const {
    needsSelection: needsBranchSelection,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    branchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);

  const methods = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: QUOTATION_FORM_DEFAULTS,
  });
  const { handleSubmit } = methods;

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

      const { data, error } = await query;
      if (error) {
        console.error('Error loading customers:', error);
        setCustomers([]);
        return;
      }
      setCustomers((data as Customer[]) ?? []);
    } finally {
      setLoadingCustomers(false);
    }
  }, [profile, isAdmin, userBranchId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Sales rep options — staff in the branch the quotation will belong to.
  useEffect(() => {
    if (!branchId) {
      setSalesReps([]);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })
      .then(({ data }) => setSalesReps((data as Profile[]) ?? []));
  }, [branchId]);

  const onSubmit = async (values: QuotationFormValues) => {
    if (!profile?.id) {
      toast.error('Unable to determine current user.');
      return;
    }
    if (!branchId) {
      setBranchError('Please select a branch');
      return;
    }
    setBranchError('');
    setSubmitting(true);
    try {
      const totals = computeQuotationTotals(values.items);

      const { data: quotationData, error: quotationError } = await supabase
        .from('quotations')
        .insert({
          customer_id: values.customer_id,
          branch_id: branchId,
          status: 'draft',
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
          excluded_services: values.excluded_services,
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
          requested_by: profile.id,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id')
        .single();

      if (quotationError || !quotationData) {
        throw new Error(quotationError?.message ?? 'Failed to create quotation');
      }

      const quotationId = quotationData.id;

      const itemsPayload = values.items.map((item, index) => ({
        quotation_id: quotationId,
        service_key: item.service_key,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount_rate: Number(item.discount_rate),
        tax_rate: Number(item.tax_rate),
        unit: item.unit || null,
        notes: item.notes || null,
        sort_order: index,
        total: Math.round(computeLineTotal(item) * 100) / 100,
      }));

      const { error: itemsError } = await supabase.from('quotation_items').insert(itemsPayload);
      if (itemsError) {
        console.error('Items insert error:', itemsError);
        toast.warning('Quotation created, but some charges failed to save.');
      }

      const customer = customers.find((c) => c.id === values.customer_id);
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'quotation.created',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Created quotation for "${customer?.company_name ?? 'Unknown customer'}"`,
        metadata: {
          customer_id: values.customer_id,
          customer_name: customer?.company_name,
          shipment_type: values.shipment_type,
          total: totals.total,
          currency: values.currency,
        },
      });

      toast.success('Quotation created successfully');
      router.push(`/quotations/${quotationId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create quotation'));
    } finally {
      setSubmitting(false);
    }
  };

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
            <BreadcrumbPage>New Quotation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href="/quotations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <FileText className="h-6 w-6 text-primary" />
            New Quotation
          </h1>
          <p className="text-sm text-muted-foreground">
            Capture everything Operations will need once this converts to a shipment.
          </p>
        </div>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {needsBranchSelection && (
              <BranchSelectField
                branches={branches}
                value={selectedBranchId}
                onChange={setSelectedBranchId}
                loading={branchesLoading}
                error={branchError}
              />
            )}

            <CustomerSection
              customers={customers}
              loadingCustomers={loadingCustomers}
              salesReps={salesReps}
              branchId={branchId}
              onCustomerCreated={(c) => {
                setCustomers((prev) => [...prev, c].sort((a, b) => a.company_name.localeCompare(b.company_name)));
                methods.setValue('customer_id', c.id);
              }}
            />
            <ShipmentInfoSection />
            <CargoInfoSection />
            <ServicesChargeSection />
            <ScopeOfServiceSection />
            <PaymentTermsSection />
            <RequiredDocumentsSection />
            <ValiditySection />

            <div className="sticky bottom-0 -mx-6 flex flex-col-reverse gap-3 border-t border-border bg-background px-6 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:rounded-lg sm:border">
              <Link href="/quotations" className="sm:shrink-0">
                <Button type="button" variant="outline" className="w-full sm:w-auto">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save Draft
              </Button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <QuotationSummaryPanel customers={customers} />
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
