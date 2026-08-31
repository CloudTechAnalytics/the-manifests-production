import { supabase } from '@/shared/lib/supabase/client';
import type {
  Customer,
  CustomerContact,
  CustomerStatus,
  CustomerType,
  DocumentRecord,
  Quotation,
  Shipment,
} from '@/shared/types';

// --- Detail page -----------------------------------------------------------

export interface CustomerDetail {
  customer: Customer;
  contacts: CustomerContact[];
  shipments: Shipment[];
  quotations: Quotation[];
  documents: DocumentRecord[];
}

/**
 * Loads everything the customer detail page renders in one concurrent
 * batch — contacts/shipments/quotations/documents only depend on
 * customerId, not on the customer row itself resolving first. Returns
 * null when the customer doesn't exist (or isn't visible to the caller),
 * same "not found" signal the page used before.
 */
export async function fetchCustomerDetail(
  customerId: string
): Promise<CustomerDetail | null> {
  const [custRes, ctctsRes, shipsRes, quotsRes, docsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*, branch:branches(*)')
      .eq('id', customerId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false }),
    supabase
      .from('shipments')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('quotations')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (custRes.error) {
    console.error('Error loading customer:', custRes.error);
    return null;
  }
  if (!custRes.data) {
    return null;
  }

  return {
    customer: custRes.data as Customer,
    contacts: (ctctsRes.data as CustomerContact[]) ?? [],
    shipments: (shipsRes.data as Shipment[]) ?? [],
    quotations: (quotsRes.data as Quotation[]) ?? [],
    documents: (docsRes.data as DocumentRecord[]) ?? [],
  };
}

/**
 * Soft-deletes a customer and logs the activity. Used for the
 * non-admin delete path — admins go through `adminForceDelete` (a
 * shared edge-function helper, already outside inline supabase calls)
 * instead.
 */
export async function softDeleteCustomer(params: {
  customerId: string;
  updatedBy: string;
  branchId: string | null;
  companyName: string;
}): Promise<void> {
  const { customerId, updatedBy, branchId, companyName } = params;

  const { error } = await supabase
    .from('customers')
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq('id', customerId);

  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'customer.deleted',
    entity_type: 'customer',
    entity_id: customerId,
    description: `Deleted customer "${companyName}"`,
    metadata: { company_name: companyName },
  });
}

// --- Edit page ---------------------------------------------------------

export interface CustomerForEdit {
  customer: Customer;
  contacts: CustomerContact[];
}

export async function fetchCustomerForEdit(
  customerId: string
): Promise<CustomerForEdit | null> {
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (custErr || !cust) {
    return null;
  }

  const { data: ctcts } = await supabase
    .from('customer_contacts')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false });

  return {
    customer: cust as Customer,
    contacts: (ctcts as CustomerContact[]) ?? [],
  };
}

