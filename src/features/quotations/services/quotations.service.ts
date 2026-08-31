import { supabase } from '@/shared/lib/supabase/client';
import type {
  Branch,
  Customer,
  Organization,
  Profile,
  Quotation,
  QuotationItem,
  QuotationStatus,
} from '@/shared/types';

// --- Detail page -----------------------------------------------------------

export type QuotationDetail = Quotation & {
  customer: Customer | null;
  branch: Branch | null;
  items: QuotationItem[];
  sales_rep: Profile | null;
  requested_by_user: Profile | null;
  approved_by_user: Profile | null;
};

export async function fetchQuotationDetail(
  quotationId: string
): Promise<QuotationDetail | null> {
  const { data, error } = await supabase
    .from('quotations')
    .select(
      `*, customer:customers(*), branch:branches(*), items:quotation_items(*),
       sales_rep:profiles!quotations_sales_rep_id_fkey(id, full_name),
       requested_by_user:profiles!quotations_requested_by_fkey(id, full_name),
       approved_by_user:profiles!quotations_approved_by_fkey(id, full_name),
       sent_by_user:profiles!quotations_sent_by_fkey(id, full_name)`
    )
    .eq('id', quotationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('Error loading quotation:', error);
    return null;
  }
  if (!data) return null;

  const q = data as QuotationDetail;
  q.items = (q.items ?? [])
    .filter((i) => !i.deleted_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return q;
}

export type QuotationOrgSettings = Pick<
  Organization,
  | 'name'
  | 'logo_url'
  | 'quotation_approval_required'
  | 'quotation_discount_threshold_percent'
  | 'quotation_amount_threshold'
>;

export async function fetchQuotationOrgSettings(
  organizationId: string
): Promise<QuotationOrgSettings | null> {
  const { data } = await supabase
    .from('organizations')
    .select(
      'name, logo_url, quotation_approval_required, quotation_discount_threshold_percent, quotation_amount_threshold'
    )
    .eq('id', organizationId)
    .maybeSingle();
  return data ?? null;
}

/** Logs a "viewed" activity — the page only calls this once per session per quotation. */
export async function logQuotationViewed(params: {
  userId: string;
  branchId: string;
  quotationId: string;
  quotationNumber: string | null;
}): Promise<void> {
  await supabase.from('activities').insert({
    user_id: params.userId,
    branch_id: params.branchId,
    action: 'quotation.viewed',
    entity_type: 'quotation',
    entity_id: params.quotationId,
    description: `Viewed quotation ${params.quotationNumber ?? ''}`,
  });
}

/**
 * Applies a status transition and logs the activity. Approval/sent
 * metadata (approved_by/approval_date, sent_by/sent_at) is filled in
 * exactly as the page did inline; email notification is a separate,
 * best-effort step the page still owns (not a `.from()`/`.rpc()` call).
 */
export async function updateQuotationStatus(params: {
  quotationId: string;
  profileId: string;
  branchId: string;
  target: QuotationStatus;
  notes?: string;
  currentStatus: QuotationStatus;
  currentStatusLabel: string;
  targetStatusLabel: string;
  quotationNumber: string | null;
}): Promise<void> {
  const { quotationId, profileId, branchId, target, notes, currentStatus, currentStatusLabel, targetStatusLabel, quotationNumber } = params;

  const updatePayload: Record<string, unknown> = {
    status: target,
    updated_by: profileId,
    updated_at: new Date().toISOString(),
  };
  if (target === 'approved') {
    updatePayload.approved_by = profileId;
    updatePayload.approval_date = new Date().toISOString();
    if (notes) updatePayload.approval_notes = notes;
  }
  if (target === 'sent') {
    updatePayload.sent_by = profileId;
    updatePayload.sent_at = new Date().toISOString();
  }
  if ((target === 'rejected' || target === 'cancelled') && notes) {
    updatePayload.approval_notes = notes;
  }

  const { error } = await supabase.from('quotations').update(updatePayload).eq('id', quotationId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: profileId,
    branch_id: branchId,
    action: 'quotation.status_changed',
    entity_type: 'quotation',
    entity_id: quotationId,
    description: `Quotation ${quotationNumber ?? ''} status changed from "${currentStatusLabel}" to "${targetStatusLabel}"`,
    metadata: { from: currentStatus, to: target, quotation_number: quotationNumber },
  });
}

export async function softDeleteQuotation(params: {
  quotationId: string;
  profileId: string;
  branchId: string;
  quotationNumber: string | null;
  customerId: string | null;
}): Promise<void> {
  const { quotationId, profileId, branchId, quotationNumber, customerId } = params;

  const { error } = await supabase
    .from('quotations')
    .update({ deleted_at: new Date().toISOString(), updated_by: profileId })
    .eq('id', quotationId);

  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: profileId,
    branch_id: branchId,
    action: 'quotation.deleted',
    entity_type: 'quotation',
    entity_id: quotationId,
    description: `Deleted quotation ${quotationNumber ?? ''}`,
    metadata: { quotation_number: quotationNumber, customer_id: customerId },
  });
}

