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
  WorkflowStageStatus,
  DocumentStatus,
  DocumentRecord,
  DutyStatus,
  ExposureType,
  ResponsibleParty,
  ExposureStatus,
  BookingStatus,
  ChecklistDocumentStatus,
  PlanAssignmentStatus,
  PlanCostCategory,
  ContainerDoStatus,
} from '@/types';

/*
 * Status colors, app-wide: every `color` string below follows the design
 * reference's exact formula — a translucent tint background over a
 * saturated text color (e.g. `bg-success/12 text-success`), never a
 * solid pastel fill — instead of the old `bg-green-100 text-green-700`
 * style. Genuinely binary/small-cardinality statuses (active/inactive,
 * pending/approved/rejected, etc.) map onto the app's real semantic
 * tokens (success/warning/destructive/muted/primary via Badge's
 * variants in components/ui/badge.tsx), so they correctly follow the
 * theme if it's ever retuned. A few fields are genuinely sequential
 * pipelines with many stages (SHIPMENT_STATUS_META's 11 stages,
 * EXPOSURE_TYPE_META's 6 categories) where collapsing to 4-5 semantic
 * colors would make adjacent stages visually indistinguishable — those
 * keep their existing descriptive color families (indigo/purple/cyan/
 * etc.) but gain the same translucent-tint formula (`bg-X-500/12
 * text-X-700`) instead of a solid `bg-X-100` fill, matching the
 * reference's visual language without losing real usability.
 */

/**
 * The strict, non-skippable 11-stage lifecycle (migrations 052/053/056).
 * There is deliberately no 'awaiting_operations' value — a shipment's
 * first status is 'planning' directly; "awaiting operations" describes
 * the pre-conversion, accepted-but-unconverted quotation, a work-queue
 * concept (see the dashboard/work-queue Awaiting Operations sections),
 * never a shipment stage. The 4 legacy entries at the bottom are never
 * produced by application code anymore (see SHIPMENT_STATUS_FLOW) —
 * they're kept only so a pre-migration shipment_timeline row still
 * renders a label instead of crashing on an unrecognized status.
 */
export const SHIPMENT_STATUS_META: Record<
  ShipmentStatus,
  { label: string; color: string; step: number }
> = {
  planning: { label: 'Planning', color: 'bg-indigo-500/12 text-indigo-700', step: 0 },
  documentation: { label: 'Documentation', color: 'bg-warning/15 text-warning', step: 1 },
  awaiting_customs: { label: 'Awaiting Customs Documents', color: 'bg-orange-500/12 text-orange-700', step: 2 },
  customs_clearance: { label: 'Customs Clearance', color: 'bg-purple-500/12 text-purple-700', step: 3 },
  terminal_processing: { label: 'Terminal Processing', color: 'bg-fuchsia-500/12 text-fuchsia-700', step: 4 },
  cargo_examination: { label: 'Cargo Examination', color: 'bg-pink-500/12 text-pink-700', step: 5 },
  released: { label: 'Released', color: 'bg-teal-500/12 text-teal-700', step: 6 },
  transport: { label: 'Transportation', color: 'bg-cyan-500/12 text-cyan-700', step: 7 },
  delivered: { label: 'Delivered', color: 'bg-success/12 text-success', step: 8 },
  completed: { label: 'Completed', color: 'bg-success/12 text-success', step: 9 },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground', step: 10 },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/12 text-destructive', step: -1 },
  // Legacy — retired, never produced going forward.
  booking_received: { label: 'Booking Received', color: 'bg-primary/12 text-primary', step: 0 },
  processing: { label: 'Processing', color: 'bg-purple-500/12 text-purple-700', step: 3 },
  in_transit: { label: 'In Transit', color: 'bg-cyan-500/12 text-cyan-700', step: 7 },
  arrived: { label: 'Arrived', color: 'bg-teal-500/12 text-teal-700', step: 6 },
};

export const SHIPMENT_STATUS_FLOW: ShipmentStatus[] = [
  'planning',
  'documentation',
  'awaiting_customs',
  'customs_clearance',
  'terminal_processing',
  'cargo_examination',
  'released',
  'transport',
  'delivered',
  'completed',
  'archived',
];

