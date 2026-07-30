'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FileText, History, Loader2, Plus, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { getDocumentChecklist, resolveRequiredTemplates, type DocumentChecklistItem } from '@/lib/utils/document-templates';
import { DOCUMENT_STATUS_META, isDocumentExpired, formatDate } from '@/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DocumentUploadDialog } from '@/components/shipments/document-upload-dialog';
import { DocumentViewerDialog, type PreviewableDocument } from '@/components/documents/document-viewer-dialog';
import type { DocumentRecord, DocumentTemplate } from '@/types';

interface ShipmentDocumentsPanelProps {
  shipmentId: string;
  branchId: string;
  documents: DocumentRecord[];
  onReload: () => void;
}

export function ShipmentDocumentsPanel({ shipmentId, branchId, documents, onReload }: ShipmentDocumentsPanelProps) {
  const { profile, hasRole } = useAuth();
  const canVerify = hasRole('admin') || hasRole('branch_manager') || hasRole('documentation');

  const [checklist, setChecklist] = useState<DocumentChecklistItem[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<PreviewableDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTemplateId, setUploadTemplateId] = useState<string | null>(null);
  const [replacesDocumentId, setReplacesDocumentId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    setLoading(true);
    try {
      const [items, required] = await Promise.all([
        getDocumentChecklist(shipmentId),
        resolveRequiredTemplates(shipmentId),
      ]);
      setChecklist(items);
      setTemplates(required);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist, documents]);

  const openUploadFor = (templateId: string | null, replaces: string | null = null) => {
    setUploadTemplateId(templateId);
    setReplacesDocumentId(replaces);
    setUploadOpen(true);
  };

  const handleVerify = async (doc: DocumentRecord, status: 'verified' | 'rejected') => {
    if (!profile) return;
    setBusyDocId(doc.id);
    try {
      const { error } = await supabase
        .from('documents')
        .update({
          status,
          verified_by: profile.id,
          verified_at: new Date().toISOString(),
          updated_by: profile.id,
        })
        .eq('id', doc.id);
      if (error) throw error;
      toast.success(status === 'verified' ? 'Document verified' : 'Document rejected');
      onReload();
    } catch {
      toast.error('Failed to update document');
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-lg font-semibold">Required Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : checklist.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No document requirements apply to this shipment.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {checklist.map((item) => {
                  const expired = item.document ? isDocumentExpired(item.document) : false;
                  const effectiveStatus = expired ? 'expired' : (item.document?.status ?? null);
                  return (
                    <TableRow key={item.template.id}>
                      <TableCell className="text-sm font-medium">{item.template.name}</TableCell>
                      <TableCell>
                        {item.template.is_required ? (
                          <Badge variant="outline" className="text-[11px]">
                            Required
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Optional</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {effectiveStatus ? (
                          <Badge variant="secondary" className={`text-[11px] ${DOCUMENT_STATUS_META[effectiveStatus].color}`}>
                            {DOCUMENT_STATUS_META[effectiveStatus].label}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-[11px] text-muted-foreground">
                            Missing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.document ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setPreviewDoc({
                                name: item.document!.name,
                                file_path: item.document!.file_path,
                                mime_type: item.document!.mime_type,
                              })
                            }
                          >
                            View
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openUploadFor(item.template.id)}>
                            Upload
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-lg font-semibold">All Documents</CardTitle>
          <Button size="sm" variant="outline" onClick={() => openUploadFor(null)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Upload Document
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No documents uploaded for this shipment yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => {
                  const expired = isDocumentExpired(d);
                  const effectiveStatus = expired ? 'expired' : d.status;
                  const busy = busyDocId === d.id;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          {d.name}
                          {d.replaces_document_id && (
                            <History className="h-3.5 w-3.5 text-muted-foreground" aria-label="New version" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {d.category.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[11px] ${DOCUMENT_STATUS_META[effectiveStatus].color}`}>
                          {DOCUMENT_STATUS_META[effectiveStatus].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewDoc({ name: d.name, file_path: d.file_path, mime_type: d.mime_type })}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openUploadFor(d.template_id, d.id)}
                          >
                            Replace
                          </Button>
                          {canVerify && d.status !== 'verified' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                              disabled={busy}
                              onClick={() => handleVerify(d, 'verified')}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          {canVerify && d.status !== 'rejected' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={busy}
                              onClick={() => handleVerify(d, 'rejected')}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        shipmentId={shipmentId}
        branchId={branchId}
        templates={templates}
        initialTemplateId={uploadTemplateId}
        replacesDocumentId={replacesDocumentId}
        onUploaded={onReload}
      />
      <DocumentViewerDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
