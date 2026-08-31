'use client';

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Package,
  FileText,
  FolderOpen,
  Star,
  StickyNote,
  Loader2,
} from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { adminForceDelete } from '@/shared/lib/utils/admin-delete';
import { canDeleteOwnRecord } from '@/shared/lib/utils/ownership';
import { useAuth } from '@/shared/contexts/auth-context';
import { fetchCustomerDetail, softDeleteCustomer } from '@/features/customers/services/customers.service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
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
  DialogTrigger,
  DialogClose,
} from '@/shared/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import {
  CUSTOMER_STATUS_META,
  SHIPMENT_STATUS_META,
  QUOTATION_STATUS_META,
  formatDate,
  formatCurrency,
} from '@/shared/lib/utils/status';
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);

  const customerId = params.id!;

  const {
    data: detail,
    isLoading: loading,
  } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => fetchCustomerDetail(customerId),
    enabled: !!customerId,
  });

  const customer = detail?.customer ?? null;
  const contacts = detail?.contacts ?? [];
  const shipments = detail?.shipments ?? [];
  const quotations = detail?.quotations ?? [];
  const documents = detail?.documents ?? [];

  const canDelete =
    !!customer &&
    canDeleteOwnRecord({ hasRole });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!customer || !profile) throw new Error('Not ready');
      // Admins get a true permanent delete that cascades through
      // whatever's linked to this customer (quotations, shipments,
      // invoices, payments, shipment plans) — everyone else keeps the
      // ordinary reversible soft-delete below.
      if (hasRole('admin')) {
        const result = await adminForceDelete('customer', customerId);
        if (!result.success) throw new Error(result.error);
        return { permanent: true };
      }

      await softDeleteCustomer({
        customerId,
        updatedBy: profile.id,
        branchId: customer.branch_id,
        companyName: customer.company_name,
      });
      return { permanent: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      toast.success(
        result.permanent ? 'Customer permanently deleted' : 'Customer deleted'
      );
      navigate('/customers');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to delete customer');
      toast.error(message);
    },
    onSettled: () => {
      setDeleteOpen(false);
    },
  });

  const deleting = deleteMutation.isPending;
  const handleDelete = () => deleteMutation.mutate();

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
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Customer not found</h2>
          <p className="text-sm text-muted-foreground">
            This customer may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link to="/customers">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  const statusMeta = CUSTOMER_STATUS_META[customer.status] ?? {
    label: customer.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };
  const primaryContact = contacts.find((c) => c.is_primary);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/customers">Customers</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{customer.company_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/customers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">
                {customer.company_name}
              </h1>
              <Badge variant="secondary" className={statusMeta.color}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="capitalize">{customer.type}</span> customer
              {customer.branch && ` · ${customer.branch.name} branch`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/customers/${customerId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
          {canDelete && (
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
                  <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete customer?</DialogTitle>
                  <DialogDescription>
                    {hasRole('admin') ? (
                      <>
                        This permanently deletes &quot;{customer.company_name}&quot;
                        and everything linked to it — quotations, shipments,
                        invoices, and payments. This cannot be undone.
                      </>
                    ) : (
                      <>
                        This will soft-delete &quot;{customer.company_name}&quot;.
                        The record is retained but hidden from lists. This action
                        can be undone by an admin.
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
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Customer Info + Notes */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Building2 className="h-4 w-4 text-blue-600" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                icon={Mail}
                label="Email"
                value={customer.email}
              />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={customer.phone}
              />
              <InfoRow
                icon={MapPin}
                label="Address"
                value={
                  [customer.address, customer.city, customer.country]
                    .filter(Boolean)
                    .join(', ') || null
                }
              />
              <InfoRow
                icon={Globe}
                label="Website"
                value={customer.website}
                href={customer.website ? toAbsoluteUrl(customer.website) : undefined}
              />
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {formatDate(customer.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium">
                  {formatDate(customer.updated_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <StickyNote className="h-4 w-4 text-amber-500" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customer.notes ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {customer.notes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No notes recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Contacts + Tabs */}
        <div className="space-y-6 lg:col-span-2">
          {/* Contacts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Contacts
              </CardTitle>
              <CardDescription>
                People associated with this customer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No contacts on record.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {contacts.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.title && (
                            <p className="text-xs text-muted-foreground">
                              {c.title}
                            </p>
                          )}
                        </div>
                        {c.is_primary && (
                          <Badge
                            variant="secondary"
                            className="bg-blue-50 text-blue-700"
                          >
                            <Star className="mr-1 h-3 w-3" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      {(c.email || c.phone) && (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {c.email && (
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </div>
                          )}
                          {c.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs: Shipments / Quotations / Documents */}
          <Tabs defaultValue="shipments">
            <TabsList>
              <TabsTrigger value="shipments" className="gap-1.5">
                <Package className="h-4 w-4" />
                Shipments
              </TabsTrigger>
              <TabsTrigger value="quotations" className="gap-1.5">
                <FileText className="h-4 w-4" />
                Quotations
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5">
                <FolderOpen className="h-4 w-4" />
                Documents
              </TabsTrigger>
            </TabsList>

            {/* Shipments */}
            <TabsContent value="shipments">
              <Card>
                <CardContent className="p-0">
                  {shipments.length === 0 ? (
                    <EmptyTab text="No shipments for this customer yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipments.map((s) => {
                          const meta = SHIPMENT_STATUS_META[s.status] ?? {
                            label: s.status ?? 'Unknown',
                            color: 'bg-muted text-muted-foreground',
                            step: -1,
                          };
                          return (
                            <TableRow
                              key={s.id}
                              className="cursor-pointer transition-colors hover:bg-accent/60"
                              onClick={() => navigate(`/shipments/${s.id}`)}
                            >
                              <TableCell className="font-medium">
                                {s.reference_number ?? '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {s.origin ?? '—'} → {s.destination ?? '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={`text-[11px] ${meta.color}`}
                                >
                                  {meta.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(s.created_at)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Quotations */}
            <TabsContent value="quotations">
              <Card>
                <CardContent className="p-0">
                  {quotations.length === 0 ? (
                    <EmptyTab text="No quotations for this customer yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Number</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotations.map((q) => {
                          const meta = QUOTATION_STATUS_META[q.status] ?? {
                            label: q.status ?? 'Unknown',
                            color: 'bg-muted text-muted-foreground',
                          };
                          return (
                            <TableRow
                              key={q.id}
                              className="cursor-pointer transition-colors hover:bg-accent/60"
                              onClick={() => navigate(`/quotations/${q.id}`)}
                            >
                              <TableCell className="font-medium">
                                {q.quotation_number ?? '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={`text-[11px] ${meta.color}`}
                                >
                                  {meta.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatCurrency(q.total, q.currency)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(q.created_at)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Documents */}
            <TabsContent value="documents">
              <Card>
                <CardContent className="p-0">
                  {documents.length === 0 ? (
                    <EmptyTab text="No documents for this customer yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">
                              {d.name}
                            </TableCell>
                            <TableCell className="capitalize text-muted-foreground">
                              {d.category.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {d.file_size
                                ? `${(d.file_size / 1024).toFixed(1)} KB`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(d.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// --- Small presentational helpers ----------------------------------------

// The website field's validation accepts values with no protocol (e.g.
// "acme.com"), so an href built straight from it would resolve as a
// relative link within the app instead of navigating out.
function toAbsoluteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm font-medium text-blue-600 hover:underline"
            >
              {value}
            </a>
          ) : (
            <p className="break-words text-sm font-medium">{value}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
