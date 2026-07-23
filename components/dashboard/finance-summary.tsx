import Link from 'next/link';
import { Wallet, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils/status';
import type { FinanceSummaryData } from '@/hooks/use-dashboard-data';

interface FinanceSummaryProps {
  finance: FinanceSummaryData;
  loading?: boolean;
}

/**
 * Receivables at a glance. Every figure is reported in the primary
 * currency only — totals across currencies are never blended, matching
 * how the Sales and Reports modules present money.
 */
export function FinanceSummary({ finance, loading }: FinanceSummaryProps) {
  const currency = finance.primaryCurrency;
  const hasData = currency !== null;

  const rows = hasData
    ? [
        {
          label: 'Invoiced',
          value: finance.invoicedByCurrency[currency] ?? 0,
          tone: 'text-foreground',
        },
        {
          label: 'Collected',
          value: finance.collectedByCurrency[currency] ?? 0,
          tone: 'text-emerald-600',
        },
        {
          label: 'Outstanding',
          value: finance.outstandingByCurrency[currency] ?? 0,
          tone: 'text-amber-600',
        },
        {
          label: 'Expenses',
          value: finance.expensesByCurrency[currency] ?? 0,
          tone: 'text-red-600',
        },
      ]
    : [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-3 pt-4">
        <div className="space-y-0.5">
          <CardTitle className="text-lg font-semibold">
            Finance Summary
          </CardTitle>
          {hasData && (
            <p className="text-xs text-muted-foreground">
              Reported in {currency}
            </p>
          )}
        </div>
        <Link
          href="/invoices"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Invoices
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !hasData ? (
          <EmptyState
            icon={Wallet}
            title="No invoices yet"
            message="Issue an invoice to start tracking receivables."
            compact
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {row.label}
                  </p>
                  <p
                    className={`mt-1.5 truncate text-lg font-bold tracking-tight ${row.tone}`}
                  >
                    {formatCurrency(row.value, currency)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="text-muted-foreground">
                {finance.outstandingCount} invoice
                {finance.outstandingCount === 1 ? '' : 's'} outstanding
              </span>
              {finance.overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  {finance.overdueCount} overdue
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
