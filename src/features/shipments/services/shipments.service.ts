import { supabase } from '@/shared/lib/supabase/client';
import { seedShipmentStages } from '@/shared/lib/utils/seed-shipment-stages';
import type {
  Branch,
  CargoClaim,
  CargoClaimAgainst,
  CargoClaimStatus,
  CargoClaimType,
  CargoInsurancePolicy,
  Customer,
  CustomsBond,
  DeliveryOrder,
  DocumentRecord,
  Expense,
  ExposureStatus,
  ExposureType,
  FinancialExposure,
  Profile,
  Quotation,
  ResponsibleParty,
  Shipment,
  ShipmentContainer,
  ShipmentCustoms,
  ShipmentExamination,
  ShipmentStage,
  ShipmentStageComment,
  ShipmentStatus,
  ShipmentTask,
  ShipmentTimelineEntry,
  ShipmentTransportation,
  ShipmentType,
  TerminalOperation,
  DGPackingGroup,
  PlanTaskStatus,
} from '@/shared/types';

// =====================================================================
// Detail page ([id]/page.tsx)
// =====================================================================

export type ShipmentDetailRow = Shipment & {
  customer: Customer | null;
  branch: Branch | null;
  assigned_user: Profile | null;
};

export type ShipmentTimelineRow = ShipmentTimelineEntry & {
  user: { id: string; full_name: string } | null;
};

export interface ShipmentDetailData {
  shipment: ShipmentDetailRow;
  timeline: ShipmentTimelineRow[];
  documents: DocumentRecord[];
  customsRecord: ShipmentCustoms | null;
  terminalRecord: TerminalOperation | null;
  examinations: ShipmentExamination[];
  transportLegs: ShipmentTransportation[];
  containers: ShipmentContainer[];
  insurancePolicies: CargoInsurancePolicy[];
  claims: CargoClaim[];
  deliveryOrders: DeliveryOrder[];
  customsBonds: CustomsBond[];
}

/**
 * Loads everything the shipment detail page renders in one concurrent
 * batch. Mirrors the previous inline Promise.all exactly — each of these
 * only depends on shipmentId, not on each other.
 */
