'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Package, Users, FolderOpen, Boxes, Truck, Receipt, Wallet, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface SearchResults {
  shipments: { id: string; reference_number: string | null; customerName: string | null }[];
  customers: { id: string; company_name: string }[];
  quotations: { id: string; quotation_number: string | null; customerName: string | null }[];
  documents: { id: string; name: string }[];
  containers: { id: string; container_number: string; shipmentId: string; shipmentRef: string | null }[];
  truckNumbers: { id: string; truck_number: string; shipmentId: string; shipmentRef: string | null }[];
  invoices: { id: string; invoice_number: string | null; customerName: string | null }[];
  payments: { id: string; payment_number: string | null; customerName: string | null }[];
  users: { id: string; full_name: string; email: string }[];
}

const EMPTY_RESULTS: SearchResults = {
  shipments: [],
  customers: [],
  quotations: [],
  documents: [],
  containers: [],
  truckNumbers: [],
  invoices: [],
  payments: [],
  users: [],
};

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global search command palette (Cmd+K). Reuses the exact same
 * table/column search patterns already used by each list page's local
 * search — no new backend endpoints, just the existing Supabase client
 * querying the existing tables. RLS already scopes results to what the
 * current user can see. Users search is additionally gated to
 * admin/branch_manager here, on top of RLS, matching the same roles that
 * can reach the Users page itself.
 */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const { hasRole } = useAuth();
  const canSearchUsers = hasRole('admin') || hasRole('branch_manager');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY_RESULTS);
    }
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const [shipRes, custRes, quotRes, docRes, containerRes, truckRes, invRes, payRes, userRes] =
        await Promise.all([
          supabase
            .from('shipments')
            .select('id, reference_number, customer:customers(company_name)')
            .is('deleted_at', null)
            .ilike('reference_number', `%${term}%`)
            .limit(5),
          supabase
            .from('customers')
            .select('id, company_name')
            .is('deleted_at', null)
            .ilike('company_name', `%${term}%`)
            .limit(5),
          supabase
            .from('quotations')
            .select('id, quotation_number, customer:customers(company_name)')
            .is('deleted_at', null)
            .ilike('quotation_number', `%${term}%`)
            .limit(5),
          supabase
            .from('documents')
            .select('id, name')
            .is('deleted_at', null)
            .ilike('name', `%${term}%`)
            .limit(5),
          supabase
            .from('shipment_containers')
            .select('id, container_number, shipment_id, shipment:shipments(reference_number)')
            .ilike('container_number', `%${term}%`)
            .limit(5),
          supabase
            .from('shipment_transportation')
            .select('id, truck_number, shipment_id, shipment:shipments(reference_number)')
            .is('deleted_at', null)
            .ilike('truck_number', `%${term}%`)
            .limit(5),
          supabase
            .from('invoices')
            .select('id, invoice_number, customer:customers(company_name)')
            .is('deleted_at', null)
            .ilike('invoice_number', `%${term}%`)
            .limit(5),
          supabase
            .from('payments')
            .select('id, payment_number, customer:customers(company_name)')
            .is('deleted_at', null)
            .ilike('payment_number', `%${term}%`)
            .limit(5),
          canSearchUsers
            ? supabase
                .from('profiles')
                .select('id, full_name, email')
                .is('deleted_at', null)
                .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
                .limit(5)
            : Promise.resolve({ data: [] }),
        ]);

      if (cancelled) return;

      setResults({
        shipments: (shipRes.data ?? []).map((s) => ({
          id: s.id as string,
          reference_number: s.reference_number as string | null,
          customerName:
            (s.customer as unknown as { company_name: string } | null)
              ?.company_name ?? null,
        })),
        customers: (custRes.data ?? []) as SearchResults['customers'],
        quotations: (quotRes.data ?? []).map((q) => ({
          id: q.id as string,
          quotation_number: q.quotation_number as string | null,
          customerName:
            (q.customer as unknown as { company_name: string } | null)
              ?.company_name ?? null,
        })),
        documents: (docRes.data ?? []) as SearchResults['documents'],
        containers: (containerRes.data ?? []).map((c) => ({
          id: c.id as string,
          container_number: c.container_number as string,
          shipmentId: c.shipment_id as string,
          shipmentRef: (c.shipment as unknown as { reference_number: string | null } | null)?.reference_number ?? null,
        })),
        truckNumbers: (truckRes.data ?? []).map((t) => ({
          id: t.id as string,
          truck_number: t.truck_number as string,
          shipmentId: t.shipment_id as string,
          shipmentRef: (t.shipment as unknown as { reference_number: string | null } | null)?.reference_number ?? null,
        })),
        invoices: (invRes.data ?? []).map((i) => ({
          id: i.id as string,
          invoice_number: i.invoice_number as string | null,
          customerName: (i.customer as unknown as { company_name: string } | null)?.company_name ?? null,
        })),
        payments: (payRes.data ?? []).map((p) => ({
          id: p.id as string,
          payment_number: p.payment_number as string | null,
          customerName: (p.customer as unknown as { company_name: string } | null)?.company_name ?? null,
        })),
        users: (userRes.data ?? []) as SearchResults['users'],
      });
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, canSearchUsers]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router]
  );

  const hasResults =
    results.shipments.length > 0 ||
    results.customers.length > 0 ||
    results.quotations.length > 0 ||
    results.documents.length > 0 ||
    results.containers.length > 0 ||
    results.truckNumbers.length > 0 ||
    results.invoices.length > 0 ||
    results.payments.length > 0 ||
    results.users.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search shipments, containers, invoices, customers…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length < 2 ? (
          <CommandEmpty>Type at least 2 characters to search…</CommandEmpty>
        ) : loading ? (
          <CommandEmpty>Searching…</CommandEmpty>
        ) : !hasResults ? (
          <CommandEmpty>No results found.</CommandEmpty>
        ) : (
          <>
            {results.shipments.length > 0 && (
              <CommandGroup heading="Shipments">
                {results.shipments.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`shipment-${s.id}-${s.reference_number}`}
                    onSelect={() => go(`/shipments/${s.id}`)}
                  >
                    <Package className="mr-2 h-4 w-4 text-cyan-600" />
                    <span>{s.reference_number ?? 'Shipment'}</span>
                    {s.customerName && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {s.customerName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.containers.length > 0 && (
              <CommandGroup heading="Containers">
                {results.containers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`container-${c.id}-${c.container_number}`}
                    onSelect={() => go(`/shipments/${c.shipmentId}`)}
                  >
                    <Boxes className="mr-2 h-4 w-4 text-teal-600" />
                    <span>{c.container_number}</span>
                    {c.shipmentRef && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {c.shipmentRef}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.truckNumbers.length > 0 && (
              <CommandGroup heading="Truck Numbers">
                {results.truckNumbers.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`truck-${t.id}-${t.truck_number}`}
                    onSelect={() => go(`/shipments/${t.shipmentId}`)}
                  >
                    <Truck className="mr-2 h-4 w-4 text-orange-600" />
                    <span>{t.truck_number}</span>
                    {t.shipmentRef && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {t.shipmentRef}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.customers.length > 0 && (
              <CommandGroup heading="Customers">
                {results.customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`customer-${c.id}-${c.company_name}`}
                    onSelect={() => go(`/customers/${c.id}`)}
                  >
                    <Users className="mr-2 h-4 w-4 text-blue-600" />
                    <span>{c.company_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.quotations.length > 0 && (
              <CommandGroup heading="Quotations">
                {results.quotations.map((q) => (
                  <CommandItem
                    key={q.id}
                    value={`quotation-${q.id}-${q.quotation_number}`}
                    onSelect={() => go(`/quotations/${q.id}`)}
                  >
                    <FileText className="mr-2 h-4 w-4 text-amber-600" />
                    <span>{q.quotation_number ?? 'Quotation'}</span>
                    {q.customerName && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {q.customerName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.invoices.length > 0 && (
              <CommandGroup heading="Invoices">
                {results.invoices.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={`invoice-${i.id}-${i.invoice_number}`}
                    onSelect={() => go(`/invoices/${i.id}`)}
                  >
                    <Receipt className="mr-2 h-4 w-4 text-emerald-600" />
                    <span>{i.invoice_number ?? 'Invoice'}</span>
                    {i.customerName && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {i.customerName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.payments.length > 0 && (
              <CommandGroup heading="Payments">
                {results.payments.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`payment-${p.id}-${p.payment_number}`}
                    onSelect={() => go(`/payments/${p.id}`)}
                  >
                    <Wallet className="mr-2 h-4 w-4 text-green-600" />
                    <span>{p.payment_number ?? 'Payment'}</span>
                    {p.customerName && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {p.customerName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.documents.length > 0 && (
              <CommandGroup heading="Documents">
                {results.documents.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`document-${d.id}-${d.name}`}
                    onSelect={() => go(`/documents?q=${encodeURIComponent(d.name)}`)}
                  >
                    <FolderOpen className="mr-2 h-4 w-4 text-purple-600" />
                    <span>{d.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.users.length > 0 && (
              <CommandGroup heading="Users">
                {results.users.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`user-${u.id}-${u.full_name}`}
                    onSelect={() => go('/users')}
                  >
                    <UserCog className="mr-2 h-4 w-4 text-slate-600" />
                    <span>{u.full_name}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{u.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
