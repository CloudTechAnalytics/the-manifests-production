'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, Plus, Search, Filter, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CUSTOMER_STATUS_META, formatDate } from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { Customer, CustomerStatus } from '@/types';

const CUSTOMER_EXPORT_COLUMNS: ExportColumn<Customer>[] = [
  { header: 'Company', value: (c) => c.company_name },
  { header: 'Type', value: (c) => c.type },
  { header: 'Status', value: (c) => c.status },
  { header: 'Email', value: (c) => c.email },
  { header: 'Phone', value: (c) => c.phone },
  { header: 'City', value: (c) => c.city },
  { header: 'Country', value: (c) => c.country },
  { header: 'Website', value: (c) => c.website },
  { header: 'Created', value: (c) => c.created_at },
];

type StatusFilter = 'all' | CustomerStatus;

export default function CustomersPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const isAdmin = profile?.role === 'admin';
  const branchFilter = isAdmin ? null : profile?.branch_id;

  // Debounced search term
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadCustomers = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('*, branch:branches(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Branch scoping: non-admins only see their branch
      if (branchFilter) {
        query = query.eq('branch_id', branchFilter);
      }

      // Status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Search by company name, email, or phone
      if (debouncedSearch) {
        // PostgREST's or() filter grammar treats %_(),. as syntactically
        // significant — a search term containing any of them (e.g. a
        // company name like "Doe, John Ltd") would otherwise produce a
        // malformed filter and a 400 that gets swallowed as "no results".
        const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
        query = query.or(
          `company_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading customers:', error);
        setCustomers([]);
        return;
      }
      setCustomers((data as Customer[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, branchFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'blacklisted', label: 'Blacklisted' },
    ],
    []
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Users className="h-6 w-6 text-blue-600" />
            Customers
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your customer accounts and contacts.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton
            data={customers}
            columns={CUSTOMER_EXPORT_COLUMNS}
            filename="customers"
          />
          <Link href="/customers/new">
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              New Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by company name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            All Customers
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({customers.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Building2 className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">No customers found</p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch || statusFilter !== 'all'
                    ? 'Try adjusting your filters.'
                    : 'Get started by creating a new customer.'}
                </p>
              </div>
              {!debouncedSearch && statusFilter === 'all' && (
                <Link href="/customers/new">
                  <Button size="sm" variant="outline">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Customer
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => {
                  const meta = CUSTOMER_STATUS_META[customer.status] ?? {
                    label: customer.status ?? 'Unknown',
                    color: 'bg-muted text-muted-foreground',
                  };
                  return (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                      onClick={() => router.push(`/customers/${customer.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <span>{customer.company_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-muted-foreground">
                          {customer.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.email ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.phone ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.city ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(customer.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
