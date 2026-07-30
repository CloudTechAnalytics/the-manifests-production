import { supabase } from '@/lib/supabase/client';

export interface ReleaseReadiness {
  ready: boolean;
  blockers: string[];
}

/**
 * Before a shipment can move to Transportation, customs must be released
 * and duty paid, the terminal must have issued a gate pass and exit note,
 * and at least a Bill of Lading must be on file. This last check is a
 * lightweight stand-in for "Documents Approved" until per-shipment
 * document checklists/approval status exist — it confirms a BL was
 * uploaded, not that it's been verified.
 */
export async function checkReleaseReadiness(shipmentId: string): Promise<ReleaseReadiness> {
  const blockers: string[] = [];

  const [{ data: customs }, { data: terminal }, { count: blCount }] = await Promise.all([
    supabase
      .from('shipment_customs')
      .select('status, duty_paid')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('terminal_operations')
      .select('gate_pass_number, exit_note_number')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('shipment_id', shipmentId)
      .eq('category', 'bill_of_lading')
      .is('deleted_at', null),
  ]);

  if (!customs || customs.status !== 'released') {
    blockers.push('Customs has not released this shipment yet.');
  }
  if (!customs?.duty_paid) {
    blockers.push('Duty has not been marked as paid.');
  }
  if (!terminal?.gate_pass_number) {
    blockers.push('No gate pass has been recorded at the terminal.');
  }
  if (!terminal?.exit_note_number) {
    blockers.push('No exit note has been recorded at the terminal.');
  }
  if (!blCount) {
    blockers.push('No Bill of Lading has been uploaded for this shipment.');
  }

  return { ready: blockers.length === 0, blockers };
}
