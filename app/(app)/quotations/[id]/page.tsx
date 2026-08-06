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
  MoreHorizontal,
  Plane,
  Ship,
  Truck,
  Train,
  Waypoints,
  ArrowRightLeft,
  ShieldCheck,
  Weight,
  Boxes,
  Ban,
  Archive,
  Eye,
  Download,
  Mail,
  GitBranch,
  AlertTriangle,
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  QUOTATION_STATUS_META,
  formatDate,
  formatDateTime,
  formatCurrency,
} from '@/lib/utils/status';
import {
  QUOTATION_SERVICES,
  paymentTermsLabel,
  paymentMethodLabel,
} from '@/lib/quotation-constants';
import { computeApprovalReason, type QuotationTotals } from '@/lib/quotation-schema';
import { ConvertToShipmentDialog } from '@/components/quotations/convert-to-shipment-dialog';
import { QuotationAttachmentsPanel } from '@/components/quotations/quotation-attachments-panel';
import { VersionHistoryCard } from '@/components/quotations/version-history-card';
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
  ShipmentType,
  Customer,
  Branch,
  Profile,
  Organization,
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

const CARGO_TYPE_LABELS: Record<string, string> = {
  fcl: 'FCL',
  lcl: 'LCL',
  roro: 'RoRo',
  break_bulk: 'Break Bulk',
};

type QuotationDetail = Quotation & {
  customer: Customer | null;
  branch: Branch | null;
  items: QuotationItem[];
  sales_rep: Profile | null;
  requested_by_user: Profile | null;
  approved_by_user: Profile | null;
};