/**
 * Visual pipeline stages for the Operations Center. Maps the strict
 * shipment_status flow onto customer-facing freight-forwarding language
 * without touching the underlying enum. "Quotation" is not a shipment
 * status — it represents accepted quotations that haven't become a
 * shipment yet.
 */
export const PIPELINE_STAGES: {
  key: string;
  label: string;
  statuses: ShipmentStatus[];
}[] = [
  { key: 'quotation', label: 'Quotation', statuses: [] },
  { key: 'planning', label: 'Planning', statuses: ['planning'] },
  { key: 'documentation', label: 'Documentation', statuses: ['documentation'] },
  {
    key: 'customs',
    label: 'Customs',
    statuses: ['awaiting_customs', 'customs_clearance', 'terminal_processing', 'cargo_examination', 'released'],
  },
  { key: 'in_transit', label: 'In Transit', statuses: ['transport'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered', 'completed'] },
];

export const QUOTATION_STATUS_META: Record<
  QuotationStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  pending_approval: { label: 'Pending Approval', color: 'bg-warning/15 text-warning' },
  approved: { label: 'Approved', color: 'bg-teal-500/12 text-teal-700' },
  sent: { label: 'Sent', color: 'bg-primary/12 text-primary' },
  accepted: { label: 'Accepted', color: 'bg-success/12 text-success' },
  rejected: { label: 'Rejected', color: 'bg-destructive/12 text-destructive' },
  expired: { label: 'Expired', color: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground' },
};

export const CUSTOMER_STATUS_META: Record<
  CustomerStatus,
  { label: string; color: string }
> = {
  active: { label: 'Active', color: 'bg-success/12 text-success' },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground' },
  blacklisted: { label: 'Blacklisted', color: 'bg-destructive/12 text-destructive' },
};

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  sent: { label: 'Unpaid', color: 'bg-primary/12 text-primary' },
  partial: { label: 'Partial', color: 'bg-warning/15 text-warning' },
  paid: { label: 'Paid', color: 'bg-success/12 text-success' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
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
  demurrage: { label: 'Demurrage' },
  storage: { label: 'Storage' },
  re_examination_penalty: { label: 'Re-examination Penalty' },
  delivery_order_regeneration: { label: 'Delivery Order Regeneration' },
  other: { label: 'Other' },
};

export const EXPENSE_STATUS_META: Record<
  ExpenseStatus,
  { label: string; color: string }
> = {
  pending: { label: 'Pending', color: 'bg-warning/15 text-warning' },
  approved: { label: 'Approved', color: 'bg-success/12 text-success' },
  rejected: { label: 'Rejected', color: 'bg-destructive/12 text-destructive' },
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
  available: { label: 'Available', color: 'bg-success/12 text-success' },
  low_stock: { label: 'Low Stock', color: 'bg-warning/15 text-warning' },
  out_of_stock: { label: 'Out of Stock', color: 'bg-destructive/12 text-destructive' },
};

export const STOCK_MOVEMENT_TYPE_META: Record<
  StockMovementType,
  { label: string; color: string }
> = {
  inbound: { label: 'Inbound', color: 'bg-success/12 text-success' },
  outbound: { label: 'Outbound', color: 'bg-primary/12 text-primary' },
  adjustment_increase: { label: 'Adjustment (+)', color: 'bg-purple-500/12 text-purple-700' },
  adjustment_decrease: { label: 'Adjustment (-)', color: 'bg-purple-500/12 text-purple-700' },
  transfer: { label: 'Transfer', color: 'bg-cyan-500/12 text-cyan-700' },
};

export const PLAN_STATUS_META: Record<
  PlanStatus,
  { label: string; color: string; step: number }
> = {
  planned: { label: 'Planned', color: 'bg-primary/12 text-primary', step: 0 },
  approved: { label: 'Approved', color: 'bg-indigo-500/12 text-indigo-700', step: 1 },
  in_progress: { label: 'In Progress', color: 'bg-warning/15 text-warning', step: 2 },
  completed: { label: 'Completed', color: 'bg-success/12 text-success', step: 3 },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/12 text-destructive', step: -1 },
};

export const PLAN_STATUS_FLOW: PlanStatus[] = ['planned', 'approved', 'in_progress', 'completed'];

export const PRIORITY_META: Record<PriorityLevel, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', color: 'bg-warning/15 text-warning' },
  high: { label: 'High', color: 'bg-destructive/12 text-destructive' },
};

export const PLAN_TASK_STATUS_META: Record<PlanTaskStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning/15 text-warning' },
  in_progress: { label: 'In Progress', color: 'bg-primary/12 text-primary' },
  done: { label: 'Done', color: 'bg-success/12 text-success' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/12 text-destructive' },
};

export const WORKFLOW_STAGE_STATUS_META: Record<WorkflowStageStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', color: 'bg-primary/12 text-primary' },
  completed: { label: 'Completed', color: 'bg-success/12 text-success' },
  skipped: { label: 'Skipped', color: 'bg-muted text-muted-foreground' },
};

