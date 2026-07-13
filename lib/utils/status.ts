import type {
  ShipmentStatus,
  QuotationStatus,
  CustomerStatus,
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
