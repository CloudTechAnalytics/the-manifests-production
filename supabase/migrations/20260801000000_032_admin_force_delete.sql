/*
# Admin force-delete: permanent cascade for a single customer

## Why
Org admins need to be able to permanently delete a customer even when
invoices, payments, quotations, shipments, or shipment plans still
reference it — all five of those FKs are ON DELETE RESTRICT (a sensible
default for everyday use), which correctly blocks an ordinary delete but
also blocks the admin's own confirmed "delete this, permanently" action
from the delete-record edge function today.

Every other entity the edge function force-deletes (shipment, quotation,
invoice, payment, expense, and the four Phase-1 customs/terminal/
examination/transportation tables) already cascades or nulls out
correctly via existing FK actions, so a single DELETE is enough for
those — only the customer case needs an explicit multi-step cascade,
same reasoning as permanently_delete_organization_data() before it.

## Order
invoices, payments, quotations, shipments, and shipment_plans don't
RESTRICT each other, so they can all go in one breath. Deleting
shipments cascades shipment_timeline, shipment-linked documents, and all
four Phase-1 tables automatically (their FKs to shipments are already
ON DELETE CASCADE). Deleting invoices/payments cascades
payment_allocations, which recalculates the other side via the existing
sync_payment_allocation() trigger (SECURITY DEFINER, so it fires
correctly regardless of caller). The customer row itself goes last,
cascading customer_contacts and customer-linked documents.
*/

CREATE OR REPLACE FUNCTION admin_force_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM invoices WHERE customer_id = p_customer_id;
  DELETE FROM payments WHERE customer_id = p_customer_id;
  DELETE FROM quotations WHERE customer_id = p_customer_id;
  DELETE FROM shipments WHERE customer_id = p_customer_id;
  DELETE FROM shipment_plans WHERE customer_id = p_customer_id;
  DELETE FROM customers WHERE id = p_customer_id;
END;
$$;