export const DOCUMENT_STATUS_META: Record<DocumentStatus, { label: string; color: string }> = {
  uploaded: { label: 'Uploaded', color: 'bg-primary/12 text-primary' },
  verified: { label: 'Verified', color: 'bg-success/12 text-success' },
  rejected: { label: 'Rejected', color: 'bg-destructive/12 text-destructive' },
  expired: { label: 'Expired', color: 'bg-warning/15 text-warning' },
};

/**
 * "Expired" is checked at read time against expiry_date, not relied on
 * as the stored status value — same reasoning as isInvoiceOverdue: no
 * scheduled job exists to flip the stored enum at midnight.
 */
export function isDocumentExpired(doc: Pick<DocumentRecord, 'expiry_date'>): boolean {
  if (!doc.expiry_date) return false;
  return doc.expiry_date < new Date().toISOString().split('T')[0];
}

/**
 * Duty assessment lifecycle (Customs tab), distinct from the broader
 * customs-clearance `status` on the same shipment_customs record.
 */
export const DUTY_STATUS_META: Record<DutyStatus, { label: string; color: string }> = {
  not_assessed: { label: 'Not Assessed', color: 'bg-muted text-muted-foreground' },
  awaiting_payment: { label: 'Awaiting Payment', color: 'bg-warning/15 text-warning' },
  paid: { label: 'Paid', color: 'bg-primary/12 text-primary' },
  verified: { label: 'Verified', color: 'bg-success/12 text-success' },
};

/**
 * Financial Exposure — money being lost after a shipment is already
 * underway (demurrage, detention, storage, penalties). Never a quotation
 * charge. See lib/utils/financial-exposure.ts for the accrual calculator.
 */
export const EXPOSURE_TYPE_META: Record<ExposureType, { label: string; color: string }> = {
  demurrage: { label: 'Demurrage', color: 'bg-destructive/12 text-destructive' },
  detention: { label: 'Detention', color: 'bg-orange-500/12 text-orange-700' },
  terminal_storage: { label: 'Terminal Storage', color: 'bg-warning/15 text-warning' },
  warehouse_storage: { label: 'Warehouse Storage', color: 'bg-purple-500/12 text-purple-700' },
  penalty: { label: 'Penalty', color: 'bg-pink-500/12 text-pink-700' },
  emergency_charge: { label: 'Emergency Charge', color: 'bg-rose-500/12 text-rose-700' },
};

export const RESPONSIBLE_PARTY_META: Record<ResponsibleParty, { label: string }> = {
  customer: { label: 'Customer' },
  freight_forwarder: { label: 'Freight Forwarder' },
  shipping_line: { label: 'Shipping Line' },
  terminal: { label: 'Terminal' },
  customs: { label: 'Customs' },
};

export const EXPOSURE_STATUS_META: Record<ExposureStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning/15 text-warning' },
  disputed: { label: 'Disputed', color: 'bg-destructive/12 text-destructive' },
  approved: { label: 'Approved', color: 'bg-primary/12 text-primary' },
  paid: { label: 'Paid', color: 'bg-success/12 text-success' },
};

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning/15 text-warning' },
  confirmed: { label: 'Confirmed', color: 'bg-success/12 text-success' },
  rejected: { label: 'Rejected', color: 'bg-destructive/12 text-destructive' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
};