function cloneQuotationItemsPayload(quotationId: string, items: QuotationItem[]) {
  return items.map((item, index) => ({
    quotation_id: quotationId,
    service_key: item.service_key,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_rate: item.discount_rate,
    tax_rate: item.tax_rate,
    unit: item.unit,
    notes: item.notes,
    billing_basis: item.billing_basis,
    cost_centre: item.cost_centre,
    gl_account: item.gl_account,
    internal_reference: item.internal_reference,
    tax_code: item.tax_code,
    sort_order: index,
    total: item.total,
  }));
}

/**
 * Clones a quotation (and its charges) into a brand new draft — an
 * unrelated fresh quotation, not a revision (that's `createQuotationVersion`).
 */
export async function duplicateQuotation(params: {
  quotation: QuotationDetail;
  profileId: string;
}): Promise<{ newId: string; itemsFailed: boolean }> {
  const { quotation, profileId } = params;

  const { data: newQuotation, error: quoteError } = await supabase
    .from('quotations')
    .insert({
      customer_id: quotation.customer_id,
      branch_id: quotation.branch_id,
      status: 'draft',
      contact_person: quotation.contact_person,
      contact_email: quotation.contact_email,
      contact_phone: quotation.contact_phone,
      sales_rep_id: quotation.sales_rep_id,
      shipment_direction: quotation.shipment_direction,
      shipment_type: quotation.shipment_type,
      cargo_type: quotation.cargo_type,
      incoterm: quotation.incoterm,
      origin: quotation.origin,
      destination: quotation.destination,
      origin_country: quotation.origin_country,
      origin_port: quotation.origin_port,
      destination_country: quotation.destination_country,
      destination_port: quotation.destination_port,
      expected_shipping_date: quotation.expected_shipping_date,
      expected_arrival_date: quotation.expected_arrival_date,
      commodity_description: quotation.commodity_description,
      hs_code: quotation.hs_code,
      container_count: quotation.container_count,
      container_size: quotation.container_size,
      weight: quotation.weight,
      weight_unit: quotation.weight_unit,
      cbm: quotation.cbm,
      packages_count: quotation.packages_count,
      package_type: quotation.package_type,
      dangerous_cargo: quotation.dangerous_cargo,
      temperature_controlled: quotation.temperature_controlled,
      insurance_required: quotation.insurance_required,
      cargo_value: quotation.cargo_value,
      services: quotation.services,
      excluded_services: quotation.excluded_services,
      payment_terms: quotation.payment_terms,
      payment_method: quotation.payment_method,
      required_documents: quotation.required_documents,
      priority: quotation.priority,
      valid_until: quotation.valid_until,
      subtotal: quotation.subtotal,
      tax_amount: quotation.tax_amount,
      total: quotation.total,
      currency: quotation.currency,
      notes: quotation.notes,
      customer_notes: quotation.customer_notes,
      terms: quotation.terms,
      requested_by: profileId,
      created_by: profileId,
      updated_by: profileId,
    })
    .select('id')
    .single();

  if (quoteError || !newQuotation) {
    throw new Error(quoteError?.message ?? 'Failed to duplicate quotation');
  }

  const newId = newQuotation.id;
  let itemsFailed = false;

  if (quotation.items && quotation.items.length > 0) {
    const { error: itemsError } = await supabase
      .from('quotation_items')
      .insert(cloneQuotationItemsPayload(newId, quotation.items));
    if (itemsError) {
      console.error('Items clone error:', itemsError);
      itemsFailed = true;
    }
  }

  await supabase.from('activities').insert({
    user_id: profileId,
    branch_id: quotation.branch_id,
    action: 'quotation.duplicated',
    entity_type: 'quotation',
    entity_id: newId,
    description: `Duplicated quotation ${quotation.quotation_number ?? ''}`,
    metadata: {
      source_quotation_id: quotation.id,
      source_quotation_number: quotation.quotation_number,
      new_quotation_id: newId,
    },
  });

  return { newId, itemsFailed };
}

/**
 * Clones a quotation into a new, linked revision (parent/root/version),
 * then flips the source row to no-longer-latest.
 */
