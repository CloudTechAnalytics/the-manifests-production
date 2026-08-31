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
  updatedBy: string;
}): Promise<void> {
  const { trialDays, defaultTrialPlanId, selfRegistrationEnabled, termsVersion, privacyVersion, updatedBy } = params;

  const { error } = await supabase
    .from('platform_settings')
    .update({
      trial_duration_days: trialDays,
      default_trial_plan_id: defaultTrialPlanId,
      self_registration_enabled: selfRegistrationEnabled,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      updated_by: updatedBy,
    })
    .eq('id', true);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    action: 'platform_settings.updated',
    entity_type: 'platform_settings',
    description: `Updated platform settings: trial=${trialDays}d, self-registration=${selfRegistrationEnabled ? 'on' : 'off'}`,
  });
}
