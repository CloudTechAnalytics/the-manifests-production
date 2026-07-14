import type {
  ShipmentStatus,
  QuotationStatus,
  CustomerStatus,
  InvoiceStatus,
  PaymentMethod,
  ExpenseCategory,
  ExpenseStatus,
  Invoice,
  StockMovementType,
  PlanStatus,
  PriorityLevel,
  PlanTaskStatus,
} from '@/types';

export const SHIPMENT_STATUS_META: Record<
  ShipmentStatus,
  { label: string; color: string; step: number }
> = {
  booking_received: { label: 'Booking Received', color: 'bg-blue-100 text-blue-700', step: 0 },
  documentation: { label: 'Documentation', color: 'bg-amber-100 text-amber-700', step: 1 },
  processing: { label: 'Processing', color: 'bg-purple-100 text-purple-700', step: 2 },
  in_transit: { label: 'In Transit', color: 'bg-cyan-100 text-cyan-700', step: 3 },
  arrived: { label: 'Arrived', color: 'bg-indigo-100 text-indigo-700', step: 4 },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', step: 5 },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', step: -1 },
};

export const SHIPMENT_STATUS_FLOW: ShipmentStatus[] = [
  'booking_received',
  'documentation',
  'processing',
  'in_transit',
  'arrived',
  'delivered',
];

/**
 * Visual pipeline stages for the Operations Center. Maps the existing
 * shipment_status enum onto customer-facing freight-forwarding language
 * (e.g. "processing" reads as "Customs" in a freight context) without
 * touching the underlying enum. "Quotation" is not a shipment status —
 * it represents approved quotations that haven't become a shipment yet.
 */
export const PIPELINE_STAGES: {
  key: string;
  label: string;
  statuses: ShipmentStatus[];
}[] = [
  { key: 'quotation', label: 'Quotation', statuses: [] },
  { key: 'booking', label: 'Booking', statuses: ['booking_received'] },
  { key: 'documentation', label: 'Documentation', statuses: ['documentation'] },
  { key: 'customs', label: 'Customs', statuses: ['processing'] },
  { key: 'in_transit', label: 'In Transit', statuses: ['in_transit', 'arrived'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
];

export const QUOTATION_STATUS_META: Record<
  QuotationStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', color: 'bg-amber-100 text-amber-700' },
};

export const CUSTOMER_STATUS_META: Record<
  CustomerStatus,
  { label: string; color: string }
> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-700' },
  blacklisted: { label: 'Blacklisted', color: 'bg-red-100 text-red-700' },
};

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Unpaid', color: 'bg-blue-100 text-blue-700' },
  partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
};

/**
 * "Overdue" is not a stored status (see migration notes) — it's derived
 * here the same way shipment delays are: due date in the past and still
 * unpaid. Flipping a stored enum value at midnight would need a
 * scheduled job this project doesn't have.
 */
export function isInvoiceOverdue(invoice: Pick<Invoice, 'status' | 'due_date'>): boolean {
  if (invoice.status !== 'sent' && invoice.status !== 'partial') return false;
  if (!invoice.due_date) return false;
  return invoice.due_date < new Date().toISOString().split('T')[0];
}

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string }> = {
  bank_transfer: { label: 'Bank Transfer' },
  cheque: { label: 'Cheque' },
  cash: { label: 'Cash' },
  card: { label: 'Card' },
  other: { label: 'Other' },
};

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string }> = {
  transport: { label: 'Transport' },
  customs: { label: 'Customs' },
  rent: { label: 'Rent' },
  salaries_benefits: { label: 'Salaries & Benefits' },
  utilities: { label: 'Utilities' },
  other: { label: 'Other' },
};

export const EXPENSE_STATUS_META: Record<
  ExpenseStatus,
  { label: string; color: string }
> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
};

export type StockStatus = 'available' | 'low_stock' | 'out_of_stock';

/**
 * Derived, not stored — same reasoning as "Overdue" invoices. A quantity
 * is only ever known relative to an item's reorder_point at read time.
 */
export function getStockStatus(quantity: number, reorderPoint: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= reorderPoint) return 'low_stock';
  return 'available';
}

export const STOCK_STATUS_META: Record<StockStatus, { label: string; color: string }> = {
  available: { label: 'Available', color: 'bg-green-100 text-green-700' },
  low_stock: { label: 'Low Stock', color: 'bg-amber-100 text-amber-700' },
  out_of_stock: { label: 'Out of Stock', color: 'bg-red-100 text-red-700' },
};

export const STOCK_MOVEMENT_TYPE_META: Record<
  StockMovementType,
  { label: string; color: string }
> = {
  inbound: { label: 'Inbound', color: 'bg-green-100 text-green-700' },
  outbound: { label: 'Outbound', color: 'bg-blue-100 text-blue-700' },
  adjustment_increase: { label: 'Adjustment (+)', color: 'bg-purple-100 text-purple-700' },
  adjustment_decrease: { label: 'Adjustment (-)', color: 'bg-purple-100 text-purple-700' },
  transfer: { label: 'Transfer', color: 'bg-cyan-100 text-cyan-700' },
};

export const PLAN_STATUS_META: Record<
  PlanStatus,
  { label: string; color: string; step: number }
> = {
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-700', step: 0 },
  approved: { label: 'Approved', color: 'bg-indigo-100 text-indigo-700', step: 1 },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700', step: 2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', step: 3 },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', step: -1 },
};

export const PLAN_STATUS_FLOW: PlanStatus[] = ['planned', 'approved', 'in_progress', 'completed'];

export const PRIORITY_META: Record<PriorityLevel, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-700' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  high: { label: 'High', color: 'bg-red-100 text-red-700' },
};

export const PLAN_TASK_STATUS_META: Record<PlanTaskStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  done: { label: 'Done', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

export function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(amount: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Given a map of currency -> total, picks the currency with the highest
 * total to use as the "primary" one for single-number aggregates (avoids
 * silently blending incompatible currencies into one misleading figure).
 */
export function pickPrimaryCurrency(
  totalsByCurrency: Record<string, number>
): string | null {
  const currencies = Object.keys(totalsByCurrency);
  if (currencies.length === 0) return null;
  return currencies.reduce((a, b) =>
    totalsByCurrency[a] >= totalsByCurrency[b] ? a : b
  );
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}
