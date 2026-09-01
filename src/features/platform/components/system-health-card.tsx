'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';

type CheckStatus = 'checking' | 'operational' | 'down';

interface HealthCheck {
  name: string;
  status: CheckStatus;
  /** Round-trip time in ms for the last check, null while still checking
   *  or if the endpoint never responded at all. */
  latencyMs: number | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Genuinely live reachability checks against Supabase's own endpoints —
 * not decorative placeholders. Each check is a real network round trip;
 * "Operational" only shows when the endpoint actually answered.
 */
async function checkEndpoint(url: string, init?: RequestInit): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - start);
    return { ok: res.ok || res.status === 401 || res.status === 404, latencyMs };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

async function runHealthChecks(): Promise<HealthCheck[]> {
  const [database, auth, storage] = await Promise.all([
    checkEndpoint(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
    }),
    checkEndpoint(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    }),
    checkEndpoint(`${SUPABASE_URL}/storage/v1/bucket`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    }),
    // Edge Functions: OPTIONS is the CORS preflight every function already
    // handles, so this is a real reachability probe with no side effects.
  ]);
  const edgeFunctions = await checkEndpoint(
    `${SUPABASE_URL}/functions/v1/create-user`,
    { method: 'OPTIONS' }
  );

  return [
    { name: 'Database', status: database.ok ? 'operational' : 'down', latencyMs: database.latencyMs },
    { name: 'Authentication', status: auth.ok ? 'operational' : 'down', latencyMs: auth.latencyMs },
    { name: 'Storage', status: storage.ok ? 'operational' : 'down', latencyMs: storage.latencyMs },
    { name: 'Edge Functions', status: edgeFunctions.ok ? 'operational' : 'down', latencyMs: edgeFunctions.latencyMs },
  ];
}

export function useSystemHealth() {
  const [checks, setChecks] = useState<HealthCheck[]>([
    { name: 'Database', status: 'checking', latencyMs: null },
    { name: 'Authentication', status: 'checking', latencyMs: null },
    { name: 'Storage', status: 'checking', latencyMs: null },
    { name: 'Edge Functions', status: 'checking', latencyMs: null },
  ]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  // Bumped by refetch() to re-run the effect below on demand, in addition
  // to the automatic run on mount.
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setChecking(true);
    runHealthChecks().then((result) => {
      if (!isMounted) return;
      setChecks(result);
      setCheckedAt(new Date());
      setChecking(false);
    });
    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  const refetch = () => setRefreshToken((t) => t + 1);

  return { checks, checkedAt, checking, refetch };
}

export function SystemHealthCard({ compact }: { compact?: boolean }) {
  const { checks, checkedAt } = useSystemHealth();
  const allOperational = checks.every((c) => c.status === 'operational');
  const anyDown = checks.some((c) => c.status === 'down');

  return (
    <Card>
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="text-lg font-semibold">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        <p
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium',
            anyDown ? 'text-red-600' : allOperational ? 'text-emerald-600' : 'text-muted-foreground'
          )}
        >
          {anyDown ? (
            <XCircle className="h-4 w-4" />
          ) : allOperational ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {anyDown
            ? 'Some services are unreachable'
            : allOperational
              ? 'All systems operational'
              : 'Checking services…'}
        </p>

        <div className="space-y-2">
          {checks.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{c.name}</span>
              {c.status === 'checking' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : c.status === 'operational' ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Operational
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-3.5 w-3.5" />
                  Down
                </span>
              )}
            </div>
          ))}
        </div>

        {!compact && (
          <p className="text-xs text-muted-foreground">
            Live reachability checks against Supabase's own endpoints
            {checkedAt ? ` · checked ${checkedAt.toLocaleTimeString()}` : ''}. Latency
            and incident history aren't tracked yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
