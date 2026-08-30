import { supabase } from '@/lib/supabase/client';

export interface UploadCourseMaterialArgs {
  file: File;
  organizationId: string;
  courseId: string;
  title: string;
  createdBy: string;
}

export interface UploadCourseMaterialResult {
  success: boolean;
  materialId?: string;
  error?: string;
}

/**
 * Mirrors lib/utils/document-upload.ts's uploadDocumentFile() exactly
 * — same upload-then-insert-then-cleanup-on-failure order — pointed at
 * the dedicated course-materials bucket/table (migration 090) instead
 * of documents/documents, since course materials are org-scoped, not
 * branch-scoped, and don't fit the documents bucket's path convention.
 */
export async function uploadCourseMaterialFile(args: UploadCourseMaterialArgs): Promise<UploadCourseMaterialResult> {
  const { file, organizationId, courseId, title, createdBy } = args;
  const filePath = `${organizationId}/${courseId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from('course-materials').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('course_materials')
    .insert({
      course_id: courseId,
      material_type: 'file',
      title,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type || null,
      created_by: createdBy,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from('course-materials').remove([filePath]);
    return { success: false, error: insertError?.message ?? 'Failed to save course material' };
  }

  return { success: true, materialId: (inserted as { id: string }).id };
}

/** Downloadable/viewable URL for a stored material — the bucket is
 *  private, so this must be a signed URL, not a public path. */
export async function getCourseMaterialSignedUrl(filePath: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('course-materials').createSignedUrl(filePath, expiresInSeconds);
  if (error || !data) {
    console.error('Error creating signed URL for course material:', error);
    return null;
  }
  return data.signedUrl;
}
