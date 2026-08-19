'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic server-side pagination — the same "Load more" shape
 * app/(app)/activity-log/page.tsx already implements correctly,
 * extracted so every other list page (shipments, quotations, customers,
 * invoices, payments, documents, expenses) can reuse it instead of
 * hand-rolling an unbounded fetch.
 *
 * `fetchPage` must be a useCallback in the caller, memoized on whatever
 * filters/search/sort/tab it reads — a new function reference is the
 * trigger this hook resets to page 1 on, same as any other effect
 * dependency. It receives (offset, limit) and returns exactly the rows
 * for that window; hasMore is inferred from whether a full page came
 * back, so callers never need a separate count query.
 *
 * A stale, slower request from a since-superseded filter is dropped via
 * requestId rather than applied out of order.
 */
export function usePaginatedList<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 25
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    fetchPage(0, pageSize).then(
      (first) => {
        if (id !== requestId.current) return;
        setRows(first);
        setHasMore(first.length === pageSize);
        setLoading(false);
      },
      () => {
        if (id !== requestId.current) return;
        setRows([]);
        setHasMore(false);
        setLoading(false);
      }
    );
  }, [fetchPage, pageSize]);

  const loadMore = useCallback(async () => {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const next = await fetchPage(rows.length, pageSize);
      if (id !== requestId.current) return;
      setRows((prev) => [...prev, ...next]);
      setHasMore(next.length === pageSize);
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }, [fetchPage, rows.length, pageSize]);

  // Lets a page apply an optimistic local edit (e.g. after inline status
  // change) without a full reload — same escape hatch every page already
  // had when it owned its own rows state directly.
  return { rows, setRows, loading, loadingMore, hasMore, loadMore };
}
