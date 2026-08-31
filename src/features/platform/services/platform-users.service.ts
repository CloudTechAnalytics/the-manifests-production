import { supabase } from '@/shared/lib/supabase/client';
import { callPlatformEdgeFunction } from './edge-functions';
import type { Profile, UserRole } from '@/shared/types';

// --- Platform Users page --------------------------------------------------

export async function fetchPlatformUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'platform_admin')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Profile[]) ?? [];
}

/** Creates a CloudTech platform-admin staff account via its edge function. */
export async function createPlatformUser(params: {
  fullName: string;
  email: string;
  password: string;
}): Promise<void> {
  await callPlatformEdgeFunction('create-platform-user', {
    full_name: params.fullName,
    email: params.email,
    password: params.password,
  });
}

// --- Organization Users page ----------------------------------------------

export interface OrgUserRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  organization: { name: string } | null;
  branch: { name: string } | null;
}

export async function fetchOrganizationUsers(): Promise<OrgUserRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      // organizations!profiles_organization_id_fkey disambiguates the embed:
      // profiles.organization_id -> organizations.id AND
      // organizations.created_by -> profiles.id both link these two
      // tables, so PostgREST can't infer direction from the table name
      // alone and refuses to embed without an explicit FK hint.
      'id, full_name, email, role, is_active, organization:organizations!profiles_organization_id_fkey(name), branch:branches(name)'
    )
    .neq('role', 'platform_admin')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as unknown as OrgUserRow[]) ?? [];
}
