import { supabase } from '@/shared/lib/supabase/client';
import { getDocumentChecklist } from '@/shared/lib/utils/document-templates';
import { checkPlanningReadiness } from '@/shared/lib/utils/planning';
import { resolveRequiredTemplates } from '@/shared/lib/utils/document-templates';
import type {
  ShipmentPlan,
  Shipment,
  ShipmentContainer,
  ShipmentCustoms,
  TerminalOperation,
  ShipmentTransportation,
  ShipmentWarehouseRecord,
  ShipmentStage,
  Profile,
  PlanCostCategory,
  PlanCostEstimate,
  PlanTask,
  DocumentRecord,
  PlanAssignment,
  PlanAssignmentRole,
  PlanDocumentChecklistItem,
  PriorityLevel,
  UserRole,
} from '@/shared/types';

export interface BranchScope {
  isAdmin: boolean;
  branchId: string | null;
}

// ============================================================
// Planning list page
// ============================================================

export type PlanningRow = {
  shipment: Pick<Shipment, 'id' | 'reference_number' | 'origin' | 'destination' | 'branch_id'> & {
    customer: { company_name: string } | null;
  };
  plan: Pick<ShipmentPlan, 'id' | 'priority'> | null;
};

export async function fetchPlanningRows({
  isAdmin,
  branchId,
  search,
}: BranchScope & { search: string }): Promise<PlanningRow[]> {
  // Work-queue pattern, same as Customs/Terminal/Transportation: the
  // shipment's own status is the source of truth for "is this in
  // Planning", not whether a shipment_plans row happens to exist yet —
  // every shipment currently in the planning stage shows up here, even
  // one from before shipment_plans auto-creation existed.
  let shipQuery = supabase
    .from('shipments')
    .select('id, reference_number, origin, destination, branch_id, customer:customers(company_name)')
    .eq('status', 'planning')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (!isAdmin && branchId) shipQuery = shipQuery.eq('branch_id', branchId);
  if (search) {
    const sanitized = search.replace(/[%_(),.\\]/g, ' ');
    shipQuery = shipQuery.or(
      `reference_number.ilike.%${sanitized}%,customer.company_name.ilike.%${sanitized}%`
    );
  }

  const { data: shipmentRows, error: shipError } = await shipQuery;
  if (shipError) {
    console.error('Error loading shipments in planning:', shipError);
    return [];
  }
  const shipments = (shipmentRows as unknown as PlanningRow['shipment'][]) ?? [];
  if (shipments.length === 0) return [];

  const { data: planRows } = await supabase
    .from('shipment_plans')
    .select('id, shipment_id, priority')
    .in(
      'shipment_id',
      shipments.map((s) => s.id)
    )
    .is('deleted_at', null);
  const planByShipmentId = new Map((planRows ?? []).map((p) => [p.shipment_id, p]));

  return shipments.map((s) => ({
    shipment: s,
    plan: (planByShipmentId.get(s.id) as PlanningRow['plan']) ?? null,
  }));
}

export async function startPlanning(
  row: PlanningRow,
  actor: { id: string }
): Promise<{ id: string }> {
  // Customer is required on shipment_plans — look it up from the
  // shipment rather than asking the user to pick it again.
  const { data: fullShipment, error: shipmentError } = await supabase
    .from('shipments')
    .select('customer_id')
    .eq('id', row.shipment.id)
    .single();
  if (shipmentError || !fullShipment) throw new Error('Could not load shipment details');

  const { data: created, error } = await supabase
    .from('shipment_plans')
    .insert({
      shipment_id: row.shipment.id,
      customer_id: fullShipment.customer_id,
      branch_id: row.shipment.branch_id,
      created_by: actor.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: row.shipment.branch_id,
    action: 'plan.created',
    entity_type: 'shipment_plan',
    entity_id: created.id,
    description: `Started planning for shipment ${row.shipment.reference_number ?? ''}`,
    metadata: { shipment_id: row.shipment.id },
  });

  return created as { id: string };
}

