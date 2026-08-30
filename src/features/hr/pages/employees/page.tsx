'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Filter, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { usePaginatedList } from '@/shared/hooks/use-paginated-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { ExportButton } from '@/shared/components/ui/export-button';
import type { ExportColumn } from '@/shared/lib/export';
import type { Employee, EmploymentStatus } from '@/shared/types';

const EXPORT_COLUMNS: ExportColumn<Employee>[] = [
  { header: 'Employee Number', value: (e) => e.employee_number },
  { header: 'Name', value: (e) => `${e.first_name} ${e.last_name}` },
  { header: 'Job Title', value: (e) => e.job_title },
  { header: 'Employment Type', value: (e) => e.employment_type },
  { header: 'Employment Status', value: (e) => e.employment_status },
  { header: 'Hire Date', value: (e) => e.hire_date },
  { header: 'Manifest Login', value: (e) => (e.profile_id ? 'Yes' : 'No') },
];

const STATUS_META: Record<EmploymentStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  on_leave: { label: 'On Leave', className: 'bg-amber-50 text-amber-700' },
  suspended: { label: 'Suspended', className: 'bg-orange-50 text-orange-700' },
  terminated: { label: 'Terminated', className: 'bg-red-50 text-red-700' },
  resigned: { label: 'Resigned', className: 'bg-slate-100 text-slate-700' },
};

type StatusFilter = 'all' | EmploymentStatus;

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const canAddEmployee = hasRole('admin') || hasRole('hr_manager') || hasRole('hr_officer');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // RLS (can_view_employee) already scopes what comes back per caller —
  // no client-side branch filter needed here, unlike Customers/
  // Shipments, since the database is the actual boundary.
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('employees')
      .select('*, branch:branches(*), department:departments(*)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('employment_status', statusFilter);

    if (debouncedSearch) {
      const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
      query = query.or(
        `first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,employee_number.ilike.%${sanitized}%,job_title.ilike.%${sanitized}%`
      );
    }
    return query;
  }, [statusFilter, debouncedSearch]);

  const fetchPage = useCallback(
    async (offset: number, limit: number): Promise<Employee[]> => {
      if (!profile) return [];
      const { data, error } = await buildQuery().range(offset, offset + limit - 1);
      if (error) {
        console.error('Error loading employees:', error);
        return [];
      }
      return (data as Employee[]) ?? [];
    },
    [profile, buildQuery]
  );

  const { rows: employees, loading, loadingMore, hasMore, loadMore } = usePaginatedList<Employee>(
    ['employees', statusFilter, debouncedSearch],
    fetchPage
  );

  const fetchAllForExport = useCallback(async (): Promise<Employee[]> => {
    const { data, error } = await buildQuery();
    if (error) throw error;
    return (data as Employee[]) ?? [];
  }, [buildQuery]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Users className="h-6 w-6 text-blue-600" />
            Employees
          </h1>
          <p className="text-sm text-muted-foreground">Everyone HR tracks — with or without a Manifest login.</p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton fetchData={fetchAllForExport} columns={EXPORT_COLUMNS} filename="employees" />
          {canAddEmployee && (
            <Link to="/hr/employees/new">
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="mr-1.5 h-4 w-4" />
                New Employee
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, employee number, or job title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            All Employees
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({employees.length}
                {hasMore ? '+' : ''})
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
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Users className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">No employees found</p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch || statusFilter !== 'all'
                    ? 'Try adjusting your filters.'
                    : 'Get started by adding a new employee.'}
                </p>
              </div>
              {!debouncedSearch && statusFilter === 'all' && canAddEmployee && (
                <Link to="/hr/employees/new">
                  <Button size="sm" variant="outline">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Employee
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Manifest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => {
                  const meta = STATUS_META[employee.employment_status];
                  return (
                    <TableRow
                      key={employee.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                      onClick={() => navigate(`/hr/employees/${employee.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <p>
                              {employee.first_name} {employee.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{employee.employee_number}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{employee.job_title}</TableCell>
                      <TableCell className="text-muted-foreground">{employee.department?.name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{employee.branch?.name ?? 'Org-wide'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[11px] ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {employee.profile_id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <KeyRound className="h-3.5 w-3.5" /> Linked
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!loading && hasMore && (
            <div className="flex justify-center border-t border-border p-4">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
