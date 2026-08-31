import { supabase } from '@/shared/lib/supabase/client';
import type { DocumentCategory, Branch } from '@/shared/types';

// ─── Filter/dropdown data ───────────────────────────────────────────────────

export async function fetchBranchesForDocumentsFilter(): Promise<Branch[]> {
  const { data } = await supabase
    .from('branches')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  return (data as Branch[]) ?? [];
}

export interface DocumentLinkOptions {
  shipments: { id: string; reference_number: string | null }[];
  customers: { id: string; company_name: string }[];
}

/** Shipments + customers for the upload dialog's "Link To" dropdowns, branch-scoped. */
export async function fetchDocumentLinkOptions(
  isAdmin: boolean,
  userBranchId: string | null
): Promise<DocumentLinkOptions> {
  let shipmentQuery = supabase
    .from('shipments')
    .select('id, reference_number')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  let customerQuery = supabase
    .from('customers')
    .select('id, company_name')
    .is('deleted_at', null)
    .order('company_name', { ascending: true });

  if (!isAdmin && userBranchId) {
    shipmentQuery = shipmentQuery.eq('branch_id', userBranchId);
    customerQuery = customerQuery.eq('branch_id', userBranchId);
  }

  const [shipRes, custRes] = await Promise.all([shipmentQuery, customerQuery]);
  return {
    shipments: (shipRes.data as { id: string; reference_number: string | null }[]) ?? [],
    customers: (custRes.data as { id: string; company_name: string }[]) ?? [],
  };
}

// ─── Upload ──────────────────────────────────────────────────────────────

export interface UploadDocumentInput {
  file: File;
  category: DocumentCategory;
  linkTarget: 'none' | 'shipment' | 'customer';
  shipmentId: string;
  customerId: string;
  userBranchId: string;
  createdBy: string;
  categoryLabel: string;
}

/** Uploads one file to storage, inserts its document record, and logs the activity. */
export async function uploadDocument(
  input: UploadDocumentInput
): Promise<{ success: true } | { success: false; error: string }> {
  const { file, category, linkTarget, shipmentId, customerId, userBranchId, createdBy, categoryLabel } = input;
  const filePath = `${userBranchId}/${Date.now()}-${file.name}`;

  // 1. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return { success: false, error: uploadError.message };
  }

  // 2. Insert document record
  const insertPayload: Record<string, unknown> = {
    name: file.name,
    category,
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type || null,
    branch_id: userBranchId,
    created_by: createdBy,
  };

  if (linkTarget === 'shipment' && shipmentId) {
    insertPayload.shipment_id = shipmentId;
  } else if (linkTarget === 'customer' && customerId) {
    insertPayload.customer_id = customerId;
  }

  const { error: insertError, data: inserted } = await supabase
    .from('documents')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    console.error('Insert error:', insertError);
    // Attempt to clean up the uploaded file to avoid orphans
    await supabase.storage.from('documents').remove([filePath]);
    return { success: false, error: insertError.message };
  }

  // 3. Log activity
  const docId = (inserted as { id: string }).id;
  await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: userBranchId,
    action: 'document_uploaded',
    entity_type: 'document',
    entity_id: docId,
    description: `Uploaded document "${file.name}" (${categoryLabel})`,
    metadata: {
      document_id: docId,
      file_name: file.name,
      category,
      file_size: file.size,
      mime_type: file.type || null,
    },
  });

  return { success: true };
}

// ─── Download / preview ──────────────────────────────────────────────────

export async function createDocumentDownloadUrl(
  filePath: string
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 3600);
  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message ?? 'Unknown error' };
  }
  return { url: data.signedUrl, error: null };
}

export async function createDocumentPreviewUrl(
  filePath: string
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 300);
  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message ?? 'Unknown error' };
  }
  return { url: data.signedUrl, error: null };
}

// ─── Delete ──────────────────────────────────────────────────────────────

export interface DeleteDocumentTarget {
  id: string;
  file_path: string;
  name: string;
  category: string;
  branch_id: string | null;
}

export async function deleteDocument(target: DeleteDocumentTarget, deletedBy: string): Promise<void> {
  // 1. Soft-delete the record
  const { error: updateError } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', target.id);

  if (updateError) {
    console.error('Delete error:', updateError);
    throw new Error(updateError.message);
  }

  // 2. Remove from storage (best-effort — record is already soft-deleted)
  const { error: storageError } = await supabase.storage.from('documents').remove([target.file_path]);
  if (storageError) {
    console.warn('Storage cleanup warning:', storageError);
    // Don't fail the whole operation — the record is soft-deleted
  }

  // 3. Log activity
  await supabase.from('activities').insert({
    user_id: deletedBy,
    branch_id: target.branch_id,
    action: 'document_deleted',
    entity_type: 'document',
    entity_id: target.id,
    description: `Deleted document "${target.name}"`,
    metadata: {
      document_id: target.id,
      file_name: target.name,
      category: target.category,
    },
  });
}