// ============================================================
// Plan detail page
// ============================================================

export interface PlanDetail {
  plan: ShipmentPlan;
  shipment: Shipment | null;
  containers: ShipmentContainer[];
  customs: ShipmentCustoms | null;
  terminal: TerminalOperation | null;
  transportation: ShipmentTransportation[];
  warehouseRecord: ShipmentWarehouseRecord | null;
  stages: ShipmentStage[];
  documentsAllSatisfied: boolean;
  completionPercent: number | null;
}

export async function fetchPlanDetail(planId: string): Promise<PlanDetail | null> {
  const { data: planRow, error: planError } = await supabase
    .from('shipment_plans')
    .select(
      '*, quotation:quotations(*), planned_by_user:profiles!shipment_plans_planned_by_fkey(id, full_name), finance_officer_user:profiles!shipment_plans_finance_officer_id_fkey(id, full_name), supervisor_user:profiles!shipment_plans_supervisor_id_fkey(id, full_name)'
    )
    .eq('id', planId)
    .is('deleted_at', null)
    .maybeSingle();

  if (planError || !planRow) return null;
  const p = planRow as unknown as ShipmentPlan;

  if (!p.shipment_id) {
    // Legacy plan predating the Planning Centre redesign — no linked
    // shipment to load operational data from.
    return {
      plan: p,
      shipment: null,
      containers: [],
      customs: null,
      terminal: null,
      transportation: [],
      warehouseRecord: null,
      stages: [],
      documentsAllSatisfied: false,
      completionPercent: null,
    };
  }

  const [
    { data: shipRow },
    { data: containerRows },
    { data: customsRow },
    { data: terminalRow },
    { data: transportRows },
    { data: warehouseRow },
    { data: stageRows },
  ] = await Promise.all([
    supabase
      .from('shipments')
      .select('*, customer:customers(*), branch:branches(*)')
      .eq('id', p.shipment_id)
      .maybeSingle(),
    supabase.from('shipment_containers').select('*').eq('shipment_id', p.shipment_id).is('deleted_at', null),
    supabase.from('shipment_customs').select('*').eq('shipment_id', p.shipment_id).maybeSingle(),
    supabase.from('terminal_operations').select('*').eq('shipment_id', p.shipment_id).maybeSingle(),
    supabase
      .from('shipment_transportation')
      .select('*')
      .eq('shipment_id', p.shipment_id)
      .is('deleted_at', null),
    supabase
      .from('shipment_warehouse_records')
      .select('*, warehouse:warehouses(id, name)')
      .eq('shipment_id', p.shipment_id)
      .maybeSingle(),
    supabase
      .from('shipment_stages')
      .select('*, assigned_user:profiles!shipment_stages_assigned_to_fkey(id, full_name)')
      .eq('shipment_id', p.shipment_id),
  ]);

  const checklist = await getDocumentChecklist(p.shipment_id, 'documentation');
  const documentsAllSatisfied = checklist.every((item) => item.satisfied);

  const readiness = await checkPlanningReadiness(p.shipment_id);

  return {
    plan: p,
    shipment: (shipRow as Shipment) ?? null,
    containers: (containerRows as ShipmentContainer[]) ?? [],
    customs: (customsRow as ShipmentCustoms) ?? null,
    terminal: (terminalRow as TerminalOperation) ?? null,
    transportation: (transportRows as ShipmentTransportation[]) ?? [],
    warehouseRecord: (warehouseRow as ShipmentWarehouseRecord) ?? null,
    stages: (stageRows as ShipmentStage[]) ?? [],
    documentsAllSatisfied,
    completionPercent: readiness.completionPercent,
  };
}

export async function fetchPlanningStaff({ isAdmin, branchId }: BranchScope): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading staff:', error);
    return [];
  }
  return (data as Profile[]) ?? [];
}

