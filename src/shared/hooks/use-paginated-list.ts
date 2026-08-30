import { useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Generic server-side pagination — the same "Load more" shape every list
 * page (shipments, quotations, customers, invoices, payments, documents,
 * expenses, HR employees/training) already used before this was rebuilt
 * on TanStack Query's useInfiniteQuery (Phase 3 of the migration plan).
 *
 * The public shape is unchanged from the pre-Query version on purpose —
 * every existing call site keeps working with only one small addition:
 * a `queryKey`, the same filter/search/sort values that were already
 * being fed into `fetchPage`'s own useCallback dependency array (that
 * array was always this hook's real cache key, just an implicit one via
 * function-identity; useInfiniteQuery needs it explicit and serializable
 * to do real caching — background refetch, cross-mount reuse, etc. —
 * instead of a hard reset-and-refetch on every dependency change).
 *
 * `fetchPage` receives (offset, limit) and returns exactly the rows for
 * that window; hasMore is inferred from whether a full page came back,
 * same as before, so callers never need a separate count query.
 */
export function usePaginatedList<T>(
  queryKey: readonly unknown[],
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 25
) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === pageSize ? allPages.length * pageSize : undefined,
  });

  const rows = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  // Same optimistic-local-edit escape hatch the pre-Query version had
  // (unused by any current call site, kept for parity) — now backed by
  // the query cache directly rather than local state, so an edit here
  // survives a background refetch the same way a real mutation would.
  const setRows = (updater: T[] | ((prev: T[]) => T[])) => {
    queryClient.setQueryData(queryKey, (old: { pages: T[][]; pageParams: number[] } | undefined) => {
      const nextRows = typeof updater === 'function' ? (updater as (prev: T[]) => T[])(rows) : updater;
      return { pages: [nextRows], pageParams: [0] };
    });
  };

  return {
    rows,
    setRows,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage ?? false,
    loadMore: () => query.fetchNextPage(),
  };
}
