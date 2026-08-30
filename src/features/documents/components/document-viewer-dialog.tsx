'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

const OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

type PreviewKind = 'pdf' | 'office' | 'unsupported';

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function kindOf(name: string, mimeType: string | null): PreviewKind {
  if (mimeType === 'application/pdf' || extensionOf(name) === 'pdf') return 'pdf';
  if (
    (mimeType && OFFICE_MIME_TYPES.has(mimeType)) ||
    OFFICE_EXTENSIONS.has(extensionOf(name))
  ) {
    return 'office';
  }
  return 'unsupported';
}

export interface PreviewableDocument {
  name: string;
  file_path: string;
  mime_type: string | null;
}

interface DocumentViewerDialogProps {
  doc: PreviewableDocument | null;
  onClose: () => void;
}

export function DocumentViewerDialog({ doc, onClose }: DocumentViewerDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 300); // 5 minutes — just long enough to view
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        toast.error(getErrorMessage(error, 'Failed to generate a preview link'));
        setSignedUrl(null);
      } else {
        setSignedUrl(data.signedUrl);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const kind = doc ? kindOf(doc.name, doc.mime_type) : 'unsupported';

  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{doc?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          {loading || !signedUrl ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : kind === 'pdf' ? (
            <iframe src={signedUrl} title={doc?.name} className="h-full w-full" />
          ) : kind === 'office' ? (
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`}
              title={doc?.name}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <FileWarning className="h-10 w-10 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">Preview isn't available for this file type</p>
                <p className="text-sm text-muted-foreground">Download it to view it instead.</p>
              </div>
              <Button size="sm" onClick={() => window.open(signedUrl, '_blank')}>
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </Button>
            </div>
          )}
        </div>

        {kind === 'office' && (
          <p className="text-xs text-muted-foreground">
            Previewed via Microsoft Office Online — the file is sent to Microsoft's viewer
            service to render it.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
