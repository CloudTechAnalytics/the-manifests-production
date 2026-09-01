import { supabase } from '@/shared/lib/supabase/client';
import type { PlatformSettings } from '@/shared/types';

// --- Profile card ----------------------------------------------------------

/** Uploads (or replaces) the current platform admin's own avatar photo. */
export async function uploadProfileAvatar(params: { userId: string; file: File }): Promise<string> {
  const { userId, file } = params;
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  // One object per user, overwritten on replace — same pattern as
  // org-logos, so a changed photo never leaves an orphaned file behind.
  const path = `${userId}/avatar.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (updErr) throw updErr;

  return url;
}

export async function updateOwnProfile(params: {
  userId: string;
  fullName: string;
  title: string;
  phone: string;
}): Promise<void> {
  const { userId, fullName, title, phone } = params;
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName.trim(),
      title: title.trim() || null,
      phone: phone.trim() || null,
    })
    .eq('id', userId);
  if (error) throw error;
}

// --- Platform configuration card -------------------------------------------

export async function fetchPlatformSettings(): Promise<PlatformSettings | null> {
  const { data, error } = await supabase.from('platform_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  return (data as PlatformSettings) ?? null;
}

export async function updatePlatformSettings(params: {
  trialDays: number;
  defaultTrialPlanId: string | null;
  selfRegistrationEnabled: boolean;
  termsVersion: string;
  privacyVersion: string;
  productName: string;
  supportEmail: string | null;
  primaryColor: string;
  globalNotice: string | null;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  dbCapMb: number;
  storageCapMb: number;
  updatedBy: string;
}): Promise<void> {
  const {
    trialDays,
    defaultTrialPlanId,
    selfRegistrationEnabled,
    termsVersion,
    privacyVersion,
    productName,
    supportEmail,
    primaryColor,
    globalNotice,
    maintenanceMode,
    maintenanceMessage,
    dbCapMb,
    storageCapMb,
    updatedBy,
  } = params;

  const { error } = await supabase
    .from('platform_settings')
    .update({
      trial_duration_days: trialDays,
      default_trial_plan_id: defaultTrialPlanId,
      self_registration_enabled: selfRegistrationEnabled,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      product_name: productName,
      support_email: supportEmail,
      primary_color: primaryColor,
      global_notice: globalNotice,
      maintenance_mode: maintenanceMode,
      maintenance_message: maintenanceMessage,
      db_cap_mb: dbCapMb,
      storage_cap_mb: storageCapMb,
      updated_by: updatedBy,
    })
    .eq('id', true);
  if (error) throw error;
  // No manual activity-log insert here on purpose - migration 094 added a
  // database trigger that logs every platform_settings write (diffed
  // column-by-column) regardless of which call site made it, so this
  // service function doesn't need to remember to log itself.
}

// --- System Health: on-demand Supabase plan usage ---------------------

export interface ResourceUsage {
  db_bytes: number;
  storage_bytes: number;
  db_cap_bytes: number;
  storage_cap_bytes: number;
  db_pct: number;
  storage_pct: number;
}

/** Real DB/storage usage against the Free-tier caps stored on
 *  platform_settings (migration 095) - admin-gated at the database level
 *  (platform_resource_usage() raises if the caller isn't a platform
 *  admin), not just hidden behind a UI check. */
export async function fetchResourceUsage(): Promise<ResourceUsage> {
  const { data, error } = await supabase.rpc('platform_resource_usage').single();
  if (error) throw error;
  return data as ResourceUsage;
}
