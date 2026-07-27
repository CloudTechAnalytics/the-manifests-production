'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage, cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/status';
import { Card, CardContent } from '@/components/ui/card';
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
import type { Profile } from '@/types';

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'platform_admin')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers((data as Profile[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load platform users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Platform Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff with platform-wide administrative access.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This list is read-only for now — promoting a new platform admin still
          requires running a one-line SQL update in the Supabase SQL Editor.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No platform users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        )}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(u.created_at)}
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
