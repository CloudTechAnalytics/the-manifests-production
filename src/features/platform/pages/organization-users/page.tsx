'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { ROLE_LABELS } from '@/shared/hooks/use-role';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { ExportButton } from '@/shared/components/ui/export-button';
import type { ExportColumn } from '@/shared/lib/export';
import type { UserRole } from '@/shared/types';

const ORG_USER_EXPORT_COLUMNS: ExportColumn<OrgUserRow>[] = [
  { header: 'Full Name', value: (u) => u.full_name },
  { header: 'Email', value: (u) => u.email },
  { header: 'Organization', value: (u) => u.organization?.name ?? '' },
  { header: 'Role', value: (u) => ROLE_LABELS[u.role] ?? u.role },
  { header: 'Branch', value: (u) => u.branch?.name ?? '' },
  { header: 'Status', value: (u) => (u.is_active ? 'Active' : 'Inactive') },
];

interface OrgUserRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  organization: { name: string } | null;
  branch: { name: string } | null;
}

export default function OrganizationUsersPage() {
  const [users, setUsers] = useState<OrgUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          // organizations!profiles_organization_id_fkey disambiguates the embed:
          // profiles.organization_id -> organizations.id AND
          // organizations.created_by -> profiles.id both link these two
          // tables, so PostgREST can't infer direction from the table name
          // alone and refuses to embed without an explicit FK hint.
          'id, full_name, email, role, is_active, organization:organizations!profiles_organization_id_fkey(name), branch:branches(name)'
        )
        .neq('role', 'platform_admin')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers((data as unknown as OrgUserRow[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load organization users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.organization?.name.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Organization Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every tenant staff member across every organization.
          </p>
        </div>
        <ExportButton data={filtered} columns={ORG_USER_EXPORT_COLUMNS} filename="organization-users" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or organization…"
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
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <UsersIcon className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-sm">{u.organization?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.branch?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        )}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
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
