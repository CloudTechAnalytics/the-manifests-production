import { supabase } from '@/lib/supabase/client';
import type { DocumentCategory } from '@/types';

export interface UploadDocumentArgs {
  file: File;
  branchId: string;
  shipmentId: string;
  category: DocumentCategory;
  templateId: string | null;
  stageId: string | null;
  replacesDocumentId: string | null;
  createdBy: string;
}

export interface UploadDocumentResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

/**
 * Shipment-scoped upload helper for the new Workflow/Documents tab
 * panels. Mirrors app/(app)/documents/page.tsx's own handleUpload
 * (same storage path convention, same upload-then-insert-then-cleanup
 * order) rather than calling into it, since that page's flow handles
 * a batch of pending files with its own local state — that flow is
 * untouched.
 */
export async function uploadDocumentFile(args: UploadDocumentArgs): Promise<UploadDocumentResult> {
  const { file, branchId, shipmentId, category, templateId, stageId, replacesDocumentId, createdBy } = args;
  const filePath = `${branchId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('documents')
    .insert({
      name: file.name,
      category,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type || null,
      branch_id: branchId,
      shipment_id: shipmentId,
      template_id: templateId,
      stage_id: stageId,
      replaces_document_id: replacesDocumentId,
      status: 'uploaded',
      created_by: createdBy,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from('documents').remove([filePath]);
    return { success: false, error: insertError?.message ?? 'Failed to save document record' };
  }

  return { success: true, documentId: (inserted as { id: string }).id };
}