export async function createQuotationVersion(params: {
  quotation: QuotationDetail;
  profileId: string;
}): Promise<{ newId: string; itemsFailed: boolean }> {
  const { quotation, profileId } = params;
  const rootId = quotation.root_quotation_id ?? quotation.id;

  const { data: newQuotation, error: quoteError } = await supabase
    .from('quotations')
    .insert({
      customer_id: quotation.customer_id,
      branch_id: quotation.branch_id,
      status: 'draft',
      parent_quotation_id: quotation.id,
      root_quotation_id: rootId,
      version: quotation.version + 1,
      is_latest_version: true,
      contact_person: quotation.contact_person,
      contact_email: quotation.contact_email,
      contact_phone: quotation.contact_phone,
      sales_rep_id: quotation.sales_rep_id,
      shipment_direction: quotation.shipment_direction,
      shipment_type: quotation.shipment_type,
      cargo_type: quotation.cargo_type,
      incoterm: quotation.incoterm,
      origin: quotation.origin,
      destination: quotation.destination,
      origin_country: quotation.origin_country,
      origin_port: quotation.origin_port,
      destination_country: quotation.destination_country,
      destination_port: quotation.destination_port,
      expected_shipping_date: quotation.expected_shipping_date,
      expected_arrival_date: quotation.expected_arrival_date,
      commodity_description: quotation.commodity_description,
      hs_code: quotation.hs_code,
      container_count: quotation.container_count,
      container_size: quotation.container_size,
      weight: quotation.weight,
      weight_unit: quotation.weight_unit,
      cbm: quotation.cbm,
      packages_count: quotation.packages_count,
      package_type: quotation.package_type,
      dangerous_cargo: quotation.dangerous_cargo,
      temperature_controlled: quotation.temperature_controlled,
      insurance_required: quotation.insurance_required,
      cargo_value: quotation.cargo_value,
      services: quotation.services,
      excluded_services: quotation.excluded_services,
      payment_terms: quotation.payment_terms,
      payment_method: quotation.payment_method,
      required_documents: quotation.required_documents,
      priority: quotation.priority,
      valid_until: quotation.valid_until,
      subtotal: quotation.subtotal,
      tax_amount: quotation.tax_amount,
      total: quotation.total,
      currency: quotation.currency,
      notes: quotation.notes,
      customer_notes: quotation.customer_notes,
      terms: quotation.terms,
      requested_by: profileId,
      created_by: profileId,
      updated_by: profileId,
    })
    .select('id')
    .single();

  if (quoteError || !newQuotation) {
    throw new Error(quoteError?.message ?? 'Failed to create new version');
  }

  const newId = newQuotation.id;
  let itemsFailed = false;

  if (quotation.items && quotation.items.length > 0) {
    const { error: itemsError } = await supabase
      .from('quotation_items')
      .insert(cloneQuotationItemsPayload(newId, quotation.items));
    if (itemsError) {
      console.error('Items clone error:', itemsError);
      itemsFailed = true;
    }
  }

  const { error: flipError } = await supabase
    .from('quotations')
    .update({ is_latest_version: false, updated_by: profileId })
    .eq('id', quotation.id);
  if (flipError) console.error('Failed to flip previous version:', flipError);

  await supabase.from('activities').insert({
    user_id: profileId,
    branch_id: quotation.branch_id,
    action: 'quotation.version_created',
    entity_type: 'quotation',
    entity_id: newId,
    description: `Created version ${quotation.version + 1} of quotation ${quotation.quotation_number ?? ''}`,
    metadata: { source_quotation_id: quotation.id, new_quotation_id: newId, version: quotation.version + 1 },
  });

  return { newId, itemsFailed };
}

export async function logQuotationPdfDownloaded(params: {
  userId: string;
  branchId: string;
  quotationId: string;
  quotationNumber: string | null;
}): Promise<void> {
  await supabase.from('activities').insert({
    user_id: params.userId,
    branch_id: params.branchId,
    action: 'quotation.pdf_downloaded',
    entity_type: 'quotation',
    entity_id: params.quotationId,
    description: `Downloaded PDF for quotation ${params.quotationNumber ?? ''}`,
  });
}

// --- Shared by new/edit forms ----------------------------------------------

export async function fetchActiveCustomersForQuotationForm(params: {
  isAdmin: boolean;
  branchId: string | null;
}): Promise<Customer[]> {
  let query = supabase
    .from('customers')
    .select('*, branch:branches(*)')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('company_name', { ascending: true });

  if (!params.isAdmin && params.branchId) {
    query = query.eq('branch_id', params.branchId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading customers:', error);
    return [];
  }
  return (data as Customer[]) ?? [];
}

export async function fetchSalesRepsForBranch(branchId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });
  return (data as Profile[]) ?? [];
}

// --- Edit page ---------------------------------------------------------

export type QuotationWithItems = Quotation & { items: QuotationItem[] };

export async function fetchQuotationForEdit(
  quotationId: string
): Promise<QuotationWithItems | null> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, items:quotation_items(*)')
    .eq('id', quotationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as QuotationWithItems;
}

