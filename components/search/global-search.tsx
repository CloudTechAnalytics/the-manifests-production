'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Package, Users, FolderOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
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
}

const EMPTY_RESULTS: SearchResults = {
  shipments: [],
  customers: [],
  quotations: [],
  documents: [],
};

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global search command palette (Cmd+K). Reuses the exact same
 * table/column search patterns already used by each list page's local
 * search (shipments.reference_number, customers.company_name,
 * quotations.quotation_number, documents.name) — no new backend
 * endpoints, just the existing Supabase client querying the existing
 * tables. RLS already scopes results to what the current user can see.
 */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
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
      const [shipRes, custRes, quotRes, docRes] = await Promise.all([
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
      });
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

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
    results.documents.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search shipments, customers, quotations, documents…"
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
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
