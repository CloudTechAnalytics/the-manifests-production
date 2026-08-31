'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  UserPlus,
  KeyRound,
  Loader2,
  Clock,
  X,
  Copy,
  Check,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { formatDate, formatDateTime, ORGANIZATION_STATUS_META, ORGANIZATION_ORIGIN_META } from '@/shared/lib/utils/status';
import {
  fetchOrganizationDetail,
  inviteOrganizationAdmin,
  createOrganizationAdmin,
  revokeInvitation,
  uploadOrganizationLogo,
} from '@/features/platform/services/organizations.service';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import type { Invitation } from '@/shared/types';

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Platform Admin',
  admin: 'Administrator',
  operations: 'Operations',
  sales: 'Sales',
  branch_manager: 'Branch Manager',
  finance: 'Finance',
  customs: 'Customs',
  planning: 'Planning',
  documentation: 'Documentation',
  terminal: 'Terminal',
  examination: 'Examination',
  warehouse: 'Warehouse',
  transport: 'Transport',
};

/** A random, readable temporary password — the admin is forced to change
 *  it on first sign-in (must_change_password), so it only needs to clear
 *  the 8-character minimum, not be memorable. */
function generateTempPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

export default function OrganizationDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = params.id as string;

  const { data: detail, isLoading: loading } = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => fetchOrganizationDetail(orgId),
    enabled: !!orgId,
  });

  const org = detail?.org ?? null;
  const members = detail?.members ?? [];
  const invites = detail?.invites ?? [];
  const subscription = detail?.subscription ?? null;

  useEffect(() => {
    if (!loading && detail === null) {
      toast.error('Organization not found');
      navigate('/platform/organizations', { replace: true });
    }
  }, [loading, detail, navigate]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteErrors, setInviteErrors] = useState<{ email?: string }>({});

  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);

  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [createAdminEmail, setCreateAdminEmail] = useState('');
  const [createAdminName, setCreateAdminName] = useState('');
  const [createAdminPassword, setCreateAdminPassword] = useState('');
  const [createAdminErrors, setCreateAdminErrors] = useState<{ email?: string; full_name?: string }>({});
  const [copied, setCopied] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);

  const invalidateOrgDetail = () => queryClient.invalidateQueries({ queryKey: ['organization', orgId] });

  const validateInvite = (): boolean => {
    const errs: { email?: string } = {};
    if (!inviteEmail.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      errs.email = 'Invalid email address';
    }
    setInviteErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteOrganizationAdmin({ orgId, email: inviteEmail.trim(), fullName: inviteName.trim() }),
    onSuccess: (result) => {
      toast.success(
        result.emailed
          ? `Invitation emailed to ${inviteEmail.trim()}`
          : `Invitation created. Email delivery isn't configured — share this link: ${result.link}`
      );
      invalidateOrgDetail();
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to send invitation'));
    },
  });

  const handleInviteAdmin = () => {
    if (!validateInvite()) return;
    inviteMutation.mutate();
  };

  const openCreateAdmin = () => {
    setCreateAdminEmail('');
    setCreateAdminName('');
    setCreateAdminPassword(generateTempPassword());
    setCreateAdminErrors({});
    setCopied(false);
    setCreateAdminOpen(true);
  };

  const validateCreateAdmin = (): boolean => {
    const errs: { email?: string; full_name?: string } = {};
    if (!createAdminEmail.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createAdminEmail.trim())) {
      errs.email = 'Invalid email address';
    }
    if (!createAdminName.trim()) errs.full_name = 'Full name is required';
    setCreateAdminErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const createAdminMutation = useMutation({
    mutationFn: () =>
      createOrganizationAdmin({
        orgId,
        email: createAdminEmail.trim(),
        fullName: createAdminName.trim(),
        password: createAdminPassword,
      }),
    onSuccess: () => {
      toast.success(`Admin account created for ${createAdminEmail.trim()}`);
      invalidateOrgDetail();
      setCreateAdminOpen(false);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to create admin account'));
    },
  });

  const handleCreateAdmin = () => {
    if (!validateCreateAdmin()) return;
    createAdminMutation.mutate();
  };

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(createAdminPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (!revokeTarget) throw new Error('Not ready');
      await revokeInvitation({ invitationId: revokeTarget.id, invitationEmail: revokeTarget.email, orgId });
    },
    onSuccess: () => {
      toast.success('Invitation revoked');
      invalidateOrgDetail();
      setRevokeTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to revoke invitation'));
    },
  });

  const handleRevoke = () => revokeMutation.mutate();

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      if (!org) throw new Error('Not ready');
      return uploadOrganizationLogo({ orgId, orgName: org.name, file });
    },
    onSuccess: () => {
      toast.success('Logo updated');
      invalidateOrgDetail();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to upload logo'));
    },
    onSettled: () => {
      if (logoInputRef.current) logoInputRef.current.value = '';
    },
  });

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG or SVG)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be 2 MB or smaller');
      return;
    }
    logoMutation.mutate(file);
  };

  const inviting = inviteMutation.isPending;
  const creatingAdmin = createAdminMutation.isPending;
  const revoking = revokeMutation.isPending;
  const uploadingLogo = logoMutation.isPending;

  if (loading || !org) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasAdmin = members.some((m) => m.role === 'admin');
  const orgMonogram =
    org.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/platform/organizations')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => handleLogoFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          disabled={uploadingLogo}
          title={org.logo_url ? 'Change logo' : 'Upload logo'}
          className="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted"
        >
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={`${org.name} logo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-serif text-lg font-bold text-muted-foreground">
              {orgMonogram}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {uploadingLogo ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Upload className="h-4 w-4 text-white" />
            )}
          </span>
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="page-title">{org.name}</h1>
            <Badge className={cn(ORGANIZATION_STATUS_META[org.status]?.color)}>
              {ORGANIZATION_STATUS_META[org.status]?.label ?? org.status}
            </Badge>
            <Badge className={cn(ORGANIZATION_ORIGIN_META[org.origin]?.color)}>
              {ORGANIZATION_ORIGIN_META[org.origin]?.label ?? org.origin}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {org.slug} · {org.logo_url ? 'Click the logo to change it' : 'Click the logo to upload one'}
          </p>
        </div>
        {!hasAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateAdmin}>
              <KeyRound className="mr-1.5 h-4 w-4" />
              Create Admin
            </Button>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Invite Admin
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{[org.city, org.country].filter(Boolean).join(', ') || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{org.phone || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{org.email || '—'}</span>
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Business Type</p>
            <p>{org.business_type ?? '—'}</p>
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Registration Number</p>
            <p>{org.registration_number ?? '—'}</p>
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Website</p>
            <p>{org.website ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Subscription &amp; Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="font-medium">{subscription.plan?.name ?? '—'}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-medium capitalize">{subscription.status}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">
                  {subscription.status === 'trial' ? 'Trial ends' : 'Started'}
                </p>
                <p className="font-medium">
                  {formatDate(subscription.status === 'trial' ? subscription.trial_ends_at : subscription.started_at)}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Users</p>
                <p className="font-medium">{members.length} / {subscription.plan?.max_users ?? 'Unlimited'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No subscription assigned yet — set one on{' '}
              <a href="/platform/subscriptions" className="font-medium underline">Subscriptions</a>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No members yet. Create or invite this organization&apos;s first admin above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[m.role] ?? m.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        )}
                      >
                        {m.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Invitations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invites.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[inv.role] ?? inv.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(inv.expires_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRevokeTarget(inv)}
                        aria-label="Revoke invitation"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteEmail('');
            setInviteName('');
            setInviteErrors({});
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Organization Admin</DialogTitle>
            <DialogDescription>
              We&apos;ll email a join link to set up {org.name}&apos;s first administrator
              account. The link expires in 7 days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="admin@acme-logistics.com"
              />
              {inviteErrors.email && (
                <p className="text-xs text-destructive">{inviteErrors.email}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full name (optional)</Label>
              <Input
                id="invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
              Cancel
            </Button>
            <Button onClick={handleInviteAdmin} disabled={inviting}>
              {inviting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createAdminOpen}
        onOpenChange={(open) => {
          setCreateAdminOpen(open);
          if (!open) setCreateAdminErrors({});
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization Admin</DialogTitle>
            <DialogDescription>
              Sets up {org.name}&apos;s first administrator with a temporary
              password. They&apos;ll be required to change it on first sign-in —
              share it with them directly, this won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-admin-email">Email</Label>
              <Input
                id="create-admin-email"
                type="email"
                value={createAdminEmail}
                onChange={(e) => setCreateAdminEmail(e.target.value)}
                placeholder="admin@acme-logistics.com"
              />
              {createAdminErrors.email && (
                <p className="text-xs text-destructive">{createAdminErrors.email}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-admin-name">Full name</Label>
              <Input
                id="create-admin-name"
                value={createAdminName}
                onChange={(e) => setCreateAdminName(e.target.value)}
              />
              {createAdminErrors.full_name && (
                <p className="text-xs text-destructive">{createAdminErrors.full_name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-admin-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input
                  id="create-admin-password"
                  value={createAdminPassword}
                  onChange={(e) => setCreateAdminPassword(e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPassword}
                  aria-label="Copy password"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateAdminOpen(false)}
              disabled={creatingAdmin}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateAdmin} disabled={creatingAdmin}>
              {creatingAdmin && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" />
              Revoke invitation?
            </DialogTitle>
            <DialogDescription>
              {revokeTarget?.email} will no longer be able to use this invitation
              link to join {org.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
