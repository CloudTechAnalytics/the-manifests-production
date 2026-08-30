'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Trash2, Upload, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils/status';
import type { DocumentRecord } from '@/types';

interface QuotationAttachmentsPanelProps {
  quotationId: string;
  branchId: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Company Profile / Terms & Conditions / Rate Sheet / etc. — reuses the
 * exact same documents table + storage bucket pattern already used for
 * plan/examination attachments (PlanDocumentsPanel), just scoped by
 * quotation_id instead.
 */
export function QuotationAttachmentsPanel({ quotationId, branchId }: QuotationAttachmentsPanelProps) {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('quotation_id', quotationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading documents:', error);
        setDocs([]);
        return;
      }
      setDocs((data as DocumentRecord[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !profile) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const filePath = `${branchId}/${Date.now()}-${file.name}`;
      try {
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
        if (uploadError) {
          toast.error(`Failed to upload "${file.name}"`, { description: uploadError.message });
          continue;
        }

        const { error: insertError } = await supabase.from('documents').insert({
          name: file.name,
          category: 'other',
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type || null,
          branch_id: branchId,
          quotation_id: quotationId,
          created_by: profile.id,
        });
        if (insertError) {
          await supabase.storage.from('documents').remove([filePath]);
          toast.error(`Failed to save record for "${file.name}"`, { description: insertError.message });
          continue;
        }
        toast.success(`Uploaded "${file.name}"`);
      } catch (err) {
        console.error('Unexpected upload error:', err);
        toast.error(`An unexpected error occurred uploading "${file.name}"`);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadDocs();
  };

  const handleDownload = async (doc: DocumentRecord) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Failed to generate download link', { description: error?.message });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (doc: DocumentRecord) => {
    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', doc.id);
    if (error) {
      toast.error('Failed to delete document');
      return;
    }
    await supabase.storage.from('documents').remove([doc.file_path]);
    toast.success('Document deleted');
    loadDocs();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Attachments</CardTitle>
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-4 w-4" />
          )}
          Upload
        </Button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No attachments yet"
            message="Company profile, rate sheet, terms & conditions, etc."
            compact
          />
        ) : (
          <div className="space-y-1">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)} • {formatDateTime(doc.created_at)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(doc)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
