// Auto-generated-compatible types for the Freight Operations Management Platform

export type UserRole =
  | 'platform_admin'
  | 'admin'
  | 'operations'
  | 'sales'
  | 'branch_manager'
  | 'finance'
  | 'customs'
  | 'planning'
  | 'documentation'
  | 'terminal'
  | 'examination'
  | 'warehouse'
  | 'transport';

export type CustomerType = 'individual' | 'corporate';

export type CustomerStatus = 'active' | 'inactive' | 'blacklisted';

export type QuotationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'archived';

export type ShipmentType = 'air' | 'sea' | 'road' | 'rail' | 'multimodal';

export type ShipmentDirection = 'import' | 'export';
export type CargoType = 'fcl' | 'lcl' | 'roro' | 'break_bulk';
export type QuotationPriority = 'normal' | 'urgent' | 'vip';

export type ShipmentStatus =
  | 'awaiting_operations'
  | 'planning'
  | 'documentation'
  | 'awaiting_customs'
  | 'customs_clearance'
  | 'terminal_processing'
  | 'cargo_examination'
  | 'released'
  | 'transport'
  | 'delivered'
  | 'completed'
  | 'archived'
  | 'cancelled'
  // Legacy values — retired from the active flow (see SHIPMENT_STATUS_FLOW
  // in lib/utils/status.ts) but Postgres enums can't drop values, and old
  // shipment_timeline rows permanently store them, so they must stay valid
  // here purely so those historical rows still render a label.
  | 'booking_received'
  | 'processing'
  | 'in_transit'
  | 'arrived';

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
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift_code: string | null;
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
  quotation_approval_required: boolean;
  quotation_discount_threshold_percent: number | null;
  quotation_amount_threshold: number | null;
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

  // Section 1: contact + rep
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  sales_rep_id: string | null;

  // Section 2: shipment information
  shipment_direction: ShipmentDirection | null;
  cargo_type: CargoType | null;
  incoterm: string | null;
  origin_country: string | null;
  origin_port: string | null;
  destination_country: string | null;
  destination_port: string | null;
  expected_shipping_date: string | null;
  expected_arrival_date: string | null;

  // Section 3: cargo information
  commodity_description: string | null;
  hs_code: string | null;
  container_count: number | null;
  container_size: string | null;
  weight: number | null;
  weight_unit: string;
  cbm: number | null;
  packages_count: number | null;
  package_type: string | null;
  dangerous_cargo: boolean;
  temperature_controlled: boolean;
  insurance_required: boolean;
  cargo_value: number | null;

  // Section 4: selected services
  services: string[];

  // Section 6: payment terms
  payment_terms: string | null;
  payment_method: string | null;

  // Section 7: required documents
  required_documents: string[];

  // Section 8: priority + customer-facing notes
  priority: QuotationPriority;
  customer_notes: string | null;

  // Section 10: approval trail
  requested_by: string | null;
  approved_by: string | null;
  approval_date: string | null;
  approval_notes: string | null;

  // Sent By / Sent Date — set when status moves to 'sent'
  sent_by: string | null;
  sent_at: string | null;

  // Section 13: conversion tracking
  converted_shipment_id: string | null;
  converted_at: string | null;

  // Versioning: a version IS a quotation row, linked back to its chain
  parent_quotation_id: string | null;
  root_quotation_id: string | null;
  version: number;
  is_latest_version: boolean;

  // Scope of service: "included" mirrors `services`, this is "not included"
  excluded_services: string[];

  customer?: Customer | null;
  branch?: Branch | null;
  items?: QuotationItem[];
  sales_rep?: Profile | null;
  requested_by_user?: Profile | null;
  approved_by_user?: Profile | null;
  sent_by_user?: Profile | null;
  converted_shipment?: Shipment | null;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_rate: number;
  service_key: string | null;
  unit: string | null;
  notes: string | null;
  billing_basis: string | null;
  cost_centre: string | null;
  gl_account: string | null;
  internal_reference: string | null;
  tax_code: string | null;
  sort_order: number;
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
  // Trade documentation — carried forward from the plan at conversion time.
  incoterm: string | null;
  hs_code: string | null;
  commodity: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  mbl_number: string | null;
  hbl_number: string | null;
  awb_number: string | null;
  goods_value: number | null;
  goods_value_currency: string;
  // Named cargo parties — the shipment's customer is the forwarder's
  // client, which is often not the consignee on the bill of lading.
  shipper_name: string | null;
  shipper_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  notify_party_name: string | null;
  notify_party_address: string | null;
  // Chargeable weight — the greater of actual vs. volumetric.
  actual_weight: number | null;
  volumetric_weight: number | null;
  chargeable_weight: number | null;
  // Retained copy of the fields the quotation already captured — see
  // migration 053's comment for why this is a real copy, not a join.
  services: string[];
  required_documents: string[];
  priority: QuotationPriority;
  cargo_type: CargoType | null;
  shipment_direction: ShipmentDirection | null;
  container_count: number | null;
  packages_count: number | null;
  package_type: string | null;
  dangerous_cargo: boolean;
  temperature_controlled: boolean;
  insurance_required: boolean;
  payment_terms: string | null;
  payment_method: string | null;
  customer_notes: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  sales_rep_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: Customer | null;
  branch?: Branch | null;
  assigned_user?: Profile | null;
  sales_rep?: Profile | null;
  timeline?: ShipmentTimelineEntry[];
}

