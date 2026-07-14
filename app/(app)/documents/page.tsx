'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Trash2,
  X,
  Link2,
  Paperclip,
  FileCheck,
  Loader2,
  CloudUpload,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDate } from '@/lib/utils/status';
import type {
  DocumentRecord,
  DocumentCategory,
  Branch,
} from '@/types';

// ─── Constants & helpers ───────────────────────────────────────────────────

type CategoryFilter = 'all' | DocumentCategory;

const CATEGORY_META: Record<
  DocumentCategory,
  { label: string; color: string }
> = {
  invoice: { label: 'Invoice', color: 'bg-blue-100 text-blue-700' },
  packing_list: { label: 'Packing List', color: 'bg-amber-100 text-amber-700' },
  bill_of_lading: { label: 'Bill of Lading', color: 'bg-indigo-100 text-indigo-700' },
  air_waybill: { label: 'Air Waybill', color: 'bg-cyan-100 text-cyan-700' },
  delivery_note: { label: 'Delivery Note', color: 'bg-purple-100 text-purple-700' },
  customs: { label: 'Customs', color: 'bg-orange-100 text-orange-700' },
  proof_of_delivery: { label: 'Proof of Delivery', color: 'bg-green-100 text-green-700' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-700' },
};

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_META) as DocumentCategory[]).map(
  (key) => ({ value: key, label: CATEGORY_META[key].label })
);

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Document row joined with shipment, customer, uploader, and branch
type DocumentRow = DocumentRecord & {
  shipment?: { id: string; reference_number: string | null } | null;
  customer?: { id: string; company_name: string } | null;
  created_by_user?: { id: string; full_name: string } | null;
  branch?: { id: string; name: string } | null;
};

type LinkTarget = 'none' | 'shipment' | 'customer';

interface PendingFile {
  file: File;
  category: DocumentCategory;
  linkTarget: LinkTarget;
  shipmentId: string;
  customerId: string;
}

