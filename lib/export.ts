/*
 * CSV export for data tables.
 *
 * CSV rather than a binary .xlsx: it opens directly in Excel (double-click)
 * and is a first-class import source in Power BI, with zero dependencies
 * and no security surface from a spreadsheet-parsing library. A UTF-8 BOM
 * is prepended so Excel reads accented text and ₦/£/€ correctly instead of
 * mojibake.
 */

export interface ExportColumn<T> {
  header: string;
  // Pull the raw value for this column from a row. Return a string/number/
  // boolean/Date/null — formatting to text is handled centrally below so
  // every column escapes and renders consistently.
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

function toCell(v: string | number | boolean | Date | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// Escapes per RFC 4180: wrap in quotes when the value contains a comma,
// quote, or newline, and double any embedded quotes. Also guards against
// CSV/formula injection — a cell starting with = + - @ is prefixed with a
// single quote so spreadsheet apps don't execute it.
function escapeCell(raw: string): string {
  let s = raw;
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(toCell(c.value(row)))).join(',')
  );
  return [header, ...body].join('\r\n');
}

/** Timestamped, filesystem-safe filename: "shipments-2026-07-27.csv". */
export function exportFilename(base: string): string {
  const date = new Date().toISOString().split('T')[0];
  const safe = base.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'export'}-${date}.csv`;
}

export function downloadCsv<T>(
  base: string,
  columns: ExportColumn<T>[],
  rows: T[]
): void {
  const csv = toCsv(columns, rows);
  // ﻿ is the BOM Excel looks for to decode the file as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(base);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