export const CHECKLIST_DOCUMENT_STATUS_META: Record<ChecklistDocumentStatus, { label: string; color: string }> = {
  not_received: { label: 'Not Received', color: 'bg-muted text-muted-foreground' },
  received: { label: 'Received', color: 'bg-primary/12 text-primary' },
  verified: { label: 'Verified', color: 'bg-success/12 text-success' },
  rejected: { label: 'Rejected', color: 'bg-destructive/12 text-destructive' },
};

export const PLAN_ASSIGNMENT_STATUS_META: Record<PlanAssignmentStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground' },
  working: { label: 'Working', color: 'bg-primary/12 text-primary' },
  completed: { label: 'Completed', color: 'bg-success/12 text-success' },
  blocked: { label: 'Blocked', color: 'bg-destructive/12 text-destructive' },
};

/** Container "DO Status" — Delivery Order collection state (Container Management enrichment). */
export const CONTAINER_DO_STATUS_META: Record<ContainerDoStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground' },
  issued: { label: 'Issued', color: 'bg-primary/12 text-primary' },
  collected: { label: 'Collected', color: 'bg-success/12 text-success' },
};

/** Financial Planning's 10 cost categories (Planning Command Center §11). */
export const PLAN_COST_CATEGORY_LABELS: Record<PlanCostCategory, string> = {
  ocean_freight: 'Ocean/Air Freight',
  thc: 'Terminal Handling Charges',
  documentation: 'Documentation Fees',
  terminal_charges: 'Terminal Charges',
  transport: 'Transport',
  warehouse: 'Warehouse',
  duty: 'Customs Duty',
  inspection: 'Inspection Fees',
  agency_fees: 'Agency Fees',
  miscellaneous: 'Miscellaneous',
};

/**
 * Organization lifecycle (migration 062). `trial_expired` is deliberately
 * absent from the stored CHECK constraint — see isTrialExpired() below —
 * but included here so it renders wherever this metadata is looked up.
 */
export const ORGANIZATION_STATUS_META: Record<
  import('@/types').OrganizationStatus,
  { label: string; color: string }
> = {
  pending_verification: { label: 'Pending Verification', color: 'bg-warning/15 text-warning' },
  active_trial: { label: 'Active Trial', color: 'bg-warning/15 text-warning' },
  active_subscription: { label: 'Active', color: 'bg-success/12 text-success' },
  trial_expired: { label: 'Trial Expired', color: 'bg-orange-500/12 text-orange-700' },
  suspended: { label: 'Suspended', color: 'bg-destructive/12 text-destructive' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
};

export const ORGANIZATION_ORIGIN_META: Record<
  import('@/types').OrganizationOrigin,
  { label: string; color: string }
> = {
  self_service: { label: 'Self-Service', color: 'bg-success/12 text-success' },
  platform_admin: { label: 'Assisted Onboarding', color: 'bg-muted text-muted-foreground' },
  demo: { label: 'Demo', color: 'bg-purple-500/12 text-purple-700' },
  internal: { label: 'Internal', color: 'bg-indigo-500/12 text-indigo-700' },
};

/**
 * Trial expiry is deliberately computed here, not stored — a status column
 * flipped by a cron job can drift if a run is missed. Nothing auto-blocks
 * access on this; it only changes what's displayed/counted, so it's always
 * exactly as current as `trial_ends_at`.
 */
export function isTrialExpired(status: string, trialEndsAt: string | null): boolean {
  return status === 'active_trial' && !!trialEndsAt && new Date(trialEndsAt) < new Date();
}

/** The status to actually display, folding the lazy trial_expired check in. */
export function effectiveOrganizationStatus(
  status: import('@/types').OrganizationStatus,
  trialEndsAt: string | null
): import('@/types').OrganizationStatus {
  return isTrialExpired(status, trialEndsAt) ? 'trial_expired' : status;
}

/** Whole days remaining until trialEndsAt, floored at 0 — never negative. */
export function daysRemaining(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

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
 * Compact currency for KPI tiles — "₦50K", "₦2.5M" — where the full
 * 2-decimal figure would overflow a narrow card. Exact amounts belong on
 * the page the tile links to, not the tile itself.
 */
export function formatCompactCurrency(amount: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
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