export async function fetchShipmentDetail(
  shipmentId: string
): Promise<ShipmentDetailData | null> {
  const [
    { data: ship, error: shipErr },
    { data: tl },
    { data: docs },
    { data: customs },
    { data: terminal },
    { data: exams },
    { data: legs },
    { data: containerRows },
    { data: insuranceRows },
    { data: claimRows },
    { data: doRows },
    { data: bondRows },
  ] = await Promise.all([
    supabase
      .from('shipments')
      .select(
        '*, customer:customers(*), branch:branches(*), assigned_user:profiles!shipments_assigned_to_fkey(*)'
      )
      .eq('id', shipmentId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('shipment_timeline')
      .select('*, user:profiles!shipment_timeline_created_by_fkey(id, full_name)')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('shipment_customs')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('terminal_operations')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('shipment_examinations')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('shipment_transportation')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('shipment_containers')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('cargo_insurance_policies')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('cargo_claims')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('delivery_orders')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('issued_at', { ascending: false }),
    supabase
      .from('customs_bonds')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (shipErr) {
    console.error('Error loading shipment:', shipErr);
    return null;
  }
  if (!ship) {
    return null;
  }

  return {
    shipment: ship as ShipmentDetailRow,
    timeline: (tl as ShipmentTimelineRow[]) ?? [],
    documents: (docs as DocumentRecord[]) ?? [],
    customsRecord: (customs as ShipmentCustoms) ?? null,
    terminalRecord: (terminal as TerminalOperation) ?? null,
    examinations: (exams as ShipmentExamination[]) ?? [],
    transportLegs: (legs as ShipmentTransportation[]) ?? [],
    containers: (containerRows as ShipmentContainer[]) ?? [],
    insurancePolicies: (insuranceRows as CargoInsurancePolicy[]) ?? [],
    claims: (claimRows as CargoClaim[]) ?? [],
    deliveryOrders: (doRows as DeliveryOrder[]) ?? [],
    customsBonds: (bondRows as CustomsBond[]) ?? [],
  };
}

/**
 * Status-update path used by the header "Update Status" dropdown.
 * Timeline/activity insert failures are logged only, not thrown — same
 * as the previous inline handler.
 */
export async function updateShipmentStatus(params: {
  shipmentId: string;
  target: ShipmentStatus;
  fromLabel: string;
  toLabel: string;
  updatedBy: string;
  branchId: string;
  referenceNumber: string | null;
}): Promise<void> {
  const { shipmentId, target, fromLabel, toLabel, updatedBy, branchId, referenceNumber } = params;

  const { error: updateError } = await supabase
    .from('shipments')
    .update({
      status: target,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shipmentId);

  if (updateError) throw updateError;

  const { error: timelineError } = await supabase.from('shipment_timeline').insert({
    shipment_id: shipmentId,
    status: target,
    notes: `Status updated to "${toLabel}"`,
    created_by: updatedBy,
  });

  if (timelineError) {
    console.error('Timeline insert error:', timelineError);
  }

  const { error: activityError } = await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'shipment.status_changed',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Shipment ${referenceNumber ?? ''} status changed from "${fromLabel}" to "${toLabel}"`,
    metadata: {
      from: target,
      to: target,
      reference_number: referenceNumber,
    },
  });

  if (activityError) {
    console.error('Activity log error:', activityError);
  }
}

/**
 * Timeline-entry path used by the Timeline tab's "Add Timeline Entry"
 * form. Unlike updateShipmentStatus, a timeline insert failure here
 * throws (surfacing as a toast) — mirrors the previous inline handler.
 * The activity insert is fire-and-forget, its result never checked,
 * same as before.
 */
export async function addShipmentTimelineEntry(params: {
  shipmentId: string;
  status: ShipmentStatus;
  notes: string | null;
  statusLabel: string;
  updatedBy: string;
  branchId: string;
  referenceNumber: string | null;
}): Promise<void> {
  const { shipmentId, status, notes, statusLabel, updatedBy, branchId, referenceNumber } = params;

  const { error: updateError } = await supabase
    .from('shipments')
    .update({
      status,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shipmentId);

  if (updateError) throw updateError;

  const { error: timelineError } = await supabase.from('shipment_timeline').insert({
    shipment_id: shipmentId,
    status,
    notes: notes || null,
    created_by: updatedBy,
  });

  if (timelineError) throw timelineError;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'shipment.timeline_added',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Timeline entry added to shipment ${referenceNumber ?? ''}: "${statusLabel}"`,
    metadata: {
      status,
      reference_number: referenceNumber,
    },
  });
}

/**
 * Non-admin soft-delete path — admins go through `adminForceDelete` (a
 * shared edge-function helper, already outside inline supabase calls)
 * instead. Activity insert result is never checked, same as before.
 */
export async function softDeleteShipment(params: {
  shipmentId: string;
  updatedBy: string;
  branchId: string;
  referenceNumber: string | null;
  customerId: string;
}): Promise<void> {
  const { shipmentId, updatedBy, branchId, referenceNumber, customerId } = params;

  const { error } = await supabase
    .from('shipments')
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq('id', shipmentId);

  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'shipment.deleted',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Deleted shipment ${referenceNumber ?? ''}`,
    metadata: {
      reference_number: referenceNumber,
      customer_id: customerId,
    },
  });
}

// =====================================================================
// New / Edit page shared lookups
// =====================================================================

export async function fetchActiveCustomersForBranch(params: {
  isAdmin: boolean;
  branchId: string | null;
}): Promise<Customer[]> {
  let query = supabase
    .from('customers')
    .select('*')
    .eq('status', 'active')
    .is('deleted_at', null)
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

export async function fetchAssignableUsersForBranch(params: {
  isAdmin: boolean;
  branchId: string | null;
}): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('*')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });

  if (!params.isAdmin && params.branchId) {
    query = query.eq('branch_id', params.branchId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading users:', error);
    return [];
  }
  return (data as Profile[]) ?? [];
}

export async function fetchApprovedQuotationsForCustomer(params: {
  customerId: string;
  isAdmin: boolean;
  branchId: string | null;
}): Promise<Quotation[]> {
  const { customerId, isAdmin, branchId } = params;
  if (!customerId) return [];

  let query = supabase
    .from('quotations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (!isAdmin && branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading quotations:', error);
    return [];
  }
  return (data as Quotation[]) ?? [];
}

// =====================================================================
// Edit page
// =====================================================================

export async function fetchShipmentForEdit(shipmentId: string): Promise<Shipment | null> {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', shipmentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as Shipment;
}

export interface ShipmentFormPayload {
  customer_id: string;
  quotation_id?: string;
  shipment_type: ShipmentType;
  origin: string;
  destination: string;
  assigned_to?: string;
  booking_date?: string;
  estimated_departure?: string;
  estimated_arrival?: string;
  carrier?: string;
  tracking_number?: string;
  container_number?: string;
  weight?: number | '' | null;
  volume?: number | '' | null;
  notes?: string;
}

export async function updateShipment(params: {
  shipmentId: string;
  values: ShipmentFormPayload;
  updatedBy: string;
  branchId: string;
  referenceNumber: string | null;
}): Promise<void> {
  const { shipmentId, values, updatedBy, branchId, referenceNumber } = params;

  const { error: shipmentError } = await supabase
    .from('shipments')
    .update({
      customer_id: values.customer_id,
      quotation_id: values.quotation_id || null,
      shipment_type: values.shipment_type,
      origin: values.origin,
      destination: values.destination,
      assigned_to: values.assigned_to || null,
      booking_date: values.booking_date || null,
      estimated_departure: values.estimated_departure || null,
      estimated_arrival: values.estimated_arrival || null,
      carrier: values.carrier || null,
      tracking_number: values.tracking_number || null,
      container_number: values.container_number || null,
      weight: values.weight === '' || values.weight == null ? null : Number(values.weight),
      volume: values.volume === '' || values.volume == null ? null : Number(values.volume),
      notes: values.notes || null,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shipmentId);

  if (shipmentError) throw shipmentError;

  const { error: activityError } = await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'shipment.updated',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Updated shipment ${referenceNumber ?? ''} details`,
    metadata: {
      reference_number: referenceNumber,
      shipment_type: values.shipment_type,
      origin: values.origin,
      destination: values.destination,
    },
  });

  if (activityError) {
    console.error('Activity log error:', activityError);
  }
}

