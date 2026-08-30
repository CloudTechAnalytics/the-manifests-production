import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { QUOTATION_STATUS_META } from '@/shared/lib/utils/status';
import type { QuotationStatus } from '@/shared/types';

export interface QuotationPdfItem {
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  taxRate: number;
  total: number;
  notes: string | null;
}

export interface QuotationPdfData {
  quotationNumber: string;
  status: QuotationStatus;
  createdAt: string;
  validUntil: string | null;
  preparedBy: string | null;
  organizationName: string;
  organizationLogoUrl: string | null;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  branchEmail: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwiftCode: string | null;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipmentDirection: string | null;
  shipmentType: string | null;
  cargoType: string | null;
  incoterm: string | null;
  originPort: string | null;
  destinationPort: string | null;
  items: QuotationPdfItem[];
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  includedServices: string[];
  excludedServices: string[];
  paymentTerms: string | null;
  paymentMethod: string | null;
  requiredDocuments: string[];
  qrCodeDataUrl: string | null;
}

const money = (n: number, currency: string) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#1a1a1a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  logo: { width: 40, height: 40, objectFit: 'contain', marginRight: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  orgName: { fontSize: 14, fontWeight: 700 },
  muted: { color: '#666666' },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  statusBadge: { fontSize: 9, fontWeight: 700, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#888888', marginBottom: 4 },
  twoCol: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  col: { flex: 1 },
  table: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 4, marginTop: 4 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f5f5f5', paddingVertical: 5, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  th: { fontSize: 8, fontWeight: 700, color: '#666666' },
  td: { fontSize: 8.5 },
  colDesc: { flex: 3 },
  colSmall: { flex: 1, textAlign: 'right' },
  totalsBlock: { alignSelf: 'flex-end', width: 220, marginTop: 8 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, alignItems: 'flex-end' },
  qr: { width: 60, height: 60 },
  signatureLine: { width: 160, borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: 24, paddingTop: 4 },
});

/**
 * A branded, printable quotation — the customer-facing document behind
 * Preview/Download/Send. Kept intentionally parallel to (not shared
 * with) the existing browser window.print() layout, since react-pdf
 * uses its own primitives (View/Text) rather than DOM elements.
 */
export function QuotationPdfDocument({ data }: { data: QuotationPdfData }) {
  const statusMeta = QUOTATION_STATUS_META[data.status] ?? {
    label: data.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };

  return (
    <Document title={`Quotation ${data.quotationNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            {data.organizationLogoUrl && <Image src={data.organizationLogoUrl} style={styles.logo} />}
            <View>
              <Text style={styles.orgName}>{data.organizationName}</Text>
              {data.branchAddress && <Text style={styles.muted}>{data.branchAddress}</Text>}
              <Text style={styles.muted}>{[data.branchPhone, data.branchEmail].filter(Boolean).join('  ·  ')}</Text>
            </View>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>QUOTATION</Text>
            <Text style={styles.muted}>{data.quotationNumber}</Text>
            <Text style={[styles.statusBadge, { backgroundColor: '#eef2ff', color: '#3730a3', marginTop: 4 }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        <View style={[styles.twoCol, styles.section]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            <Text>{data.customerName}</Text>
            {data.customerAddress && <Text style={styles.muted}>{data.customerAddress}</Text>}
            <Text style={styles.muted}>{[data.customerEmail, data.customerPhone].filter(Boolean).join('  ·  ')}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Shipment</Text>
            <Text>
              {[data.shipmentDirection, data.shipmentType, data.cargoType].filter(Boolean).join(' · ') || '—'}
            </Text>
            {data.incoterm && <Text style={styles.muted}>Incoterm: {data.incoterm}</Text>}
            <Text style={styles.muted}>From: {data.originPort ?? '—'}</Text>
            <Text style={styles.muted}>To: {data.destinationPort ?? '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Details</Text>
            <Text style={styles.muted}>Prepared By: {data.preparedBy ?? '—'}</Text>
            <Text style={styles.muted}>Issued: {dateStr(data.createdAt)}</Text>
            <Text style={styles.muted}>Valid Until: {dateStr(data.validUntil)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Charges</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, styles.colDesc]}>Description</Text>
              <Text style={[styles.th, styles.colSmall]}>Qty</Text>
              <Text style={[styles.th, styles.colSmall]}>Unit</Text>
              <Text style={[styles.th, styles.colSmall]}>Price</Text>
              <Text style={[styles.th, styles.colSmall]}>Disc %</Text>
              <Text style={[styles.th, styles.colSmall]}>Tax %</Text>
              <Text style={[styles.th, styles.colSmall]}>Total</Text>
            </View>
            {data.items.map((item, i) => (
              <View key={i} style={styles.tableRow}>
                <View style={styles.colDesc}>
                  <Text style={styles.td}>{item.description}</Text>
                  {item.notes && <Text style={[styles.muted, { fontSize: 7.5 }]}>{item.notes}</Text>}
                </View>
                <Text style={[styles.td, styles.colSmall]}>{item.quantity}</Text>
                <Text style={[styles.td, styles.colSmall]}>{item.unit || '—'}</Text>
                <Text style={[styles.td, styles.colSmall]}>{money(item.unitPrice, data.currency)}</Text>
                <Text style={[styles.td, styles.colSmall]}>{item.discountRate}%</Text>
                <Text style={[styles.td, styles.colSmall]}>{item.taxRate}%</Text>
                <Text style={[styles.td, styles.colSmall]}>{money(item.total, data.currency)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Subtotal</Text>
              <Text>{money(data.subtotal, data.currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Discount</Text>
              <Text>-{money(data.discountAmount, data.currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>VAT</Text>
              <Text>{money(data.taxAmount, data.currency)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={{ fontWeight: 700 }}>Grand Total</Text>
              <Text style={{ fontWeight: 700 }}>{money(data.total, data.currency)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.twoCol, styles.section]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Scope of Service — Included</Text>
            {data.includedServices.length === 0 ? (
              <Text style={styles.muted}>—</Text>
            ) : (
              data.includedServices.map((s) => <Text key={s}>✓ {s}</Text>)
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Scope of Service — Not Included</Text>
            {data.excludedServices.map((s) => (
              <Text key={s} style={styles.muted}>✗ {s}</Text>
            ))}
          </View>
        </View>

        <View style={[styles.twoCol, styles.section]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Payment Terms</Text>
            <Text>{data.paymentTerms ?? '—'}</Text>
            <Text style={styles.muted}>{data.paymentMethod ?? ''}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Required Documents</Text>
            <Text style={styles.muted}>{data.requiredDocuments.join(', ') || '—'}</Text>
          </View>
        </View>

        {(data.bankName || data.bankAccountNumber) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bank Details</Text>
            <Text style={styles.muted}>
              {[data.bankName, data.bankAccountName, data.bankAccountNumber, data.bankSwiftCode]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <View>
            <View style={styles.signatureLine}>
              <Text style={styles.muted}>Authorized Signature</Text>
            </View>
          </View>
          {data.qrCodeDataUrl && <Image src={data.qrCodeDataUrl} style={styles.qr} />}
        </View>
      </Page>
    </Document>
  );
}
