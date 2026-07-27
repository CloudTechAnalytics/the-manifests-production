'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadCsv, type ExportColumn } from '@/lib/export';

interface ExportButtonProps<T> {
  /** Rows currently in view — export mirrors what the user sees (filters
   *  and search already applied), which is what they expect to download. */
  data: T[];
  columns: ExportColumn<T>[];
  /** Base name for the file, e.g. "shipments" → shipments-2026-07-27.csv */
  filename: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Reusable "Export" control for any list/table page. Downloads the given
 * rows as a CSV that opens in Excel and imports into Power BI. Disabled
 * when there's nothing to export.
 */
export function ExportButton<T>({
  data,
  columns,
  filename,
  label = 'Export',
  disabled,
}: ExportButtonProps<T>) {
  const handleExport = () => {
    if (data.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    downloadCsv(filename, columns, data);
    toast.success(`Exported ${data.length} row${data.length === 1 ? '' : 's'}`);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || data.length === 0}
    >
      <Download className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}
