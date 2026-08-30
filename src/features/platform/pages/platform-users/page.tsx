'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { formatDate } from '@/shared/lib/utils/status';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import type { Profile } from '@/shared/types';

const EMPTY_FORM = { fullName: '', email: '', password: '' };

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.password) {
      toast.error('Full name, email, and a temporary password are required');
      return;
    }
    if (form.password.length < 10) {
      toast.error('Temporary password must be at least 10 characters');
      return;
    }

    setCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-platform-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            full_name: form.fullName.trim(),
            email: form.email.trim(),
            password: form.password,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Failed to add platform user');

      toast.success(`${form.fullName.trim()} can now sign in — they'll be asked to set their own password first.`);
      setOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add platform user'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Platform Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Staff with platform-wide administrative access — not tenant users.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(EMPTY_FORM); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Add platform user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add platform user</DialogTitle>
              <DialogDescription>
                A CloudTech staff account — not a tenant user. They can sign in immediately with
                the temporary password below, and will be asked to set their own on first login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="pu-name">Full name</Label>
                <Input
                  id="pu-name"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Ada Okafor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pu-email">Email</Label>
                <Input
                  id="pu-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="ada@cloudtech.example"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pu-password">Temporary password</Label>
                <Input
                  id="pu-password"
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="10+ characters"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Add platform user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
