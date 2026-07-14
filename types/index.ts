// Auto-generated-compatible types for the Freight Operations Management Platform

export type UserRole = 'admin' | 'operations' | 'sales' | 'branch_manager';

export type CustomerType = 'individual' | 'corporate';

export type CustomerStatus = 'active' | 'inactive' | 'blacklisted';

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'expired';

export type ShipmentType = 'air' | 'sea' | 'road' | 'rail' | 'multimodal';

export type ShipmentStatus =
  | 'booking_received'
  | 'documentation'
  | 'processing'
  | 'in_transit'
  | 'arrived'
  | 'delivered'
  | 'cancelled';

export type DocumentCategory =
  | 'invoice'
  | 'packing_list'
  | 'bill_of_lading'
  | 'air_waybill'
  | 'delivery_note'
  | 'customs'
  | 'proof_of_delivery'
  | 'other';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branch?: Branch | null;
}

export interface Customer {
  id: string;
  company_name: string;
  type: CustomerType;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  website: string | null;
  notes: string | null;
  status: CustomerStatus;
  branch_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branch?: Branch | null;
}

export interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Quotation {
  id: string;
  quotation_number: string | null;
  customer_id: string;
  branch_id: string;
  status: QuotationStatus;
  shipment_type: ShipmentType | null;
  origin: string | null;
  destination: string | null;
  valid_until: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  terms: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: Customer | null;
  branch?: Branch | null;
  items?: QuotationItem[];
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Shipment {
  id: string;
  reference_number: string | null;
  customer_id: string;
  quotation_id: string | null;
  branch_id: string;
  shipment_type: ShipmentType | null;
  origin: string | null;
  destination: string | null;
  status: ShipmentStatus;
  assigned_to: string | null;
  booking_date: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  carrier: string | null;
  tracking_number: string | null;
  container_number: string | null;
  weight: number | null;
  volume: number | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: Customer | null;
  branch?: Branch | null;
  assigned_user?: Profile | null;
  timeline?: ShipmentTimelineEntry[];
}

export interface ShipmentTimelineEntry {
  id: string;
  shipment_id: string;
  status: ShipmentStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  shipment_id: string | null;
  customer_id: string | null;
  name: string;
  category: DocumentCategory;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  branch_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: ThemePreference;
  notif_email_shipment_updates: boolean;
  notif_email_quotation_approvals: boolean;
  notif_email_system_alerts: boolean;
  notif_inapp_shipment_updates: boolean;
  notif_inapp_quotation_approvals: boolean;
  notif_inapp_system_alerts: boolean;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string | null;
  branch_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: Profile | null;
}

// --- Finance ----------------------------------------------------------------

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled';

export type PaymentMethod = 'bank_transfer' | 'cheque' | 'cash' | 'card' | 'other';

export type ExpenseCategory =
  | 'transport'
  | 'customs'
  | 'rent'
  | 'salaries_benefits'
  | 'utilities'
  | 'other';

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface Invoice {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  shipment_id: string | null;
  quotation_id: string | null;
  branch_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  currency: string;
  notes: string | null;
  terms: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: Customer | null;
  shipment?: Shipment | null;
  branch?: Branch | null;
}

export interface Payment {
  id: string;
  payment_number: string | null;
  customer_id: string;
  branch_id: string;
  payment_date: string;
  payment_method: PaymentMethod;
  amount: number;
  allocated_amount: number;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: Customer | null;
  branch?: Branch | null;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_by: string | null;
  created_at: string;
  invoice?: Invoice | null;
  payment?: Payment | null;
}

export interface Expense {
  id: string;
  expense_number: string | null;
  description: string;
  category: ExpenseCategory;
  shipment_id: string | null;
  branch_id: string;
  amount: number;
  currency: string;
  expense_date: string;
  status: ExpenseStatus;
  paid_by: string | null;
  approved_by: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: Shipment | null;
  branch?: Branch | null;
  paid_by_user?: Profile | null;
  approved_by_user?: Profile | null;
}
