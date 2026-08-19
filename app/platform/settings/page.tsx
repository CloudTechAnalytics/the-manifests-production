'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Palette, Sun, Moon, Monitor, CheckCircle2, Info, Settings2, Loader2, Camera, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase/client';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { UserPreferences, PlatformSettings, Plan } from '@/types';

// --- Profile card ------------------------------------------------------

function ProfileCard() {
  const { profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setTitle(profile.title ?? '');
    setPhone(profile.phone ?? '');
    setDirty(false);
  }, [profile]);

  if (!profile) return null;

  const initials = (profile.full_name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG or WEBP)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Photo must be 2 MB or smaller');
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      // One object per user, overwritten on replace — same pattern as
      // org-logos, so a changed photo never leaves an orphaned file behind.
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', profile.id);
      if (updErr) throw updErr;

      await refreshProfile();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload photo'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          title: title.trim() || null,
          phone: phone.trim() || null,
        })
        .eq('id', profile.id);
      if (error) throw error;

      await refreshProfile();
      setDirty(false);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <UserRound className="h-5 w-5" />
          </div>
          Profile
        </CardTitle>
        <CardDescription>Your name, photo and contact details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleAvatarFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-brand-gold/15"
            title={profile.avatar_url ? 'Change photo' : 'Upload photo'}
          >
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-serif text-lg font-bold text-brand-gold-soft">{initials || '?'}</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground">
              <Camera className="h-3 w-3" />
            </span>
          </button>
          <div>
            <p className="font-semibold">{profile.full_name}</p>
            <p className="text-sm text-muted-foreground">
              {profile.title || 'Team member'} · {profile.role === 'platform_admin' ? 'Platform Admin' : profile.role}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-title">Title</Label>
            <Input
              id="profile-title"
              value={title}
              placeholder="e.g. Platform Admin"
              onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={profile.email} disabled />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/*
 * Platform-console preferences AND platform-wide configuration.
 *
 * The two are deliberately kept in separate cards. "My Preferences" lives
 * in user_preferences keyed by user_id — the platform admin's own theme
 * and notification choices, entirely separate from any organization's
 * settings. "Platform Configuration" below it is the real global config
 * (migration 063's platform_settings, a single row, RLS-gated to
 * is_platform_admin()) — trial length, the default trial plan, and the
 * self-service kill switch, so none of that is hardcoded in the app.
 */

function PlatformConfigurationCard() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trialDays, setTrialDays] = useState('30');
  const [defaultPlanId, setDefaultPlanId] = useState('');
  const [selfRegEnabled, setSelfRegEnabled] = useState(true);
  const [termsVersion, setTermsVersion] = useState('v1');
  const [privacyVersion, setPrivacyVersion] = useState('v1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from('platform_settings').select('*').eq('id', true).maybeSingle(),
        supabase.from('plans').select('*').is('deleted_at', null).order('sort_order', { ascending: true }),
      ]);
      if (s) {
        setSettings(s as PlatformSettings);
        setTrialDays(String(s.trial_duration_days));
        setDefaultPlanId(s.default_trial_plan_id ?? '');
        setSelfRegEnabled(s.self_registration_enabled);
        setTermsVersion(s.terms_version);
        setPrivacyVersion(s.privacy_version);
      }
      setPlans((p ?? []) as Plan[]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load platform configuration'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!profile) return;
    const days = parseInt(trialDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      toast.error('Trial duration must be a positive number of days');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .update({
          trial_duration_days: days,
          default_trial_plan_id: defaultPlanId || null,
          self_registration_enabled: selfRegEnabled,
          terms_version: termsVersion.trim() || 'v1',
          privacy_version: privacyVersion.trim() || 'v1',
          updated_by: profile.id,
        })
        .eq('id', true);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        action: 'platform_settings.updated',
        entity_type: 'platform_settings',
        description: `Updated platform settings: trial=${days}d, self-registration=${selfRegEnabled ? 'on' : 'off'}`,
      });

      toast.success('Platform configuration saved');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save platform configuration'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Settings2 className="h-5 w-5" />
          </div>
          Platform Configuration
        </CardTitle>
        <CardDescription>
          Applies to every new self-service registration — nothing here is hardcoded in the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Self-service registration</p>
            <p className="text-xs text-muted-foreground">
              Turn off to temporarily stop new organizations registering at /register.
            </p>
          </div>
          <Switch checked={selfRegEnabled} onCheckedChange={setSelfRegEnabled} disabled={saving} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="trial-days">Trial duration (days)</Label>
            <Input id="trial-days" type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Default trial plan</Label>
            <Select value={defaultPlanId || undefined} onValueChange={setDefaultPlanId}>
              <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="terms-version">Terms of Service version</Label>
            <Input id="terms-version" value={termsVersion} onChange={(e) => setTermsVersion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="privacy-version">Privacy Policy version</Label>
            <Input id="privacy-version" value={privacyVersion} onChange={(e) => setPrivacyVersion(e.target.value)} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save platform configuration
        </Button>
      </CardContent>
    </Card>
  );
}