// =====================================================================
// New page
// =====================================================================

export async function createShipment(params: {
  values: ShipmentFormPayload;
  branchId: string;
  createdBy: string;
}): Promise<{ shipmentId: string; referenceNumber: string | null }> {
  const { values, branchId, createdBy } = params;

  const { data: shipmentData, error: shipmentError } = await supabase
    .from('shipments')
    .insert({
      customer_id: values.customer_id,
      quotation_id: values.quotation_id || null,
      branch_id: branchId,
      shipment_type: values.shipment_type,
      origin: values.origin,
      destination: values.destination,
      status: 'planning',
      assigned_to: values.assigned_to || null,
      booking_date: values.booking_date || null,
      estimated_departure: values.estimated_departure || null,
      estimated_arrival: values.estimated_arrival || null,
      carrier: values.carrier || null,
      tracking_number: values.tracking_number || null,
      container_number: values.container_number || null,
      weight: values.weight === '' || values.weight == null ? null : Number(values.weight),
      volume: values.volume === '' || values.volume == null ? null : Number(values.volume),
      notes: values.notes || null,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select('id, reference_number')
    .single();

  if (shipmentError || !shipmentData) {
    throw new Error(shipmentError?.message ?? 'Failed to create shipment');
  }

  const shipmentId = shipmentData.id;
  const refNum = shipmentData.reference_number;

  const { error: timelineError } = await supabase.from('shipment_timeline').insert({
    shipment_id: shipmentId,
    status: 'planning',
    notes: 'Shipment created and recorded.',
    created_by: createdBy,
  });

  if (timelineError) {
    console.error('Timeline insert error:', timelineError);
  }

  const { error: activityError } = await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: branchId,
    action: 'shipment.created',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Created shipment ${refNum ?? '(pending ref)'} from ${values.origin} to ${values.destination}`,
    metadata: {
      reference_number: refNum,
      shipment_type: values.shipment_type,
      origin: values.origin,
      destination: values.destination,
    },
  });

  if (activityError) {
    console.error('Activity log error:', activityError);
  }

  try {
    await seedShipmentStages(shipmentId, branchId, createdBy);
  } catch (stageError) {
    console.error('Workflow stage seed error:', stageError);
  }

  return { shipmentId, referenceNumber: refNum };
}

// =====================================================================
// cargo-claims-panel.tsx
// =====================================================================

export interface CargoClaimFormPayload {
  claim_type: CargoClaimType;
  claimed_against: CargoClaimAgainst;
  claimed_against_name: string | null;
  insurance_policy_id: string | null;
  status: CargoClaimStatus;
  amount_claimed: number | null;
  amount_settled: number | null;
  currency: string;
  filed_date: string;
  resolved_date: string | null;
  description: string | null;
  notes: string | null;
}

export async function saveCargoClaim(params: {
  shipmentId: string;
  branchId: string;
  existingId: string | null;
  payload: CargoClaimFormPayload;
  updatedBy: string;
}): Promise<void> {
  const { shipmentId, branchId, existingId, payload, updatedBy } = params;
  const fullPayload = { ...payload, updated_by: updatedBy };

  if (existingId) {
    const { error } = await supabase.from('cargo_claims').update(fullPayload).eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('cargo_claims')
      .insert({ ...fullPayload, shipment_id: shipmentId, branch_id: branchId, created_by: updatedBy });
    if (error) throw error;
  }
}

// =====================================================================
// cargo-insurance-panel.tsx
// =====================================================================

export async function deleteCargoInsurancePolicy(params: {
  policyId: string;
  updatedBy: string;
}): Promise<void> {
  const { error } = await supabase
    .from('cargo_insurance_policies')
    .update({ deleted_at: new Date().toISOString(), updated_by: params.updatedBy })
    .eq('id', params.policyId);
  if (error) throw error;
}

export interface CargoInsurancePolicyFormPayload {
  insurer_name: string;
  policy_number: string | null;
  coverage_amount: number | null;
  currency: string;
  premium_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export async function saveCargoInsurancePolicy(params: {
  shipmentId: string;
  branchId: string;
  existingId: string | null;
  payload: CargoInsurancePolicyFormPayload;
  updatedBy: string;
}): Promise<void> {
  const { shipmentId, branchId, existingId, payload, updatedBy } = params;
  const fullPayload = { ...payload, updated_by: updatedBy };

  if (existingId) {
    const { error } = await supabase
      .from('cargo_insurance_policies')
      .update(fullPayload)
      .eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('cargo_insurance_policies')
      .insert({ ...fullPayload, shipment_id: shipmentId, branch_id: branchId, created_by: updatedBy });
    if (error) throw error;
  }
}

// =====================================================================
// delivery-orders-panel.tsx
// =====================================================================

export async function markDeliveryOrderExited(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_orders')
    .update({ exited_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

export async function createDeliveryOrder(params: {
  shipmentId: string;
  branchId: string;
  doNumber: string;
  validityHours: string;
  regenerationFee: string;
  logAsExpense: boolean;
  notes: string;
  predecessorId: string | null;
  createdBy: string;
}): Promise<void> {
  const {
    shipmentId,
    branchId,
    doNumber,
    validityHours,
    regenerationFee,
    logAsExpense,
    notes,
    predecessorId,
    createdBy,
  } = params;

  const hours = Number(validityHours) || 24;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + hours * 60 * 60 * 1000);
  const fee = regenerationFee ? Number(regenerationFee) : null;

  let expenseId: string | null = null;
  if (predecessorId && fee && logAsExpense) {
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        description: `Delivery order regeneration — ${doNumber || 'new DO'}`,
        category: 'delivery_order_regeneration',
        shipment_id: shipmentId,
        branch_id: branchId,
        amount: fee,
        currency: 'NGN',
        status: 'pending',
        created_by: createdBy,
      })
      .select('id')
      .single();
    if (expenseError) throw expenseError;
    expenseId = expense.id;
  }

  const { data: newOrder, error } = await supabase
    .from('delivery_orders')
    .insert({
      shipment_id: shipmentId,
      branch_id: branchId,
      do_number: doNumber.trim() || null,
      issued_at: issuedAt.toISOString(),
      validity_hours: hours,
      expires_at: expiresAt.toISOString(),
      regeneration_fee: predecessorId ? fee : null,
      expense_id: expenseId,
      notes: notes.trim() || null,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (predecessorId) {
    const { error: supersedeError } = await supabase
      .from('delivery_orders')
      .update({ superseded_by: newOrder.id })
      .eq('id', predecessorId);
    if (supersedeError) throw supersedeError;
  }
}

// =====================================================================
// financial-exposure-panel.tsx / financial-exposure-form-dialog.tsx
// =====================================================================

export async function fetchFinancialExposures(shipmentId: string): Promise<FinancialExposure[]> {
  const { data } = await supabase
    .from('financial_exposures')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false });
  return (data as FinancialExposure[] | null) ?? [];
}

export interface FinancialExposureFormPayload {
  exposure_type: ExposureType;
  start_date: string;
  free_days: number;
  end_date: string | null;
  charge_per_day: number;
  currency: string;
  responsible_party: ResponsibleParty;
  reason: string | null;
  status: ExposureStatus;
}

export async function saveFinancialExposure(params: {
  shipmentId: string;
  branchId: string;
  shipmentStatus: ShipmentStatus;
  existing: FinancialExposure | null;
  payload: FinancialExposureFormPayload;
  exposureTypeLabel: string;
  previousStatusLabel: string;
  newStatusLabel: string;
  chargePerDayFormatted: string;
  freeDays: number;
  updatedBy: string;
}): Promise<void> {
  const {
    shipmentId,
    branchId,
    shipmentStatus,
    existing,
    payload,
    exposureTypeLabel,
    previousStatusLabel,
    newStatusLabel,
    chargePerDayFormatted,
    freeDays,
    updatedBy,
  } = params;

  if (existing) {
    const statusChanged = payload.status !== existing.status;
    const updatePayload: Record<string, unknown> = { ...payload, updated_by: updatedBy };
    if (statusChanged && payload.status === 'approved' && existing.status !== 'approved') {
      updatePayload.approved_by = updatedBy;
      updatePayload.approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('financial_exposures')
      .update(updatePayload)
      .eq('id', existing.id);
    if (error) throw error;

    if (statusChanged) {
      await supabase.from('activities').insert({
        user_id: updatedBy,
        branch_id: branchId,
        action: 'financial_exposure.status_changed',
        entity_type: 'financial_exposure',
        entity_id: existing.id,
        description: `Financial exposure (${exposureTypeLabel}) status changed from "${previousStatusLabel}" to "${newStatusLabel}"`,
        metadata: { from: existing.status, to: payload.status, reason: payload.reason },
      });
    }
  } else {
    const { data: created, error } = await supabase
      .from('financial_exposures')
      .insert({ ...payload, updated_by: updatedBy, shipment_id: shipmentId, branch_id: branchId, created_by: updatedBy })
      .select('id')
      .single();
    if (error) throw error;

    await supabase.from('shipment_timeline').insert({
      shipment_id: shipmentId,
      status: shipmentStatus,
      notes: `Financial exposure recorded: ${exposureTypeLabel} (${chargePerDayFormatted}/day, ${freeDays} free days)`,
      created_by: updatedBy,
    });

    await supabase.from('activities').insert({
      user_id: updatedBy,
      branch_id: branchId,
      action: 'financial_exposure.created',
      entity_type: 'financial_exposure',
      entity_id: created?.id,
      description: `Financial exposure recorded: ${exposureTypeLabel}`,
      metadata: {
        exposure_type: payload.exposure_type,
        start_date: payload.start_date,
        free_days: payload.free_days,
        charge_per_day: payload.charge_per_day,
        currency: payload.currency,
        responsible_party: payload.responsible_party,
      },
    });
  }
}

// =====================================================================
// generate-invoice-from-expenses.tsx
// =====================================================================

export async function fetchApprovedExpensesForShipment(shipmentId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('shipment_id', shipmentId)
    .eq('status', 'approved')
    .is('deleted_at', null);
  if (error) {
    console.error('Failed to load expenses:', error.message);
  }
  return (data as Expense[]) ?? [];
}

export async function generateInvoiceFromExpenses(params: {
  shipmentId: string;
  branchId: string;
  customerId: string;
  total: number;
  currency: string;
  notes: string;
  expenseCount: number;
  createdBy: string;
}): Promise<{ invoiceId: string }> {
  const { shipmentId, branchId, customerId, total, currency, notes, expenseCount, createdBy } = params;

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      customer_id: customerId,
      shipment_id: shipmentId,
      quotation_id: null,
      branch_id: branchId,
      status: 'draft',
      subtotal: total,
      tax_amount: 0,
      total,
      currency,
      notes,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: branchId,
    action: 'invoice.generated_from_expenses',
    entity_type: 'invoices',
    entity_id: invoice.id,
    description: `Generated invoice from ${expenseCount} shipment expense(s)`,
  });

  return { invoiceId: invoice.id };
}

// =====================================================================
// lifecycle-timeline.tsx
// =====================================================================

export async function fetchShipmentStagesForTimeline(shipmentId: string): Promise<ShipmentStage[]> {
  const { data } = await supabase
    .from('shipment_stages')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('sequence', { ascending: true });
  return (data as ShipmentStage[] | null) ?? [];
}

// =====================================================================
// shipment-containers-panel.tsx
// =====================================================================

export async function deleteShipmentContainer(params: {
  containerId: string;
  updatedBy: string;
}): Promise<void> {
  const { error } = await supabase
    .from('shipment_containers')
    .update({ deleted_at: new Date().toISOString(), updated_by: params.updatedBy })
    .eq('id', params.containerId);
  if (error) throw error;
}

export interface ShipmentContainerFormPayload {
  bl_number: string | null;
  container_number: string | null;
  seal_number: string | null;
  container_type: string | null;
  tare_weight: number | null;
  gross_weight: number | null;
  status: string | null;
  is_dangerous_goods: boolean;
  un_number: string | null;
  imdg_class: string | null;
  packing_group: DGPackingGroup | null;
  expected_empty_pickup_date: string | null;
  expected_stuffing_date: string | null;
  expected_gate_in_date: string | null;
  expected_loading_date: string | null;
}

export async function saveShipmentContainer(params: {
  shipmentId: string;
  branchId: string;
  existingId: string | null;
  payload: ShipmentContainerFormPayload;
  updatedBy: string;
}): Promise<void> {
  const { shipmentId, branchId, existingId, payload, updatedBy } = params;
  const fullPayload = { ...payload, updated_by: updatedBy };

  if (existingId) {
    const { error } = await supabase
      .from('shipment_containers')
      .update(fullPayload)
      .eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('shipment_containers')
      .insert({ ...fullPayload, shipment_id: shipmentId, branch_id: branchId, created_by: updatedBy });
    if (error) throw error;
  }
}

// =====================================================================
// shipment-documentation-dialog.tsx
// =====================================================================

export async function fetchDocumentName(documentId: string): Promise<string | null> {
  const { data } = await supabase
    .from('documents')
    .select('name')
    .eq('id', documentId)
    .maybeSingle();
  return data?.name ?? null;
}

export interface ShipmentDocumentationFormPayload {
  incoterm: string | null;
  hs_code: string | null;
  commodity: string | null;
  mbl_number: string | null;
  hbl_number: string | null;
  awb_number: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  goods_value: number | null;
  goods_value_currency: string;
  actual_weight: number | null;
  volumetric_weight: number | null;
  chargeable_weight: number | null;
  carrier: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  transshipment_port: string | null;
  booking_reference: string | null;
  booking_requested: boolean;
  booking_status: string;
  booking_date: string | null;
  booking_confirmed: boolean;
  booking_confirmation_document_id: string | null;
}

export async function updateShipmentDocumentation(params: {
  shipmentId: string;
  branchId: string;
  referenceNumber: string | null;
  payload: ShipmentDocumentationFormPayload;
  updatedBy: string;
}): Promise<void> {
  const { shipmentId, branchId, referenceNumber, payload, updatedBy } = params;

  const { error } = await supabase
    .from('shipments')
    .update({ ...payload, updated_by: updatedBy })
    .eq('id', shipmentId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'shipment.documentation_updated',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Updated trade documentation for shipment ${referenceNumber ?? ''}`,
    metadata: { shipment_id: shipmentId },
  });
}

