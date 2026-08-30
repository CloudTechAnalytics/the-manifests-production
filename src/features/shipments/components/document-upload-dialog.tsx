'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { uploadDocumentFile } from '@/shared/lib/utils/document-upload';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { DocumentCategory, DocumentTemplate } from '@/shared/types';

// Matches the limit enforced on the main Documents page and the storage
// bucket itself — kept in sync across all three upload entry points.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const CATEGORY_META: Record<DocumentCategory, string> = {
  invoice: 'Invoice',
  packing_list: 'Packing List',
  bill_of_lading: 'Bill of Lading',
  air_waybill: 'Air Waybill',
  delivery_note: 'Delivery Note',
  customs: 'Customs',
  proof_of_delivery: 'Proof of Delivery',
  other: 'Other',
};

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  templates: DocumentTemplate[];
  initialTemplateId?: string | null;
  replacesDocumentId?: string | null;
  onUploaded: () => void;
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  templates,
  initialTemplateId = null,
  replacesDocumentId = null,
  onUploaded,
}: DocumentUploadDialogProps) {
  const { profile } = useAuth();
  const [templateId, setTemplateId] = useState<string>(initialTemplateId ?? '');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplateId(initialTemplateId ?? '');
    setFile(null);
    const template = templates.find((t) => t.id === initialTemplateId);
    setCategory(template?.category ?? 'other');
  }, [open, initialTemplateId, templates]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const handleTemplateChange = (value: string) => {
    setTemplateId(value);
    const template = templates.find((t) => t.id === value);
    if (template) setCategory(template.category);
  };

  const handleUpload = async () => {
    if (!file || !profile) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`"${file.name}" is over the 50 MB limit.`);
      return;
    }
    setUploading(true);
    try {
      const result = await uploadDocumentFile({
        file,
        branchId,
        shipmentId,
        category,
        templateId: templateId || null,
        stageId: null,
        replacesDocumentId,
        createdBy: profile.id,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to upload document');
        return;
      }
      toast.success('Document uploaded');
      onOpenChange(false);
      onUploaded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{replacesDocumentId ? 'Replace Document' : 'Upload Document'}</DialogTitle>
          <DialogDescription>
            {selectedTemplate ? `Upload the ${selectedTemplate.name} for this shipment.` : 'Attach a file to this shipment.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!initialTemplateId && (
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Other / no template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!selectedTemplate && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_META) as DocumentCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_META[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              File <span className="text-destructive">*</span>
            </Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