export type DGPackingGroup = 'I' | 'II' | 'III';

export interface ShipmentContainer {
  id: string;
  shipment_id: string;
  branch_id: string;
  container_number: string | null;
  seal_number: string | null;
  container_type: string | null;
  tare_weight: number | null;
  gross_weight: number | null;
  is_dangerous_goods: boolean;
  un_number: string | null;
  imdg_class: string | null;
  packing_group: DGPackingGroup | null;
  status: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CargoInsurancePolicy {
  id: string;
  shipment_id: string;
  branch_id: string;
  insurer_name: string;
  policy_number: string | null;
  coverage_amount: number | null;
  currency: string;
  premium_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FreightRateCard {
  id: string;
  branch_id: string;
  carrier: string | null;
  shipment_type: ShipmentType | null;
  trade_lane_origin: string;
  trade_lane_destination: string;
  container_type: string | null;
  buy_rate: number;
  sell_rate: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WebhookSubscription {
  id: string;
  branch_id: string;
  name: string;
  target_url: string;
  signing_secret: string;
  event_types: string[];
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PublicTrackedShipment {
  reference_number: string | null;
  shipment_type: ShipmentType | null;
  status: ShipmentStatus;
  origin: string | null;
  destination: string | null;
  carrier: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  updated_at: string;
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
  quotation_id: string | null;
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
  status: DocumentStatus;
  verified_by: string | null;
  verified_at: string | null;
  expiry_date: string | null;
  remarks: string | null;
  replaces_document_id: string | null;
  updated_by: string | null;
  template_id: string | null;
  stage_id: string | null;
  verified_by_user?: Profile | null;
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
  form_m_number: string | null;
  form_m_date: string | null;
  paar_number: string | null;
  paar_date: string | null;
  soncap_number: string | null;
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
  free_time_days: number | null;
  free_time_expiry: string | null;
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

export type ShipmentWarehouseRecordStatus = 'awaiting_arrival' | 'received' | 'released';

export interface ShipmentWarehouseRecord {
  id: string;
  shipment_id: string;
  branch_id: string;
  warehouse_id: string | null;
  status: ShipmentWarehouseRecordStatus;
  expected_arrival_date: string | null;
  received_date: string | null;
  released_date: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: { id: string; reference_number: string | null; customer?: { company_name: string } | null } | null;
}

export type DeliveryOrderStatus = 'waiting_for_release' | 'released' | 'delivered';

export interface DeliveryOrder {
  id: string;
  shipment_id: string;
  branch_id: string;
  order_number: string | null;
  status: DeliveryOrderStatus;
  delivery_address: string | null;
  requested_delivery_date: string | null;
  released_date: string | null;
  delivered_date: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipment?: { id: string; reference_number: string | null; customer?: { company_name: string } | null } | null;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  branch_id: string;
  type: string;
  entity_type: 'quotation' | 'shipment';
  entity_id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
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
  | 'demurrage'
  | 'storage'
  | 're_examination_penalty'
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
  shipment_id: string | null;
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
  actual_weight: number | null;
  volumetric_weight: number | null;
  chargeable_weight: number | null;
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

// ============================================================
// WORKFLOW ENGINE
// ============================================================

export type WorkflowStageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface WorkflowStageCatalog {
  id: string;
  key: string;
  sequence: number;
  label: string;
  default_department: UserRole;
  is_optional: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ShipmentStage {
  id: string;
  shipment_id: string;
  catalog_id: string;
  branch_id: string;
  stage_key: string;
  sequence: number;
  label: string;
  assigned_department: UserRole;
  assigned_to: string | null;
  status: WorkflowStageStatus;
  is_optional: boolean;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: Profile | null;
}

export interface ShipmentStageComment {
  id: string;
  stage_id: string;
  shipment_id: string;
  branch_id: string;
  comment: string;
  created_by: string | null;
  created_at: string;
  created_by_user?: Profile | null;
}

// ============================================================
// DOCUMENT ENGINE
// ============================================================

export type DocumentStatus = 'uploaded' | 'verified' | 'rejected' | 'expired';

export interface DocumentTemplate {
  id: string;
  key: string;
  name: string;
  category: DocumentCategory;
  stage_key: string | null;
  applies_to_shipment_types: ShipmentType[] | null;
  requires_red_channel: boolean;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ============================================================
// TASK ENGINE
// ============================================================

export interface StageTaskTemplate {
  id: string;
  stage_key: string;
  title: string;
  default_priority: PriorityLevel;
  default_department: UserRole | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ShipmentTask {
  id: string;
  shipment_id: string;
  stage_id: string | null;
  template_id: string | null;
  branch_id: string;
  title: string;
  assigned_to: string | null;
  assigned_department: UserRole | null;
  due_date: string | null;
  status: PlanTaskStatus;
  priority: PriorityLevel;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: Profile | null;
}
