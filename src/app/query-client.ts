import { QueryClient } from '@tanstack/react-query';

/**
 * One shared client for the whole app (Phase 3 of the migration plan —
 * replacing page-local useEffect/useState data-fetching with TanStack
 * Query, matching the reference's own convention: service functions
 * doing raw supabase.from()/rpc() calls, wrapped in useQuery/useMutation
 * hooks, composed by pages).
 *
 * staleTime: 0 (TanStack Query's own default — set explicitly here so
 * the choice reads as deliberate, not an oversight). The app's create/
 * update/delete flows aren't converted to useMutation yet — they still
 * do a plain `await supabase.from(...).insert()` followed by
 * `navigate()`, with no `queryClient.invalidateQueries()` call after.
 * With any staleTime above 0, that gap means the *next* feature to move
 * onto useQuery would show cached, pre-mutation data for up to that
 * long after a create/edit/delete, everywhere, until each mutation site
 * is individually converted — a real regression the old fetch-on-every-
 * mount pages never had. 0 keeps this migration's first pass exactly as
 * fresh as the code it's replacing (every mount refetches); revisit
 * per-feature staleTime only once that feature's own mutations call
 * invalidateQueries, not before.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
});