// =====================================================================
// shipment-documents-panel.tsx
// =====================================================================

export async function verifyShipmentDocument(params: {
  documentId: string;
  status: 'verified' | 'rejected';
  verifiedBy: string;
}): Promise<void> {
  const { documentId, status, verifiedBy } = params;
  const { error } = await supabase
    .from('documents')
    .update({
      status,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      updated_by: verifiedBy,
    })
    .eq('id', documentId);
  if (error) throw error;
}

// =====================================================================
// shipment-parties-dialog.tsx
// =====================================================================

export async function updateShipmentParties(params: {
  shipmentId: string;
  branchId: string;
  referenceNumber: string | null;
  payload: {
    shipper_name: string | null;
    shipper_address: string | null;
    consignee_name: string | null;
    consignee_address: string | null;
    notify_party_name: string | null;
    notify_party_address: string | null;
  };
  updatedBy: string;
}): Promise<void> {
  const { shipmentId, branchId, referenceNumber, payload, updatedBy } = params;

  const { error } = await supabase
    .from('shipments')
    .update({ ...payload, updated_by: updatedBy })
    .eq('id', shipmentId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'shipment.parties_updated',
    entity_type: 'shipment',
    entity_id: shipmentId,
    description: `Updated cargo parties for shipment ${referenceNumber ?? ''}`,
  });
}

