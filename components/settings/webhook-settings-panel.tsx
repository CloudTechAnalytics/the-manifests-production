'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, Pencil, Plus, Trash2, Webhook } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useBranchSelector } from '@/hooks/use-branch-selector';
import { BranchSelectField } from '@/components/shared/branch-select-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type { WebhookSubscription } from '@/types';

const EVENT_TYPES = [
  'shipment.status_changed',
  'shipment.created',
  'customs.status_changed',
  'invoice.paid',
];

function generateSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function WebhookSettingsPanel() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ existing: WebhookSubscription | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('webhook_subscriptions')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data as WebhookSubscription[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!profile) return;
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('webhook_subscriptions')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      toast.success('Webhook removed');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove webhook'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Webhook className="h-4 w-4 text-primary" />
            Webhook Subscriptions
          </CardTitle>
          <CardDescription>
            Send shipment events to your own systems. Point an endpoint here and verify each
            request&apos;s <code className="rounded bg-muted px-1 py-0.5 text-xs">X-Signature</code>{' '}
            header using the signing secret below.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialog({ existing: null })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Endpoint
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No webhook endpoints registered yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{r.name}</p>
                      <Badge variant={r.is_active ? 'default' : 'outline'}>
                        {r.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.target_url}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.event_types.map((e) => (
                        <Badge key={e} variant="outline" className="text-[10px]">
                          {e}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setDialog({ existing: r })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={deletingId === r.id}
                      onClick={() => handleDelete(r.id)}
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Registering an endpoint here stores it — actually delivering events to it also requires a
          Database Webhook configured once in the Supabase dashboard (Database → Webhooks) pointing
          at the <code className="rounded bg-muted px-1 py-0.5">dispatch-webhook</code> edge function.
          Ask your engineering contact to complete that one-time setup.
        </p>
      </CardContent>

      {dialog && (
        <WebhookFormDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          existing={dialog.existing}
          onSaved={load}
        />
      )}
    </Card>
  );
}

function WebhookFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: WebhookSubscription | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const {
    needsSelection: needsBranchSelection,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    branchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>(['shipment.status_changed']);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setTargetUrl(existing?.target_url ?? '');
    setSecret(existing?.signing_secret ?? generateSecret());
    setEventTypes(existing?.event_types ?? ['shipment.status_changed']);
    setIsActive(existing?.is_active ?? true);
  }, [open, existing]);

  const toggleEvent = (event: string) => {
    setEventTypes((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSubmit = async () => {
    if (!profile || !name.trim() || !targetUrl.trim() || eventTypes.length === 0) return;
    if (!existing && !branchId) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        target_url: targetUrl.trim(),
        signing_secret: secret,
        event_types: eventTypes,
        is_active: isActive,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase.from('webhook_subscriptions').update(payload).eq('id', existing.id);
        if (error) throw error;
        toast.success('Webhook updated');
      } else {
        const { error } = await supabase
          .from('webhook_subscriptions')
          .insert({ ...payload, branch_id: branchId, created_by: profile.id });
        if (error) throw error;
        toast.success('Webhook added');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save webhook'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Webhook' : 'Add Webhook Endpoint'}</DialogTitle>
          <DialogDescription>Your system&apos;s endpoint will receive a signed POST per event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!existing && needsBranchSelection && (
            <BranchSelectField
              branches={branches}
              value={selectedBranchId}
              onChange={setSelectedBranchId}
              loading={branchesLoading}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Name</Label>
            <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Our ERP" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">Target URL</Label>
            <Input
              id="wh-url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://your-system.example.com/webhooks/manifest"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Signing Secret</Label>
            <div className="flex gap-1.5">
              <Input readOnly value={secret} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                  toast.success('Secret copied');
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to sign the <code className="rounded bg-muted px-1 py-0.5">X-Signature</code> header
              (HMAC-SHA256) on every delivery, so your endpoint can verify the request came from us.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Events</Label>
            <div className="space-y-1.5">
              {EVENT_TYPES.map((event) => (
                <div key={event} className="flex items-center gap-2">
                  <Checkbox
                    id={`wh-event-${event}`}
                    checked={eventTypes.includes(event)}
                    onCheckedChange={() => toggleEvent(event)}
                  />
                  <Label htmlFor={`wh-event-${event}`} className="font-normal">
                    {event}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="wh-active" checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
            <Label htmlFor="wh-active" className="font-normal">
              Active
            </Label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !name.trim() ||
              !targetUrl.trim() ||
              eventTypes.length === 0 ||
              (!existing && !branchId)
            }
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Add Endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