export async function savePlanNotes(planId: string, notes: string, actor: { id: string }): Promise<void> {
  const { error } = await supabase
    .from('shipment_plans')
    .update({ notes: notes || null, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw error;
}

export async function deletePlan(plan: ShipmentPlan, planId: string, actor: { id: string }): Promise<void> {
  const { error } = await supabase
    .from('shipment_plans')
    .update({ deleted_at: new Date().toISOString(), updated_by: actor.id })
    .eq('id', planId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: plan.branch_id,
    action: 'plan.deleted',
    entity_type: 'shipment_plan',
    entity_id: planId,
    description: `Deleted plan ${plan.plan_number ?? ''}`,
    metadata: { shipment_id: plan.shipment_id },
  });
}

/** Completes the Planning stage: flips the shipment_stages row via RPC,
 *  marks the plan completed, logs the activity, then — mirroring
 *  shipment-workflow-panel.tsx's handleStart() — seeds Documentation's
 *  tasks from stage_task_templates since complete_shipment_stage() only
 *  flips the next stage to in_progress server-side, it doesn't seed
 *  tasks itself. */
export async function completePlanning(
  shipment: Shipment,
  plan: ShipmentPlan,
  planningStage: ShipmentStage,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase.rpc('complete_shipment_stage', {
    p_stage_id: planningStage.id,
    p_action: 'complete',
  });
  if (error) throw error;

  await supabase
    .from('shipment_plans')
    .update({ status: 'completed', updated_by: actor.id })
    .eq('id', plan.id);

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: plan.branch_id,
    action: 'plan.completed',
    entity_type: 'shipment_plan',
    entity_id: plan.id,
    description: 'Planning completed — status changed to Documentation',
    metadata: { shipment_id: shipment.id },
  });

  const { data: docStage } = await supabase
    .from('shipment_stages')
    .select('id, stage_key, assigned_department')
    .eq('shipment_id', shipment.id)
    .eq('stage_key', 'documentation')
    .maybeSingle();

  if (docStage) {
    const { count } = await supabase
      .from('shipment_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', docStage.id);

    if (!count) {
      const { data: templates } = await supabase
        .from('stage_task_templates')
        .select('*')
        .eq('stage_key', 'documentation')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (templates && templates.length > 0) {
        await supabase.from('shipment_tasks').insert(
          templates.map((t) => ({
            shipment_id: shipment.id,
            stage_id: docStage.id,
            template_id: t.id,
            branch_id: shipment.branch_id,
            title: t.title,
            assigned_department: t.default_department ?? docStage.assigned_department,
            priority: t.default_priority,
            created_by: actor.id,
          }))
        );
      }
    }
  }
}

// ============================================================
// Vessel planning card
// ============================================================

export async function fetchDocumentName(documentId: string): Promise<string> {
  const { data } = await supabase.from('documents').select('name').eq('id', documentId).maybeSingle();
  return data?.name ?? 'Document on file';
}

export async function getBookingDocumentSignedUrl(documentId: string): Promise<string> {
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('file_path')
    .eq('id', documentId)
    .maybeSingle();
  if (fetchError || !doc?.file_path) throw new Error('Document not found');

  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to generate download link');
  return data.signedUrl;
}

// ============================================================
// Warehouse planning card
// ============================================================

export async function markWarehousingRequired(
  shipmentId: string,
  branchId: string,
  actor: { id: string }
): Promise<void> {
  const { data: created, error } = await supabase
    .from('shipment_warehouse_records')
    .insert({
      shipment_id: shipmentId,
      branch_id: branchId,
      status: 'awaiting_arrival',
      created_by: actor.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: branchId,
    action: 'warehouse_record.created',
    entity_type: 'shipment_warehouse_record',
    entity_id: (created as { id: string } | null)?.id ?? null,
    description: 'Marked warehousing as required for this shipment',
    metadata: { shipment_id: shipmentId },
  });
}

export async function fetchActiveBranchWarehouses(branchId: string) {
  const { data } = await supabase
    .from('warehouses')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .is('deleted_at', null);
  return data ?? [];
}