// =====================================================================
// shipment-workflow-panel.tsx
// =====================================================================

export interface ShipmentWorkflowData {
  stages: ShipmentStage[];
  tasks: ShipmentTask[];
  comments: ShipmentStageComment[];
}

export async function fetchShipmentWorkflowData(shipmentId: string): Promise<ShipmentWorkflowData> {
  const [{ data: stageRows, error: stageError }, { data: taskRows }, { data: commentRows }] = await Promise.all([
    supabase
      .from('shipment_stages')
      .select('*, assigned_user:profiles!shipment_stages_assigned_to_fkey(id, full_name)')
      .eq('shipment_id', shipmentId)
      .order('sequence', { ascending: true }),
    supabase
      .from('shipment_tasks')
      .select('*, assigned_user:profiles!shipment_tasks_assigned_to_fkey(id, full_name)')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: true }),
    supabase
      .from('shipment_stage_comments')
      .select('*, created_by_user:profiles!shipment_stage_comments_created_by_fkey(id, full_name)')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: false }),
  ]);

  if (stageError) throw stageError;

  return {
    stages: (stageRows as unknown as ShipmentStage[]) ?? [],
    tasks: (taskRows as unknown as ShipmentTask[]) ?? [],
    comments: (commentRows as unknown as ShipmentStageComment[]) ?? [],
  };
}