export interface ContactFormValues {
  id?: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

export interface CustomerFormValues {
  company_name: string;
  type: CustomerType;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  website: string;
  notes: string;
  status: CustomerStatus;
  contacts: ContactFormValues[];
}

/**
 * Updates a customer, syncs its contacts (soft-delete removed, upsert
 * existing, insert new — at most one primary), and logs the activity.
 * Mirrors the previous inline sequence in the edit page's submit handler
 * exactly, contact-sync errors included (logged, not thrown).
 */
export async function updateCustomerWithContacts(params: {
  customerId: string;
  values: CustomerFormValues;
  existingContactIds: string[];
  updatedBy: string;
}): Promise<void> {
  const { customerId, values, existingContactIds, updatedBy } = params;

  // 1. Update customer
  const { error: custErr } = await supabase
    .from('customers')
    .update({
      company_name: values.company_name,
      type: values.type,
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
      city: values.city || null,
      country: values.country,
      website: values.website || null,
      notes: values.notes || null,
      status: values.status,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  if (custErr) throw custErr;

  // 2. Sync contacts: upsert existing, insert new, soft-delete removed
  const submittedIds = values.contacts
    .map((c) => c.id)
    .filter((id): id is string => Boolean(id));
  const removedIds = existingContactIds.filter(
    (id) => !submittedIds.includes(id)
  );

  // Soft-delete removed contacts
  if (removedIds.length > 0) {
    const { error: delErr } = await supabase
      .from('customer_contacts')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', removedIds);
    if (delErr) console.error('Contact delete error:', delErr);
  }

  // Upsert each contact — at most one primary: the first marked
  // primary wins, matching the new-customer form's enforcement (no
  // DB constraint prevents multiple, so this has to happen here).
  let primaryAssigned = false;
  for (const c of values.contacts) {
    const isPrimary = c.is_primary && !primaryAssigned;
    if (isPrimary) primaryAssigned = true;
    const payload = {
      customer_id: customerId,
      name: c.name,
      title: c.title || null,
      email: c.email || null,
      phone: c.phone || null,
      is_primary: isPrimary,
    };

    if (c.id) {
      // Update existing
      const { error: upErr } = await supabase
        .from('customer_contacts')
        .update(payload)
        .eq('id', c.id);
      if (upErr) console.error('Contact update error:', upErr);
    } else {
      // Insert new
      const { error: insErr } = await supabase
        .from('customer_contacts')
        .insert(payload);
      if (insErr) console.error('Contact insert error:', insErr);
    }
  }

  // 3. Log activity
  const { data: branchRow } = await supabase
    .from('customers')
    .select('branch_id')
    .eq('id', customerId)
    .single();

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchRow?.branch_id ?? '',
    action: 'customer.updated',
    entity_type: 'customer',
    entity_id: customerId,
    description: `Updated customer "${values.company_name}"`,
    metadata: { company_name: values.company_name },
  });
}

// --- New page ------------------------------------------------------------

/**
 * Soft check only — RLS already scopes this to customers the caller can
 * see, and a same-named company in a different org is invisible here,
 * which is correct. This warns, it never blocks: duplicates can be
 * legitimate (a sister company, a branch office under the same name).
 */
export async function findDuplicateCompanyName(
  name: string
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data } = await supabase
    .from('customers')
    .select('company_name')
    .ilike('company_name', trimmed)
    .is('deleted_at', null)
    .limit(1);

  return data && data.length > 0 ? data[0].company_name : null;
}

/**
 * Creates a customer, its contacts (if any), and logs the activity.
 * Contact-insert and activity-log failures are non-fatal — mirrors the
 * previous inline behavior (a toast warning, or a console.error, rather
 * than rolling back the created customer).
 */
export async function createCustomer(params: {
  values: CustomerFormValues;
  branchId: string;
  createdBy: string;
}): Promise<{ customerId: string; contactsFailed: boolean }> {
  const { values, branchId, createdBy } = params;

  // 1. Insert customer
  const { data: customerData, error: customerError } = await supabase
    .from('customers')
    .insert({
      company_name: values.company_name,
      type: values.type,
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
      city: values.city || null,
      country: values.country,
      website: values.website || null,
      notes: values.notes || null,
      status: values.status,
      branch_id: branchId,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select('id')
    .single();

  if (customerError || !customerData) {
    throw new Error(customerError?.message ?? 'Failed to create customer');
  }

  const customerId = customerData.id;
  let contactsFailed = false;

  // 2. Insert contacts (if any)
  if (values.contacts.length > 0) {
    // Ensure at most one primary contact: the first marked primary wins
    let primaryAssigned = false;
    const contactsPayload = values.contacts.map((c) => {
      const isPrimary = c.is_primary && !primaryAssigned;
      if (isPrimary) primaryAssigned = true;
      return {
        customer_id: customerId,
        name: c.name,
        title: c.title || null,
        email: c.email || null,
        phone: c.phone || null,
        is_primary: isPrimary,
      };
    });

    const { error: contactsError } = await supabase
      .from('customer_contacts')
      .insert(contactsPayload);

    if (contactsError) {
      console.error('Contacts insert error:', contactsError);
      contactsFailed = true;
    }
  }

  // 3. Log activity
  const { error: activityError } = await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: branchId,
    action: 'customer.created',
    entity_type: 'customer',
    entity_id: customerId,
    description: `Created customer "${values.company_name}"`,
    metadata: { company_name: values.company_name, type: values.type },
  });

  if (activityError) {
    console.error('Activity log error:', activityError);
  }

  return { customerId, contactsFailed };
}
