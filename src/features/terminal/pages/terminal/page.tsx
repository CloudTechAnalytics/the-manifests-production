'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Container, Search, ArrowRight } from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { fetchTerminalQueue } from '@/features/terminal/services/terminal.service';
import type { TerminalStatus } from '@/shared/types';

/*
 * Terminal queue — a filtered work list for Terminal, not a second place
 * to edit terminal data. Every row opens the shipment's Terminal tab.
 */

const STATUS_META: Record<TerminalStatus, { label: string; color: string }> = {
  waiting: { label: 'Waiting', color: 'bg-muted text-muted-foreground' },
  positioned: { label: 'Positioned', color: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-amber-50 text-amber-700' },
  examined: { label: 'Examined', color: 'bg-purple-50 text-purple-700' },
  released: { label: 'Released', color: 'bg-emerald-50 text-emerald-700' },
};

export default function TerminalQueuePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['terminal-queue', isAdmin, branchId],
    queryFn: () => fetchTerminalQueue(isAdmin, branchId),
    enabled: !!profile,
  });

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.reference_number?.toLowerCase().includes(q) ||
      r.customer?.company_name.toLowerCase().includes(q) ||
      r.terminal?.terminal_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Container className="h-6 w-6 text-primary" />
          Terminal Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shipments awaiting terminal handling and release. Open a shipment to update its terminal record.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, or terminal…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Container} title="Nothing outstanding" message="Every shipment has been released from the terminal." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Container Position</TableHead>
                  <TableHead>Gate Pass</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-accent/60"
                    onClick={() => navigate(`/shipments/${r.id}?tab=terminal`)}
                  >
                    <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.terminal?.terminal_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.terminal?.container_position ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.terminal?.gate_pass_number ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (STATUS_META[r.terminal?.status ?? 'waiting'] ?? {
                            color: 'bg-muted text-muted-foreground',
                          }).color
                        }
                      >
                        {r.terminal ? STATUS_META[r.terminal.status]?.label ?? r.terminal.status : 'Not started'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