export async function fetchBranchStaff(branchId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });
  if (error) {
    console.error('Error loading staff:', error);
    return [];
  }
  return (data as Profile[]) ?? [];
}

async function logWorkflowActivity(params: {
  userId: string;
  branchId: string;
  action: string;
  description: string;
  stage: ShipmentStage;
  shipmentId: string;
}): Promise<void> {
  const { userId, branchId, action, description, stage, shipmentId } = params;
  await supabase.from('activities').insert({
    user_id: userId,
    branch_id: branchId,
    action,
    entity_type: 'shipment_stage',
    entity_id: stage.id,
    description,
    metadata: { shipment_id: shipmentId, stage_key: stage.stage_key },
  });
}

/**
 * Starts a stage: marks it in_progress, seeds its tasks from
 * stage_task_templates the first time (only when it has none yet), and
 * logs the activity. Mirrors the previous inline handleStart exactly.
 */
export async function startWorkflowStage(params: {
  shipmentId: string;
  branchId: string;
  stage: ShipmentStage;
  updatedBy: string;
}): Promise<void> {
  const { shipmentId, branchId, stage, updatedBy } = params;

  const { error } = await supabase
    .from('shipment_stages')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('id', stage.id);
  if (error) throw error;

  const { count } = await supabase
    .from('shipment_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', stage.id);

  if (!count) {
    const { data: templates } = await supabase
      .from('stage_task_templates')
      .select('*')
      .eq('stage_key', stage.stage_key)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (templates && templates.length > 0) {
      await supabase.from('shipment_tasks').insert(
        templates.map((t) => ({
          shipment_id: shipmentId,
          stage_id: stage.id,
          template_id: t.id,
          branch_id: branchId,
          title: t.title,
          assigned_department: t.default_department ?? stage.assigned_department,
          priority: t.default_priority,
          created_by: updatedBy,
        }))
      );
    }
  }

  await logWorkflowActivity({
    userId: updatedBy,
    branchId,
    action: 'workflow_stage.started',
    description: `Started "${stage.label}" for this shipment`,
    stage,
    shipmentId,
  });
}

