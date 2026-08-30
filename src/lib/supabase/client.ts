import { createClient } from '@supabase/supabase-js';

// This is the ONLY backend the app talks to directly from the browser —
// PostgreSQL, Auth, Storage, and Realtime are all reached through it, with
// Row Level Security enforcing multi-tenant isolation. Session persistence/
// refresh/URL-detection are all on by default in v2's createClient; the
// @supabase/ssr wrapper this used under Next.js existed only to sync the
// session into cookies for server-side middleware to read — now that auth
// gating is a client-side route guard (src/app/router.tsx) instead of
// Next middleware, that cookie-sync layer has nothing left to serve.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
