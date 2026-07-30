// Auto-generated-compatible types for the Freight Operations Management Platform

export type UserRole =
  | 'platform_admin'
  | 'admin'
  | 'operations'
  | 'sales'
  | 'branch_manager'
  | 'finance'
  | 'customs';

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

export type CustomsStatus =
  | 'draft'
  | 'submitted'
  | 'awaiting_assessment'
  | 'duty_payment'
  | 'customs_processing'
  | 'released'
  | 'rejected';

export type CustomsInspectionChannel = 'green' | 'yellow' | 'red';

export type TerminalStatus = 'waiting' | 'positioned' | 'scheduled' | 'examined' | 'released';

export type ExaminationResult = 'passed' | 'held' | 'additional_duty' | 'further_inspection';

export type TransportationStatus =
  | 'assigned'
  | 'loaded'
  | 'in_transit'
  | 'delivered'
  | 'failed_delivery';

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
  organization_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branch?: Branch | null;
  organization?: Organization | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type BillingCycle = 'monthly' | 'annual';

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  annual_price: number | null;
  currency: string;
  max_users: number | null;
  storage_gb: number | null;
  support_level: string | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrgSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  seats: number;
  trial_ends_at: string | null;
  started_at: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  plan?: Plan;
}

export interface Invitation {
  id: string;
  organization_id: string;
  branch_id: string | null;
  email: string;
  full_name: string | null;
  role: UserRole;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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
  plan_id: string | null;
  examination_id: string | null;
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

export interface ShipmentCustoms {
  id: string;
  shipment_id: string;
  branch_id: string;
  declaration_number: string | null;
  hs_code: string | null;
  duty_amount: number;
  duty_paid: boolean;
  duty_paid_date: string | null;
  customs_office: string | null;
  inspection_channel: CustomsInspectionChannel | null;
  officer: string | null;
  status: CustomsStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: { id: string; reference_number: string | null; customer?: { company_name: string } | null } | null;
}

export interface TerminalOperation {
  id: string;
  shipment_id: string;
  branch_id: string;
  terminal_name: string | null;
  arrival_date: string | null;
  container_position: string | null;
  holding_bay: string | null;
  stack_number: string | null;
  examination_scheduled_date: string | null;
  gate_pass_number: string | null;
  exit_note_number: string | null;
  release_date: string | null;
  status: TerminalStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: { id: string; reference_number: string | null; customer?: { company_name: string } | null } | null;
}

export interface ShipmentExamination {
  id: string;
  shipment_id: string;
  branch_id: string;
  inspection_date: string | null;
  inspection_officer: string | null;
  terminal_officer: string | null;
  shipping_line_representative: string | null;
  freight_forwarder_representative: string | null;
  result: ExaminationResult | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: { id: string; reference_number: string | null; customer?: { company_name: string } | null } | null;
}

export interface ShipmentTransportation {
  id: string;
  shipment_id: string;
  branch_id: string;
  truck_number: string | null;
  trailer_number: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  pickup_date: string | null;
  departure_date: string | null;
  arrival_date: string | null;
  delivery_date: string | null;
  proof_of_delivery_document_id: string | null;
  status: TransportationStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: { id: string; reference_number: string | null; customer?: { company_name: string } | null } | null;
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
  branch_id: string | null;
  organization_id: string | null;
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

export type StockMovementType =
  | 'inbound'
  | 'outbound'
  | 'adjustment_increase'
  | 'adjustment_decrease'
  | 'transfer';

export interface Warehouse {
  id: string;
  branch_id: string;
  name: string;
  address: string | null;
  city: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branch?: Branch | null;
}

export interface StockItem {
  id: string;
  branch_id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  unit_cost: number;
  reorder_point: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branch?: Branch | null;
}

export interface WarehouseStock {
  id: string;
  branch_id: string;
  warehouse_id: string;
  item_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  item?: StockItem | null;
  warehouse?: Warehouse | null;
}

export interface StockMovement {
  id: string;
  branch_id: string;
  item_id: string;
  warehouse_id: string;
  to_warehouse_id: string | null;
  movement_type: StockMovementType;
  quantity: number;
  movement_date: string;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  item?: StockItem | null;
  warehouse?: Warehouse | null;
  to_warehouse?: Warehouse | null;
  created_by_user?: Profile | null;
}

export type PlanStatus = 'planned' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type PlanTaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export interface ShipmentPlan {
  id: string;
  plan_number: string | null;
  customer_id: string;
  quotation_id: string | null;
  branch_id: string;
  status: PlanStatus;
  priority: PriorityLevel;

  shipment_type: ShipmentType | null;
  origin: string | null;
  destination: string | null;
  incoterm: string | null;
  commodity: string | null;
  goods_value: number | null;
  goods_value_currency: string;
  insurance_required: boolean;
  special_instructions: string | null;
  total_packages: number | null;
  total_weight: number | null;
  total_volume: number | null;
  hs_code: string | null;
  cargo_description: string | null;

  container_type: string | null;
  container_quantity: number | null;
  equipment_supplier: string | null;
  container_pickup_date: string | null;
  container_return_date: string | null;

  carrier_line: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  service_route: string | null;

  pre_carriage_mode: string | null;
  transport_carrier: string | null;
  truck_number: string | null;
  estimated_transport_time: string | null;

  booking_confirmed_date: string | null;
  documentation_date: string | null;
  cargo_ready_date: string | null;
  planned_etd: string | null;
  planned_eta: string | null;
  delivery_date: string | null;

  estimated_cost: number | null;
  estimated_revenue: number | null;
  risk_level: PriorityLevel | null;

  planned_by: string | null;
  assigned_to: string | null;

  converted_shipment_id: string | null;
  converted_at: string | null;

  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;

  customer?: Customer | null;
  quotation?: Quotation | null;
  branch?: Branch | null;
  planned_by_user?: Profile | null;
  assigned_user?: Profile | null;
  converted_shipment?: Shipment | null;
  tasks?: PlanTask[];
}

export interface PlanTask {
  id: string;
  plan_id: string;
  branch_id: string;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  status: PlanTaskStatus;
  priority: PriorityLevel;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: Profile | null;
}