/**
 * Both Complete and Skip go through complete_shipment_stage() (RPC) —
 * that's what advances shipments.status to the next value, auto-starts
 * the next stage, and notifies the newly-responsible department, none of
 * which a plain client-side UPDATE can do.
 */
export async function runWorkflowStageAction(params: {
  stageId: string;
  action: 'complete' | 'skip';
}): Promise<{ new_status: string | null }> {
  const { data, error } = await supabase.rpc('complete_shipment_stage', {
    p_stage_id: params.stageId,
    p_action: params.action,
  });
  if (error) throw error;
  return data as { new_status: string | null };
}

export async function reassignWorkflowStage(params: {
  stageId: string;
  userId: string;
  updatedBy: string | undefined;
}): Promise<void> {
  const { error } = await supabase
    .from('shipment_stages')
    .update({ assigned_to: params.userId || null, updated_by: params.updatedBy })
    .eq('id', params.stageId);
  if (error) throw error;
}

export async function updateWorkflowStageDueDate(params: {
  stageId: string;
  date: string;
  updatedBy: string | undefined;
}): Promise<void> {
  const { error } = await supabase
    .from('shipment_stages')
    .update({ due_date: params.date || null, updated_by: params.updatedBy })
    .eq('id', params.stageId);
  if (error) throw error;
}

