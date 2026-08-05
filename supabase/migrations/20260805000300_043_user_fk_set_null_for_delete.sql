/*
# Prerequisite for permanently deleting a user

## The problem
A user is referenced as created_by/updated_by/assigned_to/planned_by
across nearly every table in the schema — that's normal and correct
for an audit trail. The trouble is most of those FK columns were
declared with no explicit ON DELETE action, which defaults to
RESTRICT in Postgres. In practice that means deleting any user who has
ever created or touched a real record — which is every active user —
would fail outright with a foreign key violation, on whichever table
happened to be checked first.

## The fix
Point every one of these at ON DELETE SET NULL, matching the handful
that already had it right (shipment_timeline.created_by,
documents.created_by, shipment_stages.assigned_to, etc.). Deleting a
user now nulls out their attribution on everything they touched —
the shipment, invoice, or document itself is completely unaffected,
it just stops naming a now-deleted account as who created it. This is
schema hardening on its own regardless of whether a delete-user
feature ships; RESTRICT-by-omission on an audit column is a latent
bug either way.

user_roles.user_id is deliberately left as ON DELETE CASCADE — that
table only holds a user's *extra* role grants, which have no meaning
once the user is gone.
*/

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_created_by_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_updated_by_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_updated_by_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_created_by_fkey;
ALTER TABLE quotations ADD CONSTRAINT quotations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_updated_by_fkey;
ALTER TABLE quotations ADD CONSTRAINT quotations_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_created_by_fkey;
ALTER TABLE shipments ADD CONSTRAINT shipments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_updated_by_fkey;
ALTER TABLE shipments ADD CONSTRAINT shipments_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_updated_by_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_updated_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_created_by_fkey;
ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_updated_by_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_created_by_fkey;
ALTER TABLE warehouses ADD CONSTRAINT warehouses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_updated_by_fkey;
ALTER TABLE warehouses ADD CONSTRAINT warehouses_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_created_by_fkey;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_updated_by_fkey;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_created_by_fkey;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_plans DROP CONSTRAINT IF EXISTS shipment_plans_planned_by_fkey;
ALTER TABLE shipment_plans ADD CONSTRAINT shipment_plans_planned_by_fkey
  FOREIGN KEY (planned_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_plans DROP CONSTRAINT IF EXISTS shipment_plans_assigned_to_fkey;
ALTER TABLE shipment_plans ADD CONSTRAINT shipment_plans_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_plans DROP CONSTRAINT IF EXISTS shipment_plans_created_by_fkey;
ALTER TABLE shipment_plans ADD CONSTRAINT shipment_plans_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_plans DROP CONSTRAINT IF EXISTS shipment_plans_updated_by_fkey;
ALTER TABLE shipment_plans ADD CONSTRAINT shipment_plans_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE plan_tasks DROP CONSTRAINT IF EXISTS plan_tasks_assigned_to_fkey;
ALTER TABLE plan_tasks ADD CONSTRAINT plan_tasks_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE plan_tasks DROP CONSTRAINT IF EXISTS plan_tasks_created_by_fkey;
ALTER TABLE plan_tasks ADD CONSTRAINT plan_tasks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_customs DROP CONSTRAINT IF EXISTS shipment_customs_created_by_fkey;
ALTER TABLE shipment_customs ADD CONSTRAINT shipment_customs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_customs DROP CONSTRAINT IF EXISTS shipment_customs_updated_by_fkey;
ALTER TABLE shipment_customs ADD CONSTRAINT shipment_customs_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE terminal_operations DROP CONSTRAINT IF EXISTS terminal_operations_created_by_fkey;
ALTER TABLE terminal_operations ADD CONSTRAINT terminal_operations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE terminal_operations DROP CONSTRAINT IF EXISTS terminal_operations_updated_by_fkey;
ALTER TABLE terminal_operations ADD CONSTRAINT terminal_operations_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_examinations DROP CONSTRAINT IF EXISTS shipment_examinations_created_by_fkey;
ALTER TABLE shipment_examinations ADD CONSTRAINT shipment_examinations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_examinations DROP CONSTRAINT IF EXISTS shipment_examinations_updated_by_fkey;
ALTER TABLE shipment_examinations ADD CONSTRAINT shipment_examinations_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_transportation DROP CONSTRAINT IF EXISTS shipment_transportation_created_by_fkey;
ALTER TABLE shipment_transportation ADD CONSTRAINT shipment_transportation_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_transportation DROP CONSTRAINT IF EXISTS shipment_transportation_updated_by_fkey;
ALTER TABLE shipment_transportation ADD CONSTRAINT shipment_transportation_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_stages DROP CONSTRAINT IF EXISTS shipment_stages_created_by_fkey;
ALTER TABLE shipment_stages ADD CONSTRAINT shipment_stages_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shipment_stages DROP CONSTRAINT IF EXISTS shipment_stages_updated_by_fkey;
ALTER TABLE shipment_stages ADD CONSTRAINT shipment_stages_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_tasks DROP CONSTRAINT IF EXISTS shipment_tasks_created_by_fkey;
ALTER TABLE shipment_tasks ADD CONSTRAINT shipment_tasks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
