'use client';

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ship, Search, Loader2, Package, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { SHIPMENT_STATUS_META, SHIPMENT_STATUS_FLOW, formatDate } from '@/lib/utils/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PublicTrackedShipment } from '@/types';

function TrackShipmentForm() {
  const [searchParams] = useSearchParams();
  const [reference, setReference] = useState(searchParams.get('ref') ?? '');
  const [result, setResult] = useState<PublicTrackedShipment | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('public_track_shipment', {
        p_reference: reference.trim(),
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      setResult(row ?? null);
      if (!row) setError('No shipment found for that reference number.');
    } catch {
      setResult(null);
      setError('Something went wrong looking up that shipment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const meta = result
    ? SHIPMENT_STATUS_META[result.status] ?? {
        label: result.status ?? 'Unknown',
        color: 'bg-muted text-muted-foreground',
        step: -1,
      }
    : null;
  const currentStep = meta?.step ?? -1;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Ship className="h-4.5 w-4.5 text-primary-foreground" strokeWidth={2.25} />
            </div>
            <span className="font-serif text-lg font-bold tracking-tight">The Manifest</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Shipment Tracking
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            Track your shipment
          </h1>
          <p className="mt-3 text-muted-foreground">
            Enter your shipment reference number — no account needed.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mx-auto mt-8 flex max-w-md gap-2">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. SHP-2049"
            className="h-11"
          />
          <Button type="submit" size="lg" disabled={loading || !reference.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">Track</span>
          </Button>
        </form>

        {searched && !loading && (
          <div className="mx-auto mt-10 max-w-xl">
            {!result ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {error || 'No shipment found for that reference number.'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p className="font-serif text-xl font-bold">{result.reference_number}</p>
                  </div>
                  {meta && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.color}`}>
                      {meta.label}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {result.origin ?? '—'} <span className="mx-1">→</span> {result.destination ?? '—'}
                  {result.carrier && ` · ${result.carrier}`}
                </p>

                {currentStep >= 0 && (
                  <div className="mt-8 flex items-center">
                    {SHIPMENT_STATUS_FLOW.map((step, i) => {
                      const stepMeta = SHIPMENT_STATUS_META[step];
                      const reached = stepMeta.step <= currentStep;
                      return (
                        <div key={step} className="flex flex-1 items-center last:flex-none">
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                                reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {reached ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                            </div>
                            <span className="hidden text-[10px] text-muted-foreground sm:block">
                              {stepMeta.label}
                            </span>
                          </div>
                          {i < SHIPMENT_STATUS_FLOW.length - 1 && (
                            <div
                              className={`mx-1 h-0.5 flex-1 ${reached ? 'bg-primary' : 'bg-muted'}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Vessel / Voyage</p>
                    <p className="mt-0.5 font-medium">
                      {result.vessel_name || '—'}
                      {result.voyage_number ? ` / ${result.voyage_number}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Departure</p>
                    <p className="mt-0.5 font-medium">
                      {result.estimated_departure ? formatDate(result.estimated_departure) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Arrival</p>
                    <p className="mt-0.5 font-medium">
                      {result.estimated_arrival ? formatDate(result.estimated_arrival) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Updated</p>
                    <p className="mt-0.5 font-medium">{formatDate(result.updated_at)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function TrackShipmentPage() {
  return <TrackShipmentForm />;
}
