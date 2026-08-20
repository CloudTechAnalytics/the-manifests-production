'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Briefcase,
  Edit,
  KeyRound,
  Loader2,
  ShieldAlert,
  User,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Employee, EmployeeResponsibility, EmployeeSensitiveInfo, Profile } from '@/types';

const KNOWN_TABS = new Set(['personal', 'employment', 'responsibilities', 'access']);

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('hr_manager') || hasRole('hr_officer');
  const canViewSensitive = hasRole('admin') || hasRole('hr_manager');

  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab && KNOWN_TABS.has(requestedTab) ? requestedTab : 'personal';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [sensitive, setSensitive] = useState<EmployeeSensitiveInfo | null>(null);
  const [responsibilities, setResponsibilities] = useState<EmployeeResponsibility[]>([]);
  const [linkedProfile, setLinkedProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const employeeId = params.id;
      const { data: employeeData, error } = await supabase
        .from('employees')
        .select('*, branch:branches(*), department:departments(*), manager:employees!employees_manager_id_fkey(id, first_name, last_name, job_title)')
        .eq('id', employeeId)
        .maybeSingle();

      if (!isMounted) return;
      if (error || !employeeData) {
        console.error('Error loading employee:', error);
        toast.error('Employee not found, or you do not have access to it.');
        setLoading(false);
        return;
      }
      const emp = employeeData as Employee;
      setEmployee(emp);

      const [sensitiveRes, respRes, profileRes] = await Promise.all([
        supabase.from('employee_sensitive_info').select('*').eq('employee_id', employeeId).maybeSingle(),
        supabase
          .from('employee_responsibilities')
          .select('*, department:departments(*)')
          .eq('employee_id', employeeId)
          .is('deleted_at', null)
          .order('is_primary', { ascending: false }),
        emp.profile_id
          ? supabase.from('profiles').select('*, branch:branches(*)').eq('id', emp.profile_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (!isMounted) return;
      // A null row here (rather than an error) is exactly what RLS
      // produces for hr_officer — masked, not broken. The Sensitive
      // Info tab shows a "Restricted" state for that case, not blank.
      setSensitive((sensitiveRes.data as EmployeeSensitiveInfo | null) ?? null);
      setResponsibilities((respRes.data as EmployeeResponsibility[]) ?? []);
      setLinkedProfile((profileRes.data as Profile | null) ?? null);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Employee not found.</p>
      </div>
    );
  }

  const primary = responsibilities.find((r) => r.is_primary) ?? responsibilities[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/employees">Employees</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {employee.first_name} {employee.last_name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/hr/employees')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 page-title">
              <Users className="h-6 w-6 text-blue-600" />
              {employee.first_name} {employee.last_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {employee.job_title} · {employee.employee_number}
              {primary && ` · ${primary.role_title}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Badge variant="secondary" className="capitalize">
            {employee.employment_status.replace('_', ' ')}
          </Badge>
          {canEdit && (
            <Link href={`/hr/employees/${employee.id}/edit`}>
              <Button size="sm" variant="outline">
                <Edit className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs
        defaultValue={initialTab}
        onValueChange={(v) => router.replace(`/hr/employees/${employee.id}?tab=${v}`, { scroll: false })}
      >
        <TabsList>
          <TabsTrigger value="personal" className="gap-1.5">
            <User className="h-3.5 w-3.5" /> Personal
          </TabsTrigger>
          <TabsTrigger value="employment" className="gap-1.5">
            <Briefcase className="h-3.5 w-3.5" /> Employment
          </TabsTrigger>
          <TabsTrigger value="responsibilities" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Responsibilities
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Manifest Access
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Personal</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                <Field label="Date of Birth" value={employee.date_of_birth} />
                <Field label="Gender" value={employee.gender} />
                <Field label="Personal Email" value={employee.personal_email} />
                <Field label="Personal Phone" value={employee.personal_phone} />
                <Field label="Address" value={employee.address} className="sm:col-span-3" />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Sensitive Info
              </CardTitle>
              <CardDescription>Salary, bank, and emergency contact — HR Administrators and HR Managers only.</CardDescription>
            </CardHeader>
            <CardContent>
              {!canViewSensitive || !sensitive ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  {canViewSensitive ? 'No sensitive info recorded yet.' : 'Restricted — you do not have access to this section.'}
                </p>
              ) : (
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                  <Field
                    label="Salary"
                    value={sensitive.salary_amount != null ? `${sensitive.salary_currency} ${sensitive.salary_amount.toLocaleString()}` : null}
                  />
                  <Field label="Pay Frequency" value={sensitive.pay_frequency} />
                  <Field label="Bank" value={sensitive.bank_name} />
                  <Field label="Account Name" value={sensitive.bank_account_name} />
                  <Field label="Account Number" value={sensitive.bank_account_number} />
                  <Field label="Tax ID" value={sensitive.tax_id} />
                  <Field label="National ID" value={sensitive.national_id_number} />
                  <Field label="Emergency Contact" value={sensitive.emergency_contact_name} />
                  <Field label="Relationship" value={sensitive.emergency_contact_relationship} />
                  <Field label="Emergency Phone" value={sensitive.emergency_contact_phone} />
                  <Field label="Private Notes" value={sensitive.private_notes} className="sm:col-span-3" />
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employment">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Employment</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                <Field label="Branch" value={employee.branch?.name ?? 'Org-wide'} />
                <Field label="Department" value={employee.department?.name} />
                <Field label="Manager" value={employee.manager ? `${employee.manager.first_name} ${employee.manager.last_name}` : null} />
                <Field label="Employment Type" value={employee.employment_type.replace('_', ' ')} className="capitalize" />
                <Field label="Employment Status" value={employee.employment_status.replace('_', ' ')} className="capitalize" />
                <Field label="Work Location" value={employee.work_location} />
                <Field label="Hire Date" value={employee.hire_date} />
                <Field label="Confirmation Date" value={employee.confirmation_date} />
                <Field label="Contract End Date" value={employee.contract_end_date} />
                <Field label="Notes" value={employee.notes} className="sm:col-span-3" />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="responsibilities">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Responsibilities</CardTitle>
              <CardDescription>Every function this employee performs — one person, multiple roles, one record.</CardDescription>
            </CardHeader>
            <CardContent>
              {responsibilities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No responsibilities recorded.</p>
              ) : (
                <div className="space-y-2">
                  {responsibilities.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{r.role_title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.department?.name ?? 'No department'} · Since {r.start_date}
                        </p>
                      </div>
                      {r.is_primary && <Badge variant="secondary">Primary</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Manifest Access</CardTitle>
              <CardDescription>HR job title and system role are separate concepts.</CardDescription>
            </CardHeader>
            <CardContent>
              {!linkedProfile ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No Manifest login for this employee — tracked in HR only.
                </p>
              ) : (
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                  <Field label="Email" value={linkedProfile.email} />
                  <Field label="System Role" value={linkedProfile.role?.replace(/_/g, ' ')} className="capitalize" />
                  <Field label="Branch Access" value={linkedProfile.branch?.name ?? 'Org-wide'} />
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  );
}