interface StatusAction {
  label: string;
  target: QuotationStatus;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Section 9/10 — the workflow + approval action set for the status
 * currently on the record. Draft's own next step branches on the
 * org's approval_required setting: with it on, draft can only ask for
 * approval, never jump straight to Sent. Approving/rejecting a
 * pending_approval quotation additionally requires canApprove.
 */
function getStatusActions(
  status: QuotationStatus,
  approvalRequired: boolean,
  canApprove: boolean
): StatusAction[] {
  const cancelAction: StatusAction = { label: 'Cancel Quotation', target: 'cancelled', icon: Ban };

  switch (status) {
    case 'draft':
      return [
        approvalRequired
          ? { label: 'Submit for Approval', target: 'pending_approval', icon: Send }
          : { label: 'Mark as Sent', target: 'sent', icon: Send },
        cancelAction,
      ];
    case 'pending_approval':
      return canApprove
        ? [
            { label: 'Approve', target: 'approved', icon: Check },
            { label: 'Reject', target: 'rejected', icon: X },
            cancelAction,
          ]
        : [cancelAction];
    case 'approved':
      return [{ label: 'Mark as Sent', target: 'sent', icon: Send }, cancelAction];
    case 'sent':
      return [
        { label: 'Mark as Accepted', target: 'accepted', icon: Check },
        { label: 'Mark as Rejected', target: 'rejected', icon: X },
        { label: 'Revert to Draft', target: 'draft', icon: FileText },
        cancelAction,
      ];
    case 'accepted':
      return [];
    case 'rejected':
    case 'expired':
    case 'archived':
    case 'cancelled':
      return [{ label: 'Revert to Draft', target: 'draft', icon: FileText }];
    default:
      return [];
  }
}

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, hasRole } = useAuth();

  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [organization, setOrganization] = useState<Pick<
    Organization,
    'name' | 'logo_url' | 'quotation_approval_required' | 'quotation_discount_threshold_percent' | 'quotation_amount_threshold'
  > | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  // Reject and Cancel share one dialog — both are "terminal-ish" actions
  // that ask for an optional reason before applying.
  const [terminalActionTarget, setTerminalActionTarget] = useState<'rejected' | 'cancelled' | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const quotationId = params.id;
  const isAdmin = profile?.role === 'admin';
  const approvalRequired = organization?.quotation_approval_required ?? false;
  const totals: QuotationTotals = quotation
    ? {
        subtotal: quotation.subtotal,
        discountAmount: quotation.items.reduce(
          (sum, i) => sum + i.quantity * i.unit_price * (i.discount_rate / 100),
          0
        ),
        taxAmount: quotation.tax_amount,
        total: quotation.total,
      }
    : { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 };
  const approvalReason = organization ? computeApprovalReason(totals, organization) : null;
  const canApprove = hasRole('branch_manager') || (hasRole('admin') && !approvalReason);

  const loadData = useCallback(async () => {
    if (!quotationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select(
          `*, customer:customers(*), branch:branches(*), items:quotation_items(*),
           sales_rep:profiles!quotations_sales_rep_id_fkey(id, full_name),
           requested_by_user:profiles!quotations_requested_by_fkey(id, full_name),
           approved_by_user:profiles!quotations_approved_by_fkey(id, full_name),
           sent_by_user:profiles!quotations_sent_by_fkey(id, full_name)`
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

      const q = data as QuotationDetail;
      q.items = (q.items ?? []).filter((i) => !i.deleted_at).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setQuotation(q);
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Section 9 gating: whether Draft can go straight to Sent, or must pass
  // through Pending Approval / Approved first — plus the discount/amount
  // thresholds that force Branch Manager approval regardless, and the
  // org name/logo the PDF needs.
  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from('organizations')
      .select('name, logo_url, quotation_approval_required, quotation_discount_threshold_percent, quotation_amount_threshold')
      .eq('id', profile.organization_id)
      .maybeSingle()
      .then(({ data }) => setOrganization(data ?? null));
  }, [profile?.organization_id]);

  // Log a view once per browser session per quotation — not every render.
  useEffect(() => {
    if (!quotation || !profile) return;
    const key = `quotation-viewed-${quotation.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    supabase.from('activities').insert({
      user_id: profile.id,
      branch_id: quotation.branch_id,
      action: 'quotation.viewed',
      entity_type: 'quotation',
      entity_id: quotation.id,
      description: `Viewed quotation ${quotation.quotation_number ?? ''}`,
    });
  }, [quotation, profile]);

  const handleStatusChange = async (target: QuotationStatus, notes?: string) => {
    if (!quotation || !profile) return;
    setUpdatingStatus(true);
    try {
      const updatePayload: Record<string, unknown> = {
        status: target,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      };
      if (target === 'approved') {
        updatePayload.approved_by = profile.id;
        updatePayload.approval_date = new Date().toISOString();
        if (notes) updatePayload.approval_notes = notes;
      }
      if (target === 'sent') {
        updatePayload.sent_by = profile.id;
        updatePayload.sent_at = new Date().toISOString();
      }
      if ((target === 'rejected' || target === 'cancelled') && notes) {
        updatePayload.approval_notes = notes;
      }

      const { error } = await supabase.from('quotations').update(updatePayload).eq('id', quotationId);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.status_changed',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Quotation ${quotation.quotation_number ?? ''} status changed from "${QUOTATION_STATUS_META[quotation.status].label}" to "${QUOTATION_STATUS_META[target].label}"`,
        metadata: { from: quotation.status, to: target, quotation_number: quotation.quotation_number },
      });

      // Email the customer about the status change (best-effort — don't
      // block the status update if this fails), with the quotation PDF
      // attached so every status email carries the document.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (session) {
          let pdfPayload: { pdf_base64?: string; pdf_filename?: string } = {};
          try {
            // Dynamically imported — @react-pdf/renderer is large and
            // otherwise gets bundled into every visit to this page.
            const { buildQuotationPdfData, renderQuotationPdfBlob, blobToBase64 } = await import(
              '@/lib/pdf/generate-quotation-pdf'
            );
            const pdfData = await buildQuotationPdfData(quotation, organization);
            const blob = await renderQuotationPdfBlob(pdfData);
            pdfPayload = {
              pdf_base64: await blobToBase64(blob),
              pdf_filename: `${quotation.quotation_number ?? 'quotation'}.pdf`,
            };
          } catch (pdfErr) {
            console.warn('PDF generation for status email failed:', pdfErr);
          }

          const emailResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-quotation-status-email`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              },
              body: JSON.stringify({ quotation_id: quotationId, ...pdfPayload }),
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
      setTerminalActionTarget(null);
      setApprovalNotes('');
      loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update status'));
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
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', quotationId);

      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.deleted',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Deleted quotation ${quotation.quotation_number ?? ''}`,
        metadata: { quotation_number: quotation.quotation_number, customer_id: quotation.customer_id },
      });

      toast.success('Quotation deleted');
      router.push('/quotations');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete quotation'));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!quotation || !profile?.id) return;
    setDuplicating(true);
    try {
      const { data: newQuotation, error: quoteError } = await supabase
        .from('quotations')
        .insert({
          customer_id: quotation.customer_id,
          branch_id: quotation.branch_id,
          status: 'draft',
          contact_person: quotation.contact_person,
          contact_email: quotation.contact_email,
          contact_phone: quotation.contact_phone,
          sales_rep_id: quotation.sales_rep_id,
          shipment_direction: quotation.shipment_direction,
          shipment_type: quotation.shipment_type,
          cargo_type: quotation.cargo_type,
          incoterm: quotation.incoterm,
          origin: quotation.origin,
          destination: quotation.destination,
          origin_country: quotation.origin_country,
          origin_port: quotation.origin_port,
          destination_country: quotation.destination_country,
          destination_port: quotation.destination_port,
          expected_shipping_date: quotation.expected_shipping_date,
          expected_arrival_date: quotation.expected_arrival_date,
          commodity_description: quotation.commodity_description,
          hs_code: quotation.hs_code,
          container_count: quotation.container_count,
          container_size: quotation.container_size,
          weight: quotation.weight,
          weight_unit: quotation.weight_unit,
          cbm: quotation.cbm,
          packages_count: quotation.packages_count,
          package_type: quotation.package_type,
          dangerous_cargo: quotation.dangerous_cargo,
          temperature_controlled: quotation.temperature_controlled,
          insurance_required: quotation.insurance_required,
          cargo_value: quotation.cargo_value,
          services: quotation.services,
          excluded_services: quotation.excluded_services,
          payment_terms: quotation.payment_terms,
          payment_method: quotation.payment_method,
          required_documents: quotation.required_documents,
          priority: quotation.priority,
          valid_until: quotation.valid_until,
          subtotal: quotation.subtotal,
          tax_amount: quotation.tax_amount,
          total: quotation.total,
          currency: quotation.currency,
          notes: quotation.notes,
          customer_notes: quotation.customer_notes,
          terms: quotation.terms,
          requested_by: profile.id,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id')
        .single();

      if (quoteError || !newQuotation) {
        throw new Error(quoteError?.message ?? 'Failed to duplicate quotation');
      }

      const newId = newQuotation.id;

      if (quotation.items && quotation.items.length > 0) {
        const itemsPayload = quotation.items.map((item, index) => ({
          quotation_id: newId,
          service_key: item.service_key,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_rate: item.discount_rate,
          tax_rate: item.tax_rate,
          unit: item.unit,
          notes: item.notes,
          billing_basis: item.billing_basis,
          cost_centre: item.cost_centre,
          gl_account: item.gl_account,
          internal_reference: item.internal_reference,
          tax_code: item.tax_code,
          sort_order: index,
          total: item.total,
        }));

        const { error: itemsError } = await supabase.from('quotation_items').insert(itemsPayload);
        if (itemsError) {
          console.error('Items clone error:', itemsError);
          toast.warning('Quotation duplicated, but some charges failed to copy.');
        }
      }

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
      toast.error(getErrorMessage(err, 'Failed to duplicate quotation'));
    } finally {
      setDuplicating(false);
    }
  };

  /**
   * "Create New Version" — an edited revision of THIS deal, not a fresh
   * unrelated quotation (that's what Duplicate is for). Clones quotation
   * + items same as Duplicate, but links back via parent/root/version and
   * flips the source row to no-longer-latest, then goes straight to the
   * new version's edit form since the whole point is to change something.
   */
  const handleCreateVersion = async () => {
    if (!quotation || !profile?.id) return;
    setCreatingVersion(true);
    try {
      const rootId = quotation.root_quotation_id ?? quotation.id;

      const { data: newQuotation, error: quoteError } = await supabase
        .from('quotations')
        .insert({
          customer_id: quotation.customer_id,
          branch_id: quotation.branch_id,
          status: 'draft',
          parent_quotation_id: quotation.id,
          root_quotation_id: rootId,
          version: quotation.version + 1,
          is_latest_version: true,
          contact_person: quotation.contact_person,
          contact_email: quotation.contact_email,
          contact_phone: quotation.contact_phone,
          sales_rep_id: quotation.sales_rep_id,
          shipment_direction: quotation.shipment_direction,
          shipment_type: quotation.shipment_type,
          cargo_type: quotation.cargo_type,
          incoterm: quotation.incoterm,
          origin: quotation.origin,
          destination: quotation.destination,
          origin_country: quotation.origin_country,
          origin_port: quotation.origin_port,
          destination_country: quotation.destination_country,
          destination_port: quotation.destination_port,
          expected_shipping_date: quotation.expected_shipping_date,
          expected_arrival_date: quotation.expected_arrival_date,
          commodity_description: quotation.commodity_description,
          hs_code: quotation.hs_code,
          container_count: quotation.container_count,
          container_size: quotation.container_size,
          weight: quotation.weight,
          weight_unit: quotation.weight_unit,
          cbm: quotation.cbm,
          packages_count: quotation.packages_count,
          package_type: quotation.package_type,
          dangerous_cargo: quotation.dangerous_cargo,
          temperature_controlled: quotation.temperature_controlled,
          insurance_required: quotation.insurance_required,
          cargo_value: quotation.cargo_value,
          services: quotation.services,
          excluded_services: quotation.excluded_services,
          payment_terms: quotation.payment_terms,
          payment_method: quotation.payment_method,
          required_documents: quotation.required_documents,
          priority: quotation.priority,
          valid_until: quotation.valid_until,
          subtotal: quotation.subtotal,
          tax_amount: quotation.tax_amount,
          total: quotation.total,
          currency: quotation.currency,
          notes: quotation.notes,
          customer_notes: quotation.customer_notes,
          terms: quotation.terms,
          requested_by: profile.id,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id')
        .single();

      if (quoteError || !newQuotation) {
        throw new Error(quoteError?.message ?? 'Failed to create new version');
      }

      const newId = newQuotation.id;

      if (quotation.items && quotation.items.length > 0) {
        const itemsPayload = quotation.items.map((item, index) => ({
          quotation_id: newId,
          service_key: item.service_key,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_rate: item.discount_rate,
          tax_rate: item.tax_rate,
          unit: item.unit,
          notes: item.notes,
          billing_basis: item.billing_basis,
          cost_centre: item.cost_centre,
          gl_account: item.gl_account,
          internal_reference: item.internal_reference,
          tax_code: item.tax_code,
          sort_order: index,
          total: item.total,
        }));
        const { error: itemsError } = await supabase.from('quotation_items').insert(itemsPayload);
        if (itemsError) {
          console.error('Items clone error:', itemsError);
          toast.warning('New version created, but some charges failed to copy.');
        }
      }

      const { error: flipError } = await supabase
        .from('quotations')
        .update({ is_latest_version: false, updated_by: profile.id })
        .eq('id', quotation.id);
      if (flipError) console.error('Failed to flip previous version:', flipError);

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.version_created',
        entity_type: 'quotation',
        entity_id: newId,
        description: `Created version ${quotation.version + 1} of quotation ${quotation.quotation_number ?? ''}`,
        metadata: { source_quotation_id: quotationId, new_quotation_id: newId, version: quotation.version + 1 },
      });

      toast.success(`Version ${quotation.version + 1} created`);
      router.push(`/quotations/${newId}/edit`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create new version'));
    } finally {
      setCreatingVersion(false);
    }
  };

  const handlePrint = () => window.print();

  const buildPdfBlob = async () => {
    if (!quotation) return null;
    setGeneratingPdf(true);
    try {
      const { buildQuotationPdfData, renderQuotationPdfBlob } = await import('@/lib/pdf/generate-quotation-pdf');
      const data = await buildQuotationPdfData(quotation, organization);
      return await renderQuotationPdfBlob(data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to generate PDF'));
      return null;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePreviewPdf = async () => {
    const blob = await buildPdfBlob();
    if (!blob) return;
    setPreviewUrl(URL.createObjectURL(blob));
    setPreviewOpen(true);
  };

  const handleDownloadPdf = async () => {
    if (!quotation || !profile) return;
    setDownloadingPdf(true);
    try {
      const blob = await buildPdfBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quotation.quotation_number ?? 'quotation'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.pdf_downloaded',
        entity_type: 'quotation',
        entity_id: quotation.id,
        description: `Downloaded PDF for quotation ${quotation.quotation_number ?? ''}`,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSendToCustomer = async () => {
    if (!quotation || !profile) return;
    if (!quotation.customer?.email) {
      toast.error('This customer has no email on file.');
      return;
    }
    setSendingEmail(true);
    try {
      const blob = await buildPdfBlob();
      if (!blob) return;
      const { blobToBase64 } = await import('@/lib/pdf/generate-quotation-pdf');
      const pdfBase64 = await blobToBase64(blob);

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-quotation-status-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            quotation_id: quotationId,
            pdf_base64: pdfBase64,
            pdf_filename: `${quotation.quotation_number ?? 'quotation'}.pdf`,
          }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? `Request failed (${response.status})`);
      }

      toast.success(`Quotation sent to ${quotation.customer.email}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send quotation'));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await handleStatusChange('archived');
    } finally {
      setArchiving(false);
    }
  };

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
  const ShipmentIcon = quotation.shipment_type ? SHIPMENT_TYPE_ICONS[quotation.shipment_type] : null;
  const availableActions = getStatusActions(quotation.status, approvalRequired, canApprove);
  const canConvert = quotation.status === 'accepted' && !quotation.converted_shipment_id;
  const canEditInPlace =
    quotation.is_latest_version && ['draft', 'pending_approval'].includes(quotation.status);
  const canCreateVersion =
    quotation.is_latest_version &&
    ['sent', 'approved', 'accepted', 'rejected', 'expired'].includes(quotation.status) &&
    !quotation.converted_shipment_id;
  const isVersioned = quotation.version > 1 || !!quotation.root_quotation_id;
  const canArchive = ['accepted', 'rejected', 'expired', 'cancelled'].includes(quotation.status);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <Breadcrumb className="no-print">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/quotations">Quotations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{quotation.quotation_number ?? 'Draft Quotation'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="no-print sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-background pb-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/quotations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">{quotation.quotation_number ?? 'Draft Quotation'}</h1>
              <Badge variant="secondary" className={statusMeta.color}>
                {statusMeta.label}
              </Badge>
              {isVersioned && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <GitBranch className="h-3 w-3" />
                  V{quotation.version}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {quotation.customer?.company_name ?? 'Unknown customer'}
              {quotation.branch && ` · ${quotation.branch.name} branch`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canConvert && (
            <Button size="sm" onClick={() => setConvertOpen(true)}>
              <ArrowRightLeft className="mr-1.5 h-4 w-4" />
              Convert to Shipment
            </Button>
          )}
          {quotation.converted_shipment_id && (
            <Link href={`/shipments/${quotation.converted_shipment_id}`}>
              <Button variant="outline" size="sm">
                <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                View Shipment
              </Button>
            </Link>
          )}

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
                {availableActions.map((action) => (
                  <DropdownMenuItem
                    key={action.target}
                    onClick={() =>
                      action.target === 'rejected' || action.target === 'cancelled'
                        ? setTerminalActionTarget(action.target)
                        : handleStatusChange(action.target)
                    }
                  >
                    <action.icon className="mr-2 h-4 w-4" />
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="outline" size="sm" onClick={handlePreviewPdf} disabled={generatingPdf}>
            {generatingPdf ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
            Preview PDF
          </Button>

          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf || generatingPdf}>
            {downloadingPdf ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Download PDF
          </Button>

          {quotation.status !== 'draft' && quotation.status !== 'accepted' && (
            <Button variant="outline" size="sm" onClick={handleSendToCustomer} disabled={sendingEmail || generatingPdf}>
              {sendingEmail ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
              Send to Customer
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>

          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
            {duplicating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" />
            )}
            Duplicate
          </Button>

          {canEditInPlace && (
            <Link href={`/quotations/${quotationId}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}

          {canCreateVersion && (
            <Button variant="outline" size="sm" onClick={handleCreateVersion} disabled={creatingVersion}>
              {creatingVersion ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <GitBranch className="mr-1.5 h-4 w-4" />
              )}
              Create New Version
            </Button>
          )}

          {canArchive && (
            <Button variant="outline" size="sm" onClick={handleArchive} disabled={archiving}>
              {archiving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Archive className="mr-1.5 h-4 w-4" />}
              Archive
            </Button>
          )}

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
                <DialogTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-red-600" />
                  Delete quotation?
                </DialogTitle>
                <DialogDescription>
                  {hasRole('admin') ? (
                    <>
                      This permanently deletes quotation &quot;{quotation.quotation_number ?? 'Draft'}
                      &quot; and its charges. This cannot be undone.
                    </>
                  ) : (
                    <>
                      This will soft-delete quotation &quot;{quotation.quotation_number ?? 'Draft'}
                      &quot;. The record is retained but hidden from lists. This action can be undone
                      by an admin.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <FileText className="h-4 w-4 text-blue-600" />
                Quotation Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={FileText} label="Quotation Number" value={quotation.quotation_number} />
              <InfoRow icon={User} label="Customer" value={quotation.customer?.company_name ?? null} />
              <InfoRow icon={User} label="Sales Representative" value={quotation.sales_rep?.full_name ?? null} />
              <InfoRow
                icon={User}
                label="Direction / Type"
                value={
                  [
                    quotation.shipment_direction
                      ? quotation.shipment_direction[0].toUpperCase() + quotation.shipment_direction.slice(1)
                      : null,
                    quotation.cargo_type ? CARGO_TYPE_LABELS[quotation.cargo_type] : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || null
                }
              />
              {quotation.shipment_type && ShipmentIcon && (
                <InfoRow icon={ShipmentIcon} label="Transport Mode" value={SHIPMENT_TYPE_LABELS[quotation.shipment_type]} />
              )}
              <InfoRow icon={FileText} label="Incoterm" value={quotation.incoterm} />
              <InfoRow icon={MapPin} label="Origin" value={quotation.origin_port ?? quotation.origin} />
              <InfoRow icon={MapPin} label="Destination" value={quotation.destination_port ?? quotation.destination} />
              <InfoRow
                icon={Calendar}
                label="Expected Shipping / Arrival"
                value={
                  quotation.expected_shipping_date || quotation.expected_arrival_date
                    ? `${quotation.expected_shipping_date ? formatDate(quotation.expected_shipping_date) : '—'} → ${quotation.expected_arrival_date ? formatDate(quotation.expected_arrival_date) : '—'}`
                    : null
                }
              />
              <InfoRow icon={Calendar} label="Valid Until" value={quotation.valid_until ? formatDate(quotation.valid_until) : null} />
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{formatDate(quotation.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium">{formatDateTime(quotation.updated_at)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Cargo Information */}
          <Card className="no-print">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Boxes className="h-4 w-4 text-blue-600" />
                Cargo Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={Package} label="Commodity" value={quotation.commodity_description} />
              <InfoRow icon={FileText} label="HS Code" value={quotation.hs_code} />
              <InfoRow
                icon={Boxes}
                label="Containers"
                value={quotation.container_count ? `${quotation.container_count} × ${quotation.container_size ?? '—'}` : null}
              />
              <InfoRow
                icon={Weight}
                label="Weight"
                value={quotation.weight ? `${quotation.weight} ${quotation.weight_unit}` : null}
              />
              <InfoRow icon={Package} label="CBM" value={quotation.cbm ? String(quotation.cbm) : null} />
              <InfoRow
                icon={Package}
                label="Packages"
                value={quotation.packages_count ? `${quotation.packages_count} × ${quotation.package_type ?? '—'}` : null}
              />
              <InfoRow
                icon={FileText}
                label="Cargo Value"
                value={quotation.cargo_value ? formatCurrency(quotation.cargo_value, quotation.currency) : null}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quotation.dangerous_cargo && <Badge variant="secondary" className="bg-red-100 text-red-700">Dangerous Cargo</Badge>}
                {quotation.temperature_controlled && <Badge variant="secondary" className="bg-blue-100 text-blue-700">Temperature Controlled</Badge>}
                {quotation.insurance_required && <Badge variant="secondary" className="bg-amber-100 text-amber-700">Insurance Required</Badge>}
              </div>
            </CardContent>
          </Card>

          {/* Section 7: Required Documents */}
          <Card className="no-print">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Required Documents</CardTitle>
              <CardDescription>What the customer should expect to provide.</CardDescription>
            </CardHeader>
            <CardContent>
              {quotation.required_documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents specified.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-1.5 text-sm">
                  {quotation.required_documents.map((doc) => (
                    <li key={doc} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      {doc}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Section 10: Approval */}
          {(quotation.requested_by_user || quotation.approved_by_user || quotation.sent_by_user || quotation.status === 'pending_approval') && (
            <Card className="no-print">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  Approval
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {quotation.status === 'pending_approval' && approvalReason && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Requires Branch Manager approval — {approvalReason}.</p>
                  </div>
                )}
                <InfoRow icon={User} label="Requested By" value={quotation.requested_by_user?.full_name ?? null} />
                <InfoRow icon={User} label="Approved By" value={quotation.approved_by_user?.full_name ?? null} />
                <InfoRow
                  icon={Calendar}
                  label="Approval Date"
                  value={quotation.approval_date ? formatDateTime(quotation.approval_date) : null}
                />
                <InfoRow icon={User} label="Sent By" value={quotation.sent_by_user?.full_name ?? null} />
                <InfoRow
                  icon={Calendar}
                  label="Sent Date"
                  value={quotation.sent_at ? formatDateTime(quotation.sent_at) : null}
                />
                {quotation.approval_notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Approval Notes</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{quotation.approval_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <VersionHistoryCard quotation={quotation} />
          <QuotationAttachmentsPanel quotationId={quotationId} branchId={quotation.branch_id} />

          <Card className="no-print">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.notes ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quotation.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Terms &amp; Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.terms ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quotation.terms}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No terms specified.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Section 4: Services */}
          {quotation.services.length > 0 && (
            <Card className="no-print">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Services</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {quotation.services.map((key) => {
                  const service = QUOTATION_SERVICES.find((s) => s.key === key);
                  return (
                    <Badge key={key} variant="outline">
                      {service?.label ?? key}
                    </Badge>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {(quotation.services.length > 0 || quotation.excluded_services.length > 0) && (
            <Card className="no-print">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Scope of Service</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Included
                  </p>
                  {quotation.services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {quotation.services.map((key) => {
                        const service = QUOTATION_SERVICES.find((s) => s.key === key);
                        return (
                          <li key={key} className="flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            {service?.label ?? key}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Not Included
                  </p>
                  {quotation.excluded_services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {quotation.excluded_services.map((item) => (
                        <li key={item} className="flex items-center gap-1.5">
                          <X className="h-3.5 w-3.5 shrink-0 text-red-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="no-print">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Package className="h-4 w-4 text-blue-600" />
                Charge Breakdown
              </CardTitle>
              <CardDescription>Services and charges included in this quotation.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {quotation.items.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No charges on this quotation.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotation.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell className="text-muted-foreground">{item.unit || '—'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(item.unit_price, quotation.currency)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.tax_rate}%</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.discount_rate}%</TableCell>
                          <TableCell className="max-w-[160px] truncate text-muted-foreground" title={item.notes ?? undefined}>
                            {item.notes || '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.total, quotation.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader className="no-print">
              <CardTitle className="text-lg font-semibold">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(quotation.subtotal, quotation.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{formatCurrency(quotation.tax_amount, quotation.currency)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary">{formatCurrency(quotation.total, quotation.currency)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Payment Terms</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow icon={FileText} label="Terms" value={quotation.payment_terms ? paymentTermsLabel(quotation.payment_terms) : null} />
              <InfoRow icon={FileText} label="Method" value={quotation.payment_method ? paymentMethodLabel(quotation.payment_method) : null} />
            </CardContent>
          </Card>

          {/* Print-only: complete quotation document */}
          <div className="print-only hidden">
            <PrintQuotation quotation={quotation} />
          </div>
        </div>
      </div>

      <ConvertToShipmentDialog
        quotation={quotation}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConverted={loadData}
      />

      {/* Reject / Cancel reason dialog — same shape, different target status. */}
      <Dialog open={!!terminalActionTarget} onOpenChange={(open) => !open && setTerminalActionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {terminalActionTarget === 'cancelled' ? (
                <Ban className="h-5 w-5 text-red-600" />
              ) : (
                <X className="h-5 w-5 text-red-600" />
              )}
              {terminalActionTarget === 'cancelled' ? 'Cancel Quotation?' : 'Reject Quotation?'}
            </DialogTitle>
            <DialogDescription>Optionally record why, for the record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="approval-notes">Notes</Label>
            <Textarea
              id="approval-notes"
              rows={3}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder={terminalActionTarget === 'cancelled' ? 'Reason for cancellation…' : 'Reason for rejection…'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminalActionTarget(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={updatingStatus}
              onClick={() => terminalActionTarget && handleStatusChange(terminalActionTarget, approvalNotes || undefined)}
            >
              {updatingStatus && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {terminalActionTarget === 'cancelled' ? 'Cancel Quotation' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF preview */}
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Quotation Preview</DialogTitle>
            <DialogDescription>{quotation.quotation_number}</DialogDescription>
          </DialogHeader>
          {previewUrl && <iframe src={previewUrl} className="h-[75vh] w-full rounded-md border border-border" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={handleDownloadPdf} disabled={downloadingPdf}>
              {downloadingPdf ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const ShipmentIcon = quotation.shipment_type ? SHIPMENT_TYPE_ICONS[quotation.shipment_type] : null;

  return (
    <div className="space-y-6">
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

      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">QUOTATION</h1>
          <p className="text-sm text-muted-foreground">{quotation.quotation_number ?? 'Draft'}</p>
        </div>
        <div className="text-right">
          <Badge variant="secondary" className={statusMeta.color}>
            {statusMeta.label}
          </Badge>
          <p className="mt-2 text-xs text-muted-foreground">Issued: {formatDate(quotation.created_at)}</p>
          <p className="text-xs text-muted-foreground">Valid Until: {formatDate(quotation.valid_until)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Bill To</p>
          <p className="font-medium">{quotation.customer?.company_name ?? '—'}</p>
          {quotation.customer?.address && (
            <p className="text-muted-foreground">{quotation.customer.address}</p>
          )}
          <p className="text-muted-foreground">
            {[quotation.contact_email ?? quotation.customer?.email, quotation.contact_phone ?? quotation.customer?.phone]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Shipment Details</p>
          {quotation.shipment_type && ShipmentIcon && (
            <p className="capitalize">
              {quotation.shipment_direction ? `${quotation.shipment_direction} · ` : ''}
              {SHIPMENT_TYPE_LABELS[quotation.shipment_type]} Freight
              {quotation.cargo_type ? ` · ${CARGO_TYPE_LABELS[quotation.cargo_type]}` : ''}
            </p>
          )}
          {quotation.incoterm && <p className="text-muted-foreground">Incoterm: {quotation.incoterm}</p>}
          <p>
            <span className="text-muted-foreground">From: </span>
            {quotation.origin_port ?? quotation.origin ?? '—'}
          </p>
          <p>
            <span className="text-muted-foreground">To: </span>
            {quotation.destination_port ?? quotation.destination ?? '—'}
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Discount</TableHead>
            <TableHead className="text-right">Tax</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotation.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.description}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.unit_price, quotation.currency)}</TableCell>
              <TableCell className="text-right">{item.tax_rate}%</TableCell>
              <TableCell className="text-right">{item.discount_rate}%</TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(item.total, quotation.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="ml-auto w-64 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatCurrency(quotation.subtotal, quotation.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="font-medium">{formatCurrency(quotation.tax_amount, quotation.currency)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span>{formatCurrency(quotation.total, quotation.currency)}</span>
        </div>
      </div>

      {quotation.required_documents.length > 0 && (
        <div className="border-t border-border pt-4 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Required Documents</p>
          <p className="text-muted-foreground">{quotation.required_documents.join(', ')}</p>
        </div>
      )}

      {(quotation.notes || quotation.customer_notes || quotation.terms) && (
        <div className="space-y-3 border-t border-border pt-4 text-sm">
          {quotation.customer_notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{quotation.customer_notes}</p>
            </div>
          )}
          {quotation.terms && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Terms &amp; Conditions</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{quotation.terms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