const NOTIF_GROUPS = [
  {
    title: 'New Organizations',
    description: 'Get notified when a tenant is created or an admin joins.',
    emailKey: 'notif_email_system_alerts' as const,
    inappKey: 'notif_inapp_system_alerts' as const,
  },
  {
    title: 'Subscription Changes',
    description: 'Get notified when a plan is assigned, upgraded, or lapses.',
    emailKey: 'notif_email_quotation_approvals' as const,
    inappKey: 'notif_inapp_quotation_approvals' as const,
  },
  {
    title: 'Platform Alerts',
    description: 'System health and maintenance notices.',
    emailKey: 'notif_email_shipment_updates' as const,
    inappKey: 'notif_inapp_shipment_updates' as const,
  },
];

const THEME_OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function PlatformSettingsPage() {
  const { theme, setTheme, preferences, setPreferences, loading } = useTheme();
  const [saving, setSaving] = useState(false);

  const handleToggle = async (key: keyof UserPreferences, value: boolean) => {
    setSaving(true);
    await setPreferences({ [key]: value } as Partial<UserPreferences>);
    setSaving(false);
    toast.success('Preference updated');
  };

  const handleThemeChange = async (t: 'light' | 'dark' | 'system') => {
    setSaving(true);
    await setTheme(t);
    setSaving(false);
    toast.success(`Theme changed to ${t}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-wide configuration below; your own console preferences further down — the two are
          saved separately and never affect any organization&apos;s own settings.
        </p>
      </div>

      <ProfileCard />

      <PlatformConfigurationCard />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            My Preferences
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Bell className="h-5 w-5" />
                </div>
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure email and in-app notifications for platform events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="hidden items-center gap-4 border-b border-border pb-2 sm:flex sm:pl-1">
                <span className="flex-1 text-xs font-medium text-muted-foreground">Category</span>
                <span className="w-20 text-center text-xs font-medium text-muted-foreground">Email</span>
                <span className="w-20 text-center text-xs font-medium text-muted-foreground">In-App</span>
              </div>

              {NOTIF_GROUPS.map((group) => (
                <div
                  key={group.title}
                  className="flex flex-col gap-3 border-b border-border pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4 sm:pl-1"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{group.title}</p>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground sm:hidden">Email</span>
                      <Switch
                        checked={preferences?.[group.emailKey] ?? true}
                        onCheckedChange={(v) => handleToggle(group.emailKey, v)}
                        disabled={saving}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground sm:hidden">In-App</span>
                      <Switch
                        checked={preferences?.[group.inappKey] ?? true}
                        onCheckedChange={(v) => handleToggle(group.inappKey, v)}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Palette className="h-5 w-5" />
                </div>
                Theme Preference
              </CardTitle>
              <CardDescription>
                Choose between light, dark, or system themes for the console.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleThemeChange(opt.value)}
                      disabled={saving}
                      className={cn(
                        'flex flex-col items-center gap-3 rounded-lg border-2 p-5 transition-all hover:border-primary/50 disabled:opacity-50',
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-card hover:bg-accent'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className={cn('text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
                        {opt.label}
                      </span>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">System</span> follows your operating system
                  preference. The theme applies instantly and is saved to your account.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
