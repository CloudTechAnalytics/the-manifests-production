import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { createElement } from 'react';
import { QuotationPdfDocument, type QuotationPdfData } from '@/shared/lib/pdf/quotation-pdf-document';
import { paymentTermsLabel, paymentMethodLabel } from '@/shared/lib/quotation-constants';
import { resolveScopeOfServiceLabel, resolveExcludedServiceOptions } from '@/shared/lib/quotation-rules';
import type { Quotation, QuotationItem, Customer, Branch, Profile, Organization } from '@/shared/types';

export type QuotationForPdf = Quotation & {
  customer: Customer | null;
  branch: Branch | null;
  items: QuotationItem[];
  sales_rep: Profile | null;
};

/**
 * Pure-data mapper — no Supabase calls, so it can be reused by Preview,
 * Download, and Send-to-Customer alike, each of which already has the
 * quotation/organization objects loaded.
 */
export async function buildQuotationPdfData(
  quotation: QuotationForPdf,
  organization: Pick<Organization, 'name' | 'logo_url'> | null
): Promise<QuotationPdfData> {
  let qrCodeDataUrl: string | null = null;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    qrCodeDataUrl = await QRCode.toDataURL(`${origin}/quotations/${quotation.id}`, { margin: 1, width: 160 });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  return {
    quotationNumber: quotation.quotation_number ?? 'Draft',
    status: quotation.status,
    createdAt: quotation.created_at,
    validUntil: quotation.valid_until,
    preparedBy: quotation.sales_rep?.full_name ?? null,
    organizationName: organization?.name ?? quotation.branch?.name ?? 'The Manifest',
    organizationLogoUrl: organization?.logo_url ?? null,
    branchName: quotation.branch?.name ?? null,
    branchAddress: quotation.branch?.address ?? null,
    branchPhone: quotation.branch?.phone ?? null,
    branchEmail: quotation.branch?.email ?? null,
    bankName: quotation.branch?.bank_name ?? null,
    bankAccountName: quotation.branch?.bank_account_name ?? null,
    bankAccountNumber: quotation.branch?.bank_account_number ?? null,
    bankSwiftCode: quotation.branch?.bank_swift_code ?? null,
    customerName: quotation.customer?.company_name ?? 'Customer',
    customerAddress: quotation.customer?.address ?? null,
    customerEmail: quotation.contact_email ?? quotation.customer?.email ?? null,
    customerPhone: quotation.contact_phone ?? quotation.customer?.phone ?? null,
    shipmentDirection: quotation.shipment_direction,
    shipmentType: quotation.shipment_type,
    cargoType: quotation.cargo_type,
    incoterm: quotation.incoterm,
    originPort: quotation.origin_port ?? quotation.origin,
    destinationPort: quotation.destination_port ?? quotation.destination,
    items: quotation.items.map((item) => ({
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      discountRate: item.discount_rate,
      taxRate: item.tax_rate,
      total: item.total,
      notes: item.notes,
    })),
    currency: quotation.currency,
    subtotal: quotation.subtotal,
    discountAmount: quotation.items.reduce(
      (sum, i) => sum + i.quantity * i.unit_price * (i.discount_rate / 100),
      0
    ),
    taxAmount: quotation.tax_amount,
    total: quotation.total,
    includedServices: quotation.services.map((key) => resolveScopeOfServiceLabel(key)),
    excludedServices:
      quotation.excluded_services.length > 0
        ? quotation.excluded_services
        : resolveExcludedServiceOptions(quotation.services).map((o) => o.label),
    paymentTerms: quotation.payment_terms ? paymentTermsLabel(quotation.payment_terms) : null,
    paymentMethod: quotation.payment_method ? paymentMethodLabel(quotation.payment_method) : null,
    requiredDocuments: quotation.required_documents,
    qrCodeDataUrl,
  };
}

export async function renderQuotationPdfBlob(data: QuotationPdfData): Promise<Blob> {
  // react-pdf's pdf() is typed for a literal <Document> element; our
  // template wraps one, which is valid at runtime but not something the
  // typings model, hence the cast.
  return pdf(createElement(QuotationPdfDocument, { data }) as never).toBlob();
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:application/pdf;base64," prefix — callers just want raw base64.
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