function quotationItemPayload(quotationId: string, item: {
  id?: string;
  service_key: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_rate: number | string;
  tax_rate: number | string;
  unit?: string;
  notes?: string;
  billing_basis?: string;
  cost_centre?: string;
  gl_account?: string;
  internal_reference?: string;
  tax_code?: string;
}, index: number, total: number) {
  return {
    quotation_id: quotationId,
    service_key: item.service_key,
    description: item.description,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    discount_rate: Number(item.discount_rate),
    tax_rate: Number(item.tax_rate),
    unit: item.unit || null,
    notes: item.notes || null,
    billing_basis: item.billing_basis || null,
    cost_centre: item.cost_centre || null,
    gl_account: item.gl_account || null,
    internal_reference: item.internal_reference || null,
    tax_code: item.tax_code || null,
    sort_order: index,
    total,
  };
}

export interface QuotationItemFormValues {
  id?: string;
  service_key: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_rate: number | string;
  tax_rate: number | string;
  unit?: string;
  notes?: string;
  billing_basis?: string;
  cost_centre?: string;
  gl_account?: string;
  internal_reference?: string;
  tax_code?: string;
}

/**
 * Updates a quotation, syncs its charge rows (soft-delete removed,
 * update existing, insert new), and logs the activity. Shared by both
 * the explicit "Save Changes" submit and the silent 30s auto-save —
 * callers decide how to surface success/failure.
 */
export async function saveQuotationEdit(params: {
  quotationId: string;
  branchId: string;
  profileId: string;
  quotationPayload: Record<string, unknown>;
  items: QuotationItemFormValues[];
  itemTotals: number[];
  existingItemIds: string[];
  customerName: string | undefined;
}): Promise<void> {
  const { quotationId, branchId, profileId, quotationPayload, items, itemTotals, existingItemIds, customerName } = params;

  const { error: quotationError } = await supabase
    .from('quotations')
    .update(quotationPayload)
    .eq('id', quotationId);

  if (quotationError) throw quotationError;

  // Sync charge rows: soft-delete removed, update existing, insert new
  const submittedIds = items.map((i) => i.id).filter((id): id is string => Boolean(id));
  const removedIds = existingItemIds.filter((id) => !submittedIds.includes(id));

  if (removedIds.length > 0) {
    const { error: delErr } = await supabase
      .from('quotation_items')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', removedIds);
    if (delErr) console.error('Item delete error:', delErr);
  }

  for (const [index, item] of items.entries()) {
    const payload = quotationItemPayload(quotationId, item, index, itemTotals[index]);

    if (item.id) {
      const { error: upErr } = await supabase.from('quotation_items').update(payload).eq('id', item.id);
      if (upErr) console.error('Item update error:', upErr);
    } else {
      const { error: insErr } = await supabase.from('quotation_items').insert(payload);
      if (insErr) console.error('Item insert error:', insErr);
    }
  }

  await supabase.from('activities').insert({
    user_id: profileId,
    branch_id: branchId,
    action: 'quotation.updated',
    entity_type: 'quotation',
    entity_id: quotationId,
    description: `Updated quotation for "${customerName ?? 'Unknown customer'}"`,
  });
}

// --- New page ------------------------------------------------------------

/**
 * Creates a quotation, its charge rows, and logs the activity. Mirrors
 * the previous inline sequence — an items-insert failure is non-fatal
 * (a toast warning, the created quotation still stands).
 */
export async function createQuotation(params: {
  branchId: string;
  profileId: string;
  quotationPayload: Record<string, unknown>;
  items: QuotationItemFormValues[];
  itemTotals: number[];
  customerName: string | undefined;
  activityMetadata: Record<string, unknown>;
}): Promise<{ quotationId: string; itemsFailed: boolean }> {
  const { branchId, profileId, quotationPayload, items, itemTotals, customerName, activityMetadata } = params;

  const { data: quotationData, error: quotationError } = await supabase
    .from('quotations')
    .insert(quotationPayload)
    .select('id')
    .single();

  if (quotationError || !quotationData) {
    throw new Error(quotationError?.message ?? 'Failed to create quotation');
  }

  const quotationId = quotationData.id;
  let itemsFailed = false;

  const itemsPayload = items.map((item, index) =>
    quotationItemPayload(quotationId, item, index, itemTotals[index])
  );

  const { error: itemsError } = await supabase.from('quotation_items').insert(itemsPayload);
  if (itemsError) {
    console.error('Items insert error:', itemsError);
    itemsFailed = true;
  }

  await supabase.from('activities').insert({
    user_id: profileId,
    branch_id: branchId,
    action: 'quotation.created',
    entity_type: 'quotation',
    entity_id: quotationId,
    description: `Created quotation for "${customerName ?? 'Unknown customer'}"`,
    metadata: activityMetadata,
  });

  return { quotationId, itemsFailed };
}
