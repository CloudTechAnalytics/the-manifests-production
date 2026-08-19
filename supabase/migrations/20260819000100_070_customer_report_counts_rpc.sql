/*
# customer_shipment_quotation_counts — one grouped query instead of two
  unbounded per-row fetches

## Why
app/(app)/reports/page.tsx's Customers report loaded EVERY shipment and
EVERY quotation row (just the customer_id column, but with no .limit())
for every customer in the current page, just to .length them per
customer in JavaScript. PostgREST's JS client has no GROUP BY — the
only way to get a true per-customer count without transferring every
matching row is a SQL aggregate.

## Why SECURITY INVOKER, not DEFINER
Unlike the provisioning functions (migration 064), this one only reads
data the CALLER already has RLS access to — it should stay scoped by
the caller's own branch/org visibility, not bypass it. SECURITY INVOKER
(the default, stated explicitly here) means the query inside runs under
the calling user's RLS policies exactly as if they'd written it
themselves, so it can be safely left open to `authenticated` — no
tenant-isolation risk, no lockdown migration needed for this one.
*/

CREATE OR REPLACE FUNCTION customer_shipment_quotation_counts(p_customer_ids uuid[])
RETURNS TABLE (customer_id uuid, shipment_count bigint, quotation_count bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    c.id AS customer_id,
    (SELECT count(*) FROM shipments s WHERE s.customer_id = c.id AND s.deleted_at IS NULL) AS shipment_count,
    (SELECT count(*) FROM quotations q WHERE q.customer_id = c.id AND q.deleted_at IS NULL) AS quotation_count
  FROM unnest(p_customer_ids) AS c(id);
$$;

GRANT EXECUTE ON FUNCTION customer_shipment_quotation_counts(uuid[]) TO authenticated;
