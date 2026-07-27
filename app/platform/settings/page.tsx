'use client';

import { useState } from 'react';
import { Bell, Palette, Sun, Moon, Monitor, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/theme-context';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserPreferences } from '@/types';

/*
 * Platform-console preferences.
 *
 * Preferences live in user_preferences keyed by user_id, so the platform
 * admin's theme and notification choices are their own row — entirely
 * separate from any organization's admin. Changing a company's settings
 * inside a tenant workspace can never move the platform admin's theme,
 * and vice versa. This page simply gives the platform admin the same
 * controls the tenant app already exposes under Settings → Preferences.
 */

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
        <h1 className="page-title">Preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your own console settings. These are saved to your account and are
          separate from any organization&apos;s settings.
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
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