export async function cycleWorkflowTaskStatus(params: {
  taskId: string;
  nextStatus: PlanTaskStatus;
}): Promise<void> {
  const { error } = await supabase
    .from('shipment_tasks')
    .update({
      status: params.nextStatus,
      completed_at: params.nextStatus === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', params.taskId);
  if (error) throw error;
}

export async function addWorkflowTask(params: {
  shipmentId: string;
  branchId: string;
  stage: ShipmentStage;
  title: string;
  createdBy: string;
}): Promise<void> {
  const { shipmentId, branchId, stage, title, createdBy } = params;
  const { error } = await supabase.from('shipment_tasks').insert({
    shipment_id: shipmentId,
    stage_id: stage.id,
    branch_id: branchId,
    title,
    assigned_department: stage.assigned_department,
    created_by: createdBy,
  });
  if (error) throw error;
}

export async function addWorkflowStageComment(params: {
  shipmentId: string;
  branchId: string;
  stageId: string;
  comment: string;
  createdBy: string;
}): Promise<void> {
  const { shipmentId, branchId, stageId, comment, createdBy } = params;
  const { error } = await supabase.from('shipment_stage_comments').insert({
    stage_id: stageId,
    shipment_id: shipmentId,
    branch_id: branchId,
    comment,
    created_by: createdBy,
  });
  if (error) throw error;
}
