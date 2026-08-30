'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { getErrorMessage } from '@/shared/lib/utils';
import { downloadCsv, type ExportColumn } from '@/shared/lib/export';

interface ExportButtonProps<T> {
  /** Rows currently in view — export mirrors what the user sees (filters
   *  and search already applied), which is what they expect to download.
   *  Use this on a page that loads its full filtered set eagerly. */
  data?: T[];
  /** Alternative to `data` for a paginated list: fetches the full
   *  filtered set (not just the page currently on screen) only when the
   *  user actually clicks Export, so pagination on the table never
   *  silently shrinks what "Export" means — it still exports everything
   *  matching the current filters, just without holding it all in state
   *  for display. Exactly one of `data`/`fetchData` should be given. */
  fetchData?: () => Promise<T[]>;
  columns: ExportColumn<T>[];
  /** Base name for the file, e.g. "shipments" → shipments-2026-07-27.csv */
  filename: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Reusable "Export" control for any list/table page. Downloads the given
 * (or freshly-fetched) rows as a CSV that opens in Excel and imports into
 * Power BI. Disabled when there's nothing to export.
 */
export function ExportButton<T>({
  data,
  fetchData,
  columns,
  filename,
  label = 'Export',
  disabled,
}: ExportButtonProps<T>) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    let rows: T[];
    if (fetchData) {
      setExporting(true);
      try {
        rows = await fetchData();
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to prepare export'));
        return;
      } finally {
        setExporting(false);
      }
    } else {
      rows = data ?? [];
    }

    if (rows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    downloadCsv(filename, columns, rows);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
  };

  const nothingToExport = !fetchData && (data?.length ?? 0) === 0;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || exporting || nothingToExport}
    >
      {exporting ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-1.5 h-4 w-4" />
      )}
      {exporting ? 'Preparing…' : label}
    </Button>
  );
}
