'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  FileText,
  Copy,
  Printer,
  MapPin,
  Calendar,
  User,
  Package,
  Loader2,
  Send,
  Check,
  X,
  Clock,
  MoreHorizontal,
  Plane,
  Ship,
  Truck,
  Train,
  Waypoints,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { adminForceDelete } from '@/lib/utils/admin-delete';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  QUOTATION_STATUS_META,
  formatDate,
  formatDateTime,
  formatCurrency,
} from '@/lib/utils/status';
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
  ShipmentType,
  Customer,
  Branch,
} from '@/types';

const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  air: 'Air',
  sea: 'Sea',
  road: 'Road',
  rail: 'Rail',
  multimodal: 'Multimodal',
};

const SHIPMENT_TYPE_ICONS: Record<ShipmentType, React.ComponentType<{ className?: string }>> = {
  air: Plane,
  sea: Ship,
  road: Truck,
  rail: Train,
  multimodal: Waypoints,
};

type QuotationDetail = Quotation & {
  customer: Customer | null;
  branch: Branch | null;
  items: QuotationItem[];
};

// Allowed status transitions
const STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft: ['sent'],
  sent: ['approved', 'rejected', 'draft'],
  approved: [],
  rejected: ['draft'],
  expired: ['draft'],
};

const STATUS_ACTION_LABELS: Record<
  QuotationStatus,
  { label: string; icon: React.ComponentType<{ className?: string }> }[]
> = {
  draft: [{ label: 'Mark as Sent', icon: Send }],
  sent: [
    { label: 'Approve', icon: Check },
    { label: 'Reject', icon: X },
    { label: 'Revert to Draft', icon: FileText },
  ],
  approved: [],
  rejected: [{ label: 'Revert to Draft', icon: FileText }],
  expired: [{ label: 'Revert to Draft', icon: FileText }],
};

const STATUS_ACTION_TARGETS: Record<
  QuotationStatus,
  { label: string; target: QuotationStatus }[]