export interface WarehousePlanFormInput {
  warehouseId: string;
  receivedDate: string;
  expectedArrivalDate: string;
  releasedDate: string;
  handlingInstructions: string;
}

export async function saveWarehousePlan(
  existing: ShipmentWarehouseRecord,
  branchId: string,
  form: WarehousePlanFormInput,
  actor: { id: string }
): Promise<void> {
  const status = form.releasedDate ? 'released' : form.receivedDate ? 'received' : 'awaiting_arrival';
  const { error } = await supabase
    .from('shipment_warehouse_records')
    .update({
      warehouse_id: form.warehouseId || null,
      received_date: form.receivedDate || null,
      expected_arrival_date: form.expectedArrivalDate || null,
      released_date: form.releasedDate || null,
      handling_instructions: form.handlingInstructions.trim() || null,
      status,
      updated_by: actor.id,
    })
    .eq('id', existing.id);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: branchId,
    action: 'warehouse_record.updated',
    entity_type: 'shipment_warehouse_record',
    entity_id: existing.id,
    description: 'Updated warehouse planning details',
    metadata: { shipment_id: existing.shipment_id },
  });
}

// ============================================================
// Financial planning tab
// ============================================================

export async function fetchPlanCostEstimates(
  shipmentId: string
): Promise<Record<PlanCostCategory, PlanCostEstimate | undefined>> {
  const { data, error } = await supabase.from('plan_cost_estimates').select('*').eq('shipment_id', shipmentId);
  if (error) {
    console.error('Error loading cost estimates:', error);
    return {} as Record<PlanCostCategory, PlanCostEstimate | undefined>;
  }
  const byCategory: Record<PlanCostCategory, PlanCostEstimate | undefined> = {} as Record<
    PlanCostCategory,
    PlanCostEstimate | undefined
  >;
  ((data as PlanCostEstimate[]) ?? []).forEach((e) => {
    byCategory[e.category] = e;
  });
  return byCategory;
}

export async function saveCostEstimate(
  shipmentId: string,
  branchId: string,
  category: PlanCostCategory,
  amount: number,
  currency: string,
  existing: PlanCostEstimate | undefined,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase.from('plan_cost_estimates').upsert(
    {
      shipment_id: shipmentId,
      branch_id: branchId,
      category,
      estimated_amount: amount,
      currency,
      created_by: existing ? existing.created_by : actor.id,
      updated_by: actor.id,
    },
    { onConflict: 'shipment_id,category' }
  );
  if (error) throw error;
}

// ============================================================
// Plan tasks panel
// ============================================================

export async function fetchPlanTasks(planId: string): Promise<PlanTask[]> {
  const { data, error } = await supabase
    .from('plan_tasks')
    .select('*, assigned_user:profiles!plan_tasks_assigned_to_fkey(id, full_name)')
    .eq('plan_id', planId)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
  return (data as unknown as PlanTask[]) ?? [];
}

/** Planning Tasks auto-generation (§9) — mirrors shipment-workflow-panel's
 *  handleStart() seeding logic exactly: fires once per plan, only when
 *  no tasks exist yet, so manual add/delete afterwards is never
 *  overwritten. Returns true if it seeded anything. */
export async function seedPlanTasksIfEmpty(
  planId: string,
  branchId: string,
  actor: { id: string }
): Promise<boolean> {
  const { data: templates } = await supabase
    .from('stage_task_templates')
    .select('*')
    .eq('stage_key', 'planning')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (!templates || templates.length === 0) return false;

  const { error } = await supabase.from('plan_tasks').insert(
    templates.map((t) => ({
      plan_id: planId,
      branch_id: branchId,
      title: t.title,
      template_id: t.id,
      priority: t.default_priority,
      created_by: actor.id,
    }))
  );
  return !error;
}

export interface NewPlanTaskInput {
  title: string;
  assignedTo: string;
  dueDate: string;
  priority: PriorityLevel;
}

