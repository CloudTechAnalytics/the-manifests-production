import { supabase } from '@/shared/lib/supabase/client';
import type { Branch, PublicTrackedShipment, Shipment, ShipmentTimelineEntry, ShipmentType } from '@/shared/types';

// ---------------------------------------------------------------------------
// Public track page (no auth)
// ---------------------------------------------------------------------------

export async function publicTrackShipment(reference: string): Promise<PublicTrackedShipment | null> {
  const { data, error } = await supabase.rpc('public_track_shipment', { p_reference: reference });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Internal tracking page
// ---------------------------------------------------------------------------

export type TrackingShipmentRow = Shipment & {
  customer?: { id: string; company_name: string } | null;
  assigned_user?: { id: string; full_name: string } | null;
  branch?: { id: string; name: string } | null;
};

export type TrackingTimelineEntry = ShipmentTimelineEntry & {
  user: { id: string; full_name: string } | null;
};

export async function fetchBranchesForTracking(): Promise<Branch[]> {
  const { data } = await supabase.from('branches').select('*').is('deleted_at', null).order('name', { ascending: true });
  return (data as Branch[]) ?? [];
}

export interface TrackingShipmentsFilters {
  isAdmin: boolean;
  userBranchId: string | null;
  branchIdFilter: string;
  typeFilter: 'all' | ShipmentType;
  search: string;
}

export async function fetchTrackingShipments({
  isAdmin,
  userBranchId,
  branchIdFilter,
  typeFilter,
  search,
}: TrackingShipmentsFilters): Promise<TrackingShipmentRow[]> {
  let query = supabase
    .from('shipments')
    .select(
      '*, customer:customers(id, company_name), assigned_user:profiles!shipments_assigned_to_fkey(id, full_name), branch:branches(id, name)'
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (!isAdmin && userBranchId) {
    query = query.eq('branch_id', userBranchId);
  }
  if (isAdmin && branchIdFilter !== 'all') {
    query = query.eq('branch_id', branchIdFilter);
  }
  if (typeFilter !== 'all') {
    query = query.eq('shipment_type', typeFilter);
  }
  if (search) {
    const sanitized = search.replace(/[%_(),.\\]/g, ' ');
    query = query.or(
      `reference_number.ilike.%${sanitized}%,tracking_number.ilike.%${sanitized}%,container_number.ilike.%${sanitized}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading shipments:', error);
    return [];
  }
  return (data as TrackingShipmentRow[]) ?? [];
}

export async function fetchShipmentTimeline(shipmentId: string): Promise<TrackingTimelineEntry[]> {
  const { data, error } = await supabase
    .from('shipment_timeline')
    .select('*, user:profiles!shipment_timeline_created_by_fkey(id, full_name)')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading timeline:', error);
    return [];
  }
  return (data as TrackingTimelineEntry[]) ?? [];
}
