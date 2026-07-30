import { supabase } from '@/lib/supabase/client';
import type { CustomsInspectionChannel, DocumentRecord, DocumentTemplate, ShipmentType } from '@/types';

/**
 * Which document templates apply to a shipment: filtered by shipment
 * type (null on the template = applies to all types) and by whether
 * customs selected the red inspection channel. Optionally narrowed to
 * one workflow stage — used both by the Documents tab checklist and by
 * workflow-rules.ts's per-stage validators, so resolution logic lives
 * in exactly one place.
 */
export async function resolveRequiredTemplates(
  shipmentId: string,
  stageKey?: string
): Promise<DocumentTemplate[]> {
  const [{ data: shipment }, { data: customs }, { data: templates }] = await Promise.all([
    supabase.from('shipments').select('shipment_type').eq('id', shipmentId).maybeSingle(),
    supabase
      .from('shipment_customs')
      .select('inspection_channel')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('document_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const shipmentType = (shipment?.shipment_type ?? null) as ShipmentType | null;
  const inspectionChannel = (customs?.inspection_channel ?? null) as CustomsInspectionChannel | null;
  const allTemplates = (templates as DocumentTemplate[] | null) ?? [];

  return allTemplates.filter((t) => {
    if (stageKey && t.stage_key !== stageKey) return false;
    if (t.applies_to_shipment_types && shipmentType && !t.applies_to_shipment_types.includes(shipmentType)) {
      return false;
    }
    if (t.requires_red_channel && inspectionChannel !== 'red') return false;
    return true;
  });
}

export interface DocumentChecklistItem {
  template: DocumentTemplate;
  document: DocumentRecord | null;
  satisfied: boolean;
}

/**
 * Combines resolveRequiredTemplates with the shipment's own documents
 * (latest, non-deleted row per template) so both the Documents tab UI
 * and the rule engine work off the exact same checklist.
 */
export async function getDocumentChecklist(
  shipmentId: string,
  stageKey?: string
): Promise<DocumentChecklistItem[]> {
  const [templates, { data: docs }] = await Promise.all([
    resolveRequiredTemplates(shipmentId, stageKey),
    supabase
      .from('documents')
      .select('*')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .not('template_id', 'is', null)
      .order('created_at', { ascending: false }),
  ]);

  const documents = (docs as DocumentRecord[] | null) ?? [];
  const latestByTemplate = new Map<string, DocumentRecord>();
  for (const doc of documents) {
    if (doc.template_id && !latestByTemplate.has(doc.template_id)) {
      latestByTemplate.set(doc.template_id, doc);
    }
  }

  return templates.map((template) => {
    const document = latestByTemplate.get(template.id) ?? null;
    const satisfied = !template.is_required || (!!document && document.status !== 'rejected');
    return { template, document, satisfied };
  });
}
