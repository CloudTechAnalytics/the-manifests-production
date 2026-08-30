'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import type { Organization } from '@/shared/types';

/**
 * Platform-console search. The tenant GlobalSearch queries shipments,
 * customers and documents — data a platform_admin has no access to (RLS
 * scopes those to an organization, and a platform_admin belongs to none).
 * The thing this console actually manages is organizations, so that is
 * what this searches, navigating to each org's detail page. RLS already
 * lets a platform_admin see every org.
 */
export function PlatformSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);

  // Ctrl/Cmd+K toggles the palette, matching the tenant app's shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      // Neutralise characters that are significant inside a PostgREST
      // or() filter (commas and parens delimit it) or are ilike wildcards,
      // matching how the tenant list pages sanitise their search input.
      const safe = term.replace(/[%_(),.\\]/g, ' ');
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .is('deleted_at', null)
        .or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
        .order('name', { ascending: true })
        .limit(8);

      if (cancelled) return;
      setResults((data as Organization[]) ?? []);
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const go = useCallback(
    (id: string) => {
      setOpen(false);
      navigate(`/platform/organizations/${id}`);
    },
    [navigate]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search organizations…</span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search organizations by name or slug…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim().length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search…</CommandEmpty>
          ) : loading ? (
            <CommandEmpty>Searching…</CommandEmpty>
          ) : results.length === 0 ? (
            <CommandEmpty>No organizations found.</CommandEmpty>
          ) : (
            <CommandGroup heading="Organizations">
              {results.map((org) => (
                <CommandItem
                  key={org.id}
                  value={`org-${org.id}-${org.name}-${org.slug}`}
                  onSelect={() => go(org.id)}
                >
                  <Building2 className="mr-2 h-4 w-4 text-primary" />
                  <span>{org.name}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    /{org.slug}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
