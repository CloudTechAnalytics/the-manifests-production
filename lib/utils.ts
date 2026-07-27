import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts a human-readable message from a caught error, falling back to
 * `fallback` when none can be found.
 *
 * `err instanceof Error` alone isn't enough here: Supabase's PostgrestError,
 * AuthError, and StorageError are plain objects with a `.message` field —
 * none of them extend the real `Error` class — so a thrown Supabase error
 * always failed that check and silently showed the generic fallback text
 * instead of the actual reason (e.g. an RLS policy violation or constraint
 * failure), which is why errors across the app read as unhelpful as
 * "Failed to delete shipment" with no indication of why.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message.length > 0
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}