// ─── Page component ─────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [shipments, setShipments] = useState<{ id: string; reference_number: string | null }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; company_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [branchIdFilter, setBranchIdFilter] = useState<string>('all');

  // Upload dialog state — opens automatically when linked to via
  // /documents?upload=1 (e.g. the "Upload Documents" quick action).
  const [uploadOpen, setUploadOpen] = useState(
    () => searchParams.get('upload') === '1'
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadBranches = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    setBranches((data as Branch[]) ?? []);
  }, [isAdmin]);

  // Load shipments + customers for the upload link dropdowns (branch-scoped)
  const loadLinkOptions = useCallback(async () => {
    if (!profile) return;
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
    setShipments((shipRes.data as { id: string; reference_number: string | null }[]) ?? []);
    setCustomers((custRes.data as { id: string; company_name: string }[]) ?? []);
  }, [profile, isAdmin, userBranchId]);

  const loadDocuments = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('documents')
        .select(
          '*, shipment:shipments(id, reference_number), customer:customers(id, company_name), created_by_user:profiles!documents_created_by_fkey(id, full_name), branch:branches(id, name)'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Branch scoping: non-admins only see their branch
      if (!isAdmin && userBranchId) {
        query = query.eq('branch_id', userBranchId);
      }

      // Admin branch filter dropdown
      if (isAdmin && branchIdFilter !== 'all') {
        query = query.eq('branch_id', branchIdFilter);
      }

      // Category filter
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      // Search by document name
      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading documents:', error);
        setDocuments([]);
        return;
      }
      setDocuments((data as DocumentRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [
    profile,
    isAdmin,
    userBranchId,
    categoryFilter,
    branchIdFilter,
    debouncedSearch,
  ]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    loadBranches();
    loadLinkOptions();
  }, [loadBranches, loadLinkOptions]);

  // ─── Upload logic ─────────────────────────────────────────────────────────

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        category: 'other' as DocumentCategory,
        linkTarget: 'none' as LinkTarget,
        shipmentId: '',
        customerId: '',
      })),
    ]);
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updatePendingFile = useCallback(
    (index: number, updates: Partial<PendingFile>) => {
      setPendingFiles((prev) =>
        prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      // Reset so selecting the same file again still fires onChange
      e.target.value = '';
    },
    [addFiles]
  );

  const handleUpload = useCallback(async () => {
    if (!profile || !userBranchId) {
      toast.error('Your profile is not fully loaded. Please reload the page.');
      return;
    }
    if (pendingFiles.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const pending of pendingFiles) {
      const { file, category, linkTarget, shipmentId, customerId } = pending;
      const filePath = `${userBranchId}/${Date.now()}-${file.name}`;

      try {
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
          toast.error(`Failed to upload "${file.name}"`, {
            description: uploadError.message,
          });
          failCount++;
          continue;
        }

        // 2. Insert document record
        const insertPayload: Record<string, unknown> = {
          name: file.name,
          category,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type || null,
          branch_id: userBranchId,
          created_by: profile.id,
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
          toast.error(`Failed to save record for "${file.name}"`, {
            description: insertError.message,
          });
          failCount++;
          continue;
        }

        // 3. Log activity
        const docId = (inserted as { id: string }).id;
        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: userBranchId,
          action: 'document_uploaded',
          entity_type: 'document',
          entity_id: docId,
          description: `Uploaded document "${file.name}" (${CATEGORY_META[category].label})`,
          metadata: {
            document_id: docId,
            file_name: file.name,
            category,
            file_size: file.size,
            mime_type: file.type || null,
          },
        });

        successCount++;
      } catch (err) {
        console.error('Unexpected upload error:', err);
        toast.error(`An unexpected error occurred uploading "${file.name}"`);
        failCount++;
      }
    }

    setUploading(false);

    if (successCount > 0 && failCount === 0) {
      toast.success(
        `${successCount} document${successCount > 1 ? 's' : ''} uploaded successfully`
      );
      setPendingFiles([]);
      setUploadOpen(false);
      loadDocuments();
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`${successCount} uploaded, ${failCount} failed`);
      // Keep failed files in the list for retry; remove successful ones
      // Since we don't track per-file success here, just reload and clear
      setPendingFiles([]);
      setUploadOpen(false);
      loadDocuments();
    } else if (failCount > 0) {
      toast.error(`Upload failed for ${failCount} file${failCount > 1 ? 's' : ''}`);
    }
  }, [profile, userBranchId, pendingFiles, loadDocuments]);

  // ─── Download logic ───────────────────────────────────────────────────────

  const handleDownload = useCallback(async (doc: DocumentRow) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 3600); // 1 hour expiry

      if (error || !data?.signedUrl) {
        console.error('Signed URL error:', error);
        toast.error('Failed to generate download link', {
          description: error?.message ?? 'Unknown error',
        });
        return;
      }

      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('An unexpected error occurred during download');
    }
  }, []);

  // ─── Delete logic ─────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !profile) return;
    setDeleting(true);
    try {
      // 1. Soft-delete the record
      const { error: updateError } = await supabase
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteTarget.id);

      if (updateError) {
        console.error('Delete error:', updateError);
        toast.error('Failed to delete document', {
          description: updateError.message,
        });
        setDeleting(false);
        return;
      }

      // 2. Remove from storage (best-effort — record is already soft-deleted)
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([deleteTarget.file_path]);

      if (storageError) {
        console.warn('Storage cleanup warning:', storageError);
        // Don't fail the whole operation — the record is soft-deleted
      }

      // 3. Log activity
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: deleteTarget.branch_id,
        action: 'document_deleted',
        entity_type: 'document',
        entity_id: deleteTarget.id,
        description: `Deleted document "${deleteTarget.name}"`,
        metadata: {
          document_id: deleteTarget.id,
          file_name: deleteTarget.name,
          category: deleteTarget.category,
        },
      });

      toast.success('Document deleted successfully');
      setDeleteTarget(null);
      loadDocuments();
    } catch (err) {
      console.error('Unexpected delete error:', err);
      toast.error('An unexpected error occurred during deletion');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, profile, loadDocuments]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const categoryOptions = useMemo(
    () => [{ value: 'all', label: 'All Categories' }, ...CATEGORY_OPTIONS],
    []
  );

  const hasActiveFilters =
    !!debouncedSearch ||
    categoryFilter !== 'all' ||
    branchIdFilter !== 'all';

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileText className="h-6 w-6 text-blue-600" />
            Documents
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload, manage, and download shipping and customs documents.
          </p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)} className="w-full sm:w-auto">
          <Upload className="mr-1.5 h-4 w-4" />
          Upload Documents
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by document name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select
                value={branchIdFilter}
                onValueChange={(v) => setBranchIdFilter(v)}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            All Documents
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({documents.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <FileText className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">No documents found</p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? 'Try adjusting your filters.'
                    : 'Upload your first document to get started.'}
                </p>
              </div>
              {!hasActiveFilters && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Upload Documents
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Linked To</TableHead>
                  <TableHead>File Size</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const meta = CATEGORY_META[doc.category];
                  const linkedTo =
                    doc.shipment?.reference_number ??
                    doc.customer?.company_name ??
                    null;
                  return (
                    <TableRow key={doc.id} className="transition-colors hover:bg-accent/60">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="max-w-[220px] truncate" title={doc.name}>
                            {doc.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {linkedTo ? (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <span className="max-w-[160px] truncate" title={linkedTo}>
                              {linkedTo}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatFileSize(doc.file_size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.created_by_user?.full_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(doc.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                            onClick={() => handleDownload(doc)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTarget(doc)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* ─── Upload Dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!uploading) {
            setUploadOpen(open);
            if (!open) setPendingFiles([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudUpload className="h-5 w-5 text-blue-600" />
              Upload Documents
            </DialogTitle>
            <DialogDescription>
              Drag and drop files or click to browse. You can link each file to a
              shipment or customer and assign a category.
            </DialogDescription>
          </DialogHeader>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <Upload className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Drop files here, or{' '}
                <span className="text-primary underline">browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Supports any file type. Max 50 MB per file.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Pending files list */}
          {pendingFiles.length > 0 && (
            <div className="max-h-[300px] space-y-3 overflow-y-auto">
              {pendingFiles.map((pending, index) => {
                const meta = CATEGORY_META[pending.category];
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-muted/40 p-3"
                  >
                    {/* File header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                          <Paperclip className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-medium"
                            title={pending.file.name}
                          >
                            {pending.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(pending.file.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={() => removePendingFile(index)}
                        disabled={uploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Category + Link selects */}
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Category
                        </Label>
                        <Select
                          value={pending.category}
                          onValueChange={(v) =>
                            updatePendingFile(index, {
                              category: v as DocumentCategory,
                            })
                          }
                          disabled={uploading}
                        >
                          <SelectTrigger className="h-8 bg-background text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Link To
                        </Label>
                        <Select
                          value={pending.linkTarget}
                          onValueChange={(v) =>
                            updatePendingFile(index, {
                              linkTarget: v as LinkTarget,
                              shipmentId: '',
                              customerId: '',
                            })
                          }
                          disabled={uploading}
                        >
                          <SelectTrigger className="h-8 bg-background text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No link</SelectItem>
                            <SelectItem value="shipment">Shipment</SelectItem>
                            <SelectItem value="customer">Customer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {pending.linkTarget === 'shipment' && (
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">
                            Select Shipment
                          </Label>
                          <Select
                            value={pending.shipmentId}
                            onValueChange={(v) =>
                              updatePendingFile(index, { shipmentId: v })
                            }
                            disabled={uploading}
                          >
                            <SelectTrigger className="h-8 bg-background text-xs">
                              <SelectValue placeholder="Choose a shipment…" />
                            </SelectTrigger>
                            <SelectContent>
                              {shipments.length === 0 ? (
                                <SelectItem value="_none" disabled>
                                  No shipments available
                                </SelectItem>
                              ) : (
                                shipments.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.reference_number ?? s.id.slice(0, 8)}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {pending.linkTarget === 'customer' && (
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">
                            Select Customer
                          </Label>
                          <Select
                            value={pending.customerId}
                            onValueChange={(v) =>
                              updatePendingFile(index, { customerId: v })
                            }
                            disabled={uploading}
                          >
                            <SelectTrigger className="h-8 bg-background text-xs">
                              <SelectValue placeholder="Choose a customer…" />
                            </SelectTrigger>
                            <SelectContent>
                              {customers.length === 0 ? (
                                <SelectItem value="_none" disabled>
                                  No customers available
                                </SelectItem>
                              ) : (
                                customers.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.company_name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Category badge preview */}
                    <div className="mt-2">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${meta.color}`}
                      >
                        {meta.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadOpen(false);
                setPendingFiles([]);
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || pendingFiles.length === 0}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <FileCheck className="mr-1.5 h-4 w-4" />
                  Upload {pendingFiles.length > 0
                    ? `${pendingFiles.length} File${pendingFiles.length > 1 ? 's' : ''}`
                    : 'Files'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!deleting) setDeleteTarget(open ? deleteTarget : null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Delete Document
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>
              ? This action will permanently remove the file from storage and
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
