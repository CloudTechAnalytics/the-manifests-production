import { supabase } from '@/shared/lib/supabase/client';

export type EventType =
  | 'booking'
  | 'est_departure'
  | 'est_arrival'
  | 'actual_departure'
  | 'actual_arrival';

export interface CalendarEvent {
  id: string;
  shipmentId: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  referenceNumber: string | null;
  customerName: string;
}

/**
 * Calendar events, generated from shipment booking/departure/arrival
 * dates rather than a dedicated events table.
 */
export async function fetchCalendarEvents(branchFilter: string | null): Promise<CalendarEvent[]> {
  let query = supabase
    .from('shipments')
    .select(
      'id, reference_number, booking_date, estimated_departure, estimated_arrival, actual_departure, actual_arrival, customer:customers(company_name)'
    )
    .is('deleted_at', null);
  if (branchFilter) query = query.eq('branch_id', branchFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    reference_number: string | null;
    booking_date: string | null;
    estimated_departure: string | null;
    estimated_arrival: string | null;
    actual_departure: string | null;
    actual_arrival: string | null;
    customer: { company_name: string } | null;
  }[];

  const evts: CalendarEvent[] = [];
  const fieldToType: [keyof (typeof rows)[number], EventType][] = [
    ['booking_date', 'booking'],
    ['estimated_departure', 'est_departure'],
    ['estimated_arrival', 'est_arrival'],
    ['actual_departure', 'actual_departure'],
    ['actual_arrival', 'actual_arrival'],
  ];

  rows.forEach((r) => {
    fieldToType.forEach(([field, type]) => {
      const value = r[field] as string | null;
      if (!value) return;
      evts.push({
        id: `${r.id}-${type}`,
        shipmentId: r.id,
        date: value,
        type,
        referenceNumber: r.reference_number,
        customerName: r.customer?.company_name ?? 'Unknown',
      });
    });
  });

  return evts;
}