> = {
  draft: [{ label: 'Mark as Sent', target: 'sent' }],
  sent: [
    { label: 'Approve', target: 'approved' },
    { label: 'Reject', target: 'rejected' },
    { label: 'Revert to Draft', target: 'draft' },
  ],
  approved: [],
  rejected: [{ label: 'Revert to Draft', target: 'draft' }],
  expired: [{ label: 'Revert to Draft', target: 'draft' }],
};

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, hasRole } = useAuth();

  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const quotationId = params.id;
  const isAdmin = profile?.role === 'admin';

  const loadData = useCallback(async () => {
    if (!quotationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select(
          '*, customer:customers(*), branch:branches(*), items:quotation_items(*)'
        )
        .eq('id', quotationId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        console.error('Error loading quotation:', error);
        setQuotation(null);
        return;
      }
      if (!data) {
        setQuotation(null);
        return;
      }

      // Sort items by created_at for stable ordering
      const q = data as QuotationDetail;
      q.items = (q.items ?? []).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setQuotation(q);
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (target: QuotationStatus) => {
    if (!quotation || !profile) return;
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('quotations')
        .update({
          status: target,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotationId);

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.status_changed',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Quotation ${quotation.quotation_number ?? ''} status changed from "${QUOTATION_STATUS_META[quotation.status].label}" to "${QUOTATION_STATUS_META[target].label}"`,
        metadata: {
          from: quotation.status,
          to: target,
          quotation_number: quotation.quotation_number,
        },
      });

      // Email the customer about the status change (best-effort — don't
      // block the status update if this fails)
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (session) {
          const emailResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-quotation-status-email`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              },
              body: JSON.stringify({ quotation_id: quotationId }),
            }
          );
          if (!emailResponse.ok) {
            const result = await emailResponse.json().catch(() => ({}));
            console.warn('Quotation email not sent:', result.error);
          }
        }
      } catch (emailErr) {
        console.warn('Quotation email request failed:', emailErr);
      }

      toast.success(`Quotation marked as ${QUOTATION_STATUS_META[target].label}`);
      loadData();
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update status');
      toast.error(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!quotation || !profile) return;
    setDeleting(true);
    try {
      if (hasRole('admin')) {
        const result = await adminForceDelete('quotation', quotationId);
        if (!result.success) throw new Error(result.error);
        toast.success('Quotation permanently deleted');
        router.push('/quotations');
        return;
      }

      const { error } = await supabase
        .from('quotations')
        .update({
          deleted_at: new Date().toISOString(),
          updated_by: profile.id,
        })
        .eq('id', quotationId);

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.deleted',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Deleted quotation ${quotation.quotation_number ?? ''}`,
        metadata: {
          quotation_number: quotation.quotation_number,
          customer_id: quotation.customer_id,
        },
      });

      toast.success('Quotation deleted');
      router.push('/quotations');
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to delete quotation');
      toast.error(message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!quotation || !profile?.id) return;
    setDuplicating(true);
    try {
      // 1. Clone the quotation (without quotation_number — auto-generated)
      const { data: newQuotation, error: quoteError } = await supabase
        .from('quotations')
        .insert({
          customer_id: quotation.customer_id,
          branch_id: quotation.branch_id,
          status: 'draft',
          shipment_type: quotation.shipment_type,
          origin: quotation.origin,
          destination: quotation.destination,
          valid_until: quotation.valid_until,
          subtotal: quotation.subtotal,
          tax_amount: quotation.tax_amount,
          total: quotation.total,
          currency: quotation.currency,
          notes: quotation.notes,
          terms: quotation.terms,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id')
        .single();

      if (quoteError || !newQuotation) {
        throw new Error(quoteError?.message ?? 'Failed to duplicate quotation');
      }

      const newId = newQuotation.id;

      // 2. Clone line items
      if (quotation.items && quotation.items.length > 0) {
        const itemsPayload = quotation.items.map((item) => ({
          quotation_id: newId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          total: item.total,
        }));

        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(itemsPayload);

        if (itemsError) {
          console.error('Items clone error:', itemsError);
          toast.warning('Quotation duplicated, but some items failed to copy.');
        }
      }

      // 3. Log activity
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.duplicated',
        entity_type: 'quotation',
        entity_id: newId,
        description: `Duplicated quotation ${quotation.quotation_number ?? ''}`,
        metadata: {
          source_quotation_id: quotationId,
          source_quotation_number: quotation.quotation_number,
          new_quotation_id: newId,
        },
      });

      toast.success('Quotation duplicated');
      router.push(`/quotations/${newId}`);
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to duplicate quotation');
      toast.error(message);
    } finally {
      setDuplicating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-1" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }

  // Not found
  if (!quotation) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Quotation not found</h2>
          <p className="text-sm text-muted-foreground">
            This quotation may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/quotations">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Quotations
          </Button>
        </Link>
      </div>
    );
  }

  const statusMeta = QUOTATION_STATUS_META[quotation.status];
  const ShipmentIcon = quotation.shipment_type
    ? SHIPMENT_TYPE_ICONS[quotation.shipment_type]
    : null;
  const availableActions = STATUS_ACTION_TARGETS[quotation.status] ?? [];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb className="no-print">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/quotations">Quotations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {quotation.quotation_number ?? 'Draft Quotation'}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/quotations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">
                {quotation.quotation_number ?? 'Draft Quotation'}
              </h1>
              <Badge variant="secondary" className={statusMeta.color}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {quotation.customer?.company_name ?? 'Unknown customer'}
              {quotation.branch && ` · ${quotation.branch.name} branch`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status change dropdown */}
          {availableActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={updatingStatus}>
                  {updatingStatus ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="mr-1.5 h-4 w-4" />
                  )}
                  Update Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableActions.map((action) => {
                  const icon = STATUS_ACTION_LABELS[quotation.status].find(
                    (a) => a.label === action.label
                  )?.icon;
                  const Icon = icon ?? FileText;
                  return (
                    <DropdownMenuItem
                      key={action.target}
                      onClick={() => handleStatusChange(action.target)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {action.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={duplicating}
          >
            {duplicating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" />
            )}
            Duplicate
          </Button>

          <Link href={`/quotations/${quotationId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete quotation?</DialogTitle>
                <DialogDescription>
                  {hasRole('admin') ? (
                    <>
                      This permanently deletes quotation{' '}
                      &quot;{quotation.quotation_number ?? 'Draft'}&quot; and its line
                      items. This cannot be undone.
                    </>
                  ) : (
                    <>
                      This will soft-delete quotation{' '}
                      &quot;{quotation.quotation_number ?? 'Draft'}&quot;. The record
                      is retained but hidden from lists. This action can be undone by
                      an admin.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Quotation Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <FileText className="h-4 w-4 text-blue-600" />
                Quotation Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                icon={FileText}
                label="Quotation Number"
                value={quotation.quotation_number}
              />
              <InfoRow
                icon={User}
                label="Customer"
                value={quotation.customer?.company_name ?? null}
              />
              {quotation.shipment_type && ShipmentIcon && (
                <InfoRow
                  icon={ShipmentIcon}
                  label="Shipment Type"
                  value={SHIPMENT_TYPE_LABELS[quotation.shipment_type]}
                />
              )}
              <InfoRow
                icon={MapPin}
                label="Origin"
                value={quotation.origin}
              />
              <InfoRow
                icon={MapPin}
                label="Destination"
                value={quotation.destination}
              />
              <InfoRow
                icon={Calendar}
                label="Valid Until"
                value={quotation.valid_until ? formatDate(quotation.valid_until) : null}
              />
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {formatDate(quotation.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium">
                  {formatDateTime(quotation.updated_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="no-print">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.notes ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {quotation.notes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No notes recorded.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Terms */}
          <Card className="no-print">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Terms &amp; Conditions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.terms ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {quotation.terms}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No terms specified.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Items + Summary */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Package className="h-4 w-4 text-blue-600" />
                Line Items
              </CardTitle>
              <CardDescription>
                Items included in this quotation.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {quotation.items.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No line items in this quotation.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Tax (%)</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotation.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(item.unit_price, quotation.currency)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.tax_rate}%
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.total, quotation.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader className="no-print">
              <CardTitle className="text-lg font-semibold">
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(quotation.subtotal, quotation.currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">
                  {formatCurrency(quotation.tax_amount, quotation.currency)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary">
                  {formatCurrency(quotation.total, quotation.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Print-only section: complete quotation for printing */}
          <div className="print-only hidden">
            <PrintQuotation quotation={quotation} />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Presentational helpers -----------------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          <p className="break-words text-sm font-medium">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

// --- Print layout ----------------------------------------------------------

function PrintQuotation({ quotation }: { quotation: QuotationDetail }) {
  const statusMeta = QUOTATION_STATUS_META[quotation.status];
  const ShipmentIcon = quotation.shipment_type
    ? SHIPMENT_TYPE_ICONS[quotation.shipment_type]
    : null;

  return (
    <div className="space-y-6">
      {/* Letterhead */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Ship className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-serif text-base font-bold leading-tight">
              {quotation.branch?.name ?? 'The Manifest'}
            </p>
            {quotation.branch?.address && (
              <p className="text-xs text-muted-foreground">{quotation.branch.address}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {[quotation.branch?.phone, quotation.branch?.email].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {/* Print header */}
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">QUOTATION</h1>
          <p className="text-sm text-muted-foreground">
            {quotation.quotation_number ?? 'Draft'}
          </p>
        </div>
        <div className="text-right">
          <Badge variant="secondary" className={statusMeta.color}>
            {statusMeta.label}
          </Badge>
          <p className="mt-2 text-xs text-muted-foreground">
            Issued: {formatDate(quotation.created_at)}
          </p>
          <p className="text-xs text-muted-foreground">
            Valid Until: {formatDate(quotation.valid_until)}
          </p>
        </div>
      </div>

      {/* Customer + Route */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Bill To
          </p>
          <p className="font-medium">
            {quotation.customer?.company_name ?? '—'}
          </p>
          {quotation.customer?.address && (
            <p className="text-muted-foreground">{quotation.customer.address}</p>
          )}
          <p className="text-muted-foreground">
            {[quotation.customer?.email, quotation.customer?.phone].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Shipment Details
          </p>
          {quotation.shipment_type && ShipmentIcon && (
            <p className="capitalize">
              {SHIPMENT_TYPE_LABELS[quotation.shipment_type]} Freight
            </p>
          )}
          <p>
            <span className="text-muted-foreground">From: </span>
            {quotation.origin ?? '—'}
          </p>
          <p>
            <span className="text-muted-foreground">To: </span>
            {quotation.destination ?? '—'}
          </p>
        </div>
      </div>

      {/* Items */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Tax (%)</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotation.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                {item.description}
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(item.unit_price, quotation.currency)}
              </TableCell>
              <TableCell className="text-right">{item.tax_rate}%</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(item.total, quotation.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Totals */}
      <div className="ml-auto w-64 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">
            {formatCurrency(quotation.subtotal, quotation.currency)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="font-medium">
            {formatCurrency(quotation.tax_amount, quotation.currency)}
          </span>
        </div>
        <Separator />
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span>{formatCurrency(quotation.total, quotation.currency)}</span>
        </div>
      </div>

      {/* Notes & Terms */}
      {(quotation.notes || quotation.terms) && (
        <div className="space-y-3 border-t border-border pt-4 text-sm">
          {quotation.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {quotation.notes}
              </p>
            </div>
          )}
          {quotation.terms && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Terms &amp; Conditions
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {quotation.terms}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