export async function createPlanTask(
  planId: string,
  branchId: string,
  form: NewPlanTaskInput,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase.from('plan_tasks').insert({
    plan_id: planId,
    branch_id: branchId,
    title: form.title.trim(),
    assigned_to: form.assignedTo || null,
    due_date: form.dueDate || null,
    priority: form.priority,
    created_by: actor.id,
  });
  if (error) throw error;
}

export async function cyclePlanTaskStatus(task: PlanTask): Promise<void> {
  const next: Record<string, string> = {
    pending: 'in_progress',
    in_progress: 'done',
    done: 'pending',
    cancelled: 'pending',
  };
  const { error } = await supabase
    .from('plan_tasks')
    .update({ status: next[task.status], updated_at: new Date().toISOString() })
    .eq('id', task.id);
  if (error) throw error;
}

export async function deletePlanTask(task: PlanTask): Promise<void> {
  const { error } = await supabase.from('plan_tasks').delete().eq('id', task.id);
  if (error) throw error;
}

// ============================================================
// Plan documents panel
// ============================================================

export async function fetchPlanDocuments(planId: string): Promise<DocumentRecord[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('plan_id', planId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading documents:', error);
    return [];
  }
  return (data as DocumentRecord[]) ?? [];
}

export async function uploadPlanDocument(
  file: File,
  branchId: string,
  planId: string,
  actor: { id: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const filePath = `${branchId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (uploadError) {
    return { ok: false, message: uploadError.message };
  }

  const { error: insertError } = await supabase.from('documents').insert({
    name: file.name,
    category: 'other',
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type || null,
    branch_id: branchId,
    plan_id: planId,
    created_by: actor.id,
  });
  if (insertError) {
    await supabase.storage.from('documents').remove([filePath]);
    return { ok: false, message: insertError.message };
  }

  return { ok: true };
}

export async function getPlanDocumentSignedUrl(
  doc: DocumentRecord
): Promise<{ url: string } | { error: string }> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600);
  if (error || !data?.signedUrl) {
    return { error: error?.message ?? 'Failed to generate download link' };
  }
  return { url: data.signedUrl };
}

export async function deletePlanDocument(doc: DocumentRecord): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', doc.id);
  if (error) throw error;
  await supabase.storage.from('documents').remove([doc.file_path]);
}

// ============================================================
// Internal assignments card
// ============================================================

interface AssignmentRoleDef {
  key: PlanAssignmentRole;
  label: string;
  stageKey: string | null;
  role: UserRole;
}

export async function fetchPlanAssignments(shipmentId: string): Promise<Record<string, PlanAssignment>> {
  const { data, error } = await supabase
    .from('plan_assignments')
    .select('*, assigned_user:profiles!plan_assignments_assigned_to_fkey(id, full_name)')
    .eq('shipment_id', shipmentId);
  if (error) {
    console.error('Error loading assignments:', error);
    return {};
  }
  const byRole: Record<string, PlanAssignment> = {};
  ((data as unknown as PlanAssignment[]) ?? []).forEach((a) => {
    byRole[a.role] = a;
  });
  return byRole;
}

export async function fetchAssignmentStaffByRole(
  branchId: string,
  roles: AssignmentRoleDef[]
): Promise<Record<string, Profile[]>> {
  const results = await Promise.all(
    roles.map((r) =>
      supabase
        .from('profiles')
        .select('*')
        .eq('branch_id', branchId)
        .eq('role', r.role)
        .eq('is_active', true)
        .is('deleted_at', null)
    )
  );
  const byRole: Record<string, Profile[]> = {};
  roles.forEach((r, i) => {
    byRole[r.key] = (results[i].data as Profile[]) ?? [];
  });
  return byRole;
}

export async function upsertPlanAssignment(
  role: AssignmentRoleDef,
  shipmentId: string,
  branchId: string,
  patch: Record<string, unknown>,
  existing: PlanAssignment | undefined,
  stages: ShipmentStage[],
  assigneeName: string | null,
  actor: { id: string }
): Promise<void> {
  let assignmentId = existing?.id ?? null;

  if (existing) {
    const { error } = await supabase
      .from('plan_assignments')
      .update({ ...patch, updated_by: actor.id })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('plan_assignments')
      .insert({
        shipment_id: shipmentId,
        branch_id: branchId,
        role: role.key,
        created_by: actor.id,
        ...patch,
      })
      .select('id')
      .single();
    if (error) throw error;
    assignmentId = (data as { id: string })?.id ?? null;
  }

  // Sync the 4 stage-matched roles so the shipment's own Workflow tab
  // doesn't go stale when the assignee changes here.
  if (role.stageKey && 'assigned_to' in patch) {
    const stage = stages.find((s) => s.stage_key === role.stageKey);
    if (stage) {
      await supabase
        .from('shipment_stages')
        .update({ assigned_to: patch.assigned_to ?? null, updated_by: actor.id })
        .eq('id', stage.id);
    }
  }

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: branchId,
    action: 'planning.assignment_updated',
    entity_type: 'plan_assignment',
    entity_id: assignmentId,
    description: assigneeName
      ? `${assigneeName} assigned as ${role.label}`
      : `${role.label} assignment updated`,
    metadata: { shipment_id: shipmentId, role: role.key, ...patch },
  });
}

// ============================================================
// Documentation planning panel
// ============================================================

const DOC_CHECKLIST_SELECT_COLUMNS =
  '*, template:document_templates(*), uploaded_by_user:profiles!plan_document_checklist_uploaded_by_fkey(id, full_name)';

/** Lazily seeds the checklist from resolveRequiredTemplates() (the same
 *  catalog the shipment's own Documents tab uses, stage_key
 *  'documentation') the first time it's loaded empty — mirrors the
 *  original load() exactly. */
export async function fetchDocumentChecklist(
  shipmentId: string,
  branchId: string,
  actorId: string | undefined
): Promise<PlanDocumentChecklistItem[]> {
  const { data, error } = await supabase
    .from('plan_document_checklist')
    .select(DOC_CHECKLIST_SELECT_COLUMNS)
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error loading document checklist:', error);
    return [];
  }
  let rows = (data as unknown as PlanDocumentChecklistItem[]) ?? [];

  if (rows.length === 0 && actorId) {
    const templates = await resolveRequiredTemplates(shipmentId, 'documentation');
    if (templates.length > 0) {
      const { error: seedError } = await supabase.from('plan_document_checklist').insert(
        templates.map((t) => ({
          shipment_id: shipmentId,
          branch_id: branchId,
          template_id: t.id,
          created_by: actorId,
        }))
      );
      if (!seedError) {
        const { data: seeded } = await supabase
          .from('plan_document_checklist')
          .select(DOC_CHECKLIST_SELECT_COLUMNS)
          .eq('shipment_id', shipmentId)
          .order('created_at', { ascending: true });
        rows = (seeded as unknown as PlanDocumentChecklistItem[]) ?? [];
      }
    }
  }

  return rows;
}

export async function updateDocumentChecklistItem(
  item: PlanDocumentChecklistItem,
  patch: Record<string, unknown>,
  shipmentId: string,
  branchId: string,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase
    .from('plan_document_checklist')
    .update({ ...patch, updated_by: actor.id })
    .eq('id', item.id);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: actor.id,
    branch_id: branchId,
    action: 'planning.document_checklist_updated',
    entity_type: 'plan_document_checklist',
    entity_id: item.id,
    description: `${item.template?.name ?? item.custom_label ?? 'Document'} updated`,
    metadata: { shipment_id: shipmentId, status: patch.status ?? item.status },
  });
}

export async function addCustomDocumentChecklistItem(
  shipmentId: string,
  branchId: string,
  customLabel: string,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase.from('plan_document_checklist').insert({
    shipment_id: shipmentId,
    branch_id: branchId,
    custom_label: customLabel.trim(),
    created_by: actor.id,
  });
  if (error) throw error;
}
