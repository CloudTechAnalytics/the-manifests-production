'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Trash2,
  UserPlus,
  Building2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Customer, CustomerContact } from '@/types';

// --- Validation schema ----------------------------------------------------

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Contact name is required'),
  title: z.string().optional().or(z.literal('')),
  email: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Invalid email address'
    ),
  phone: z.string().optional().or(z.literal('')),
  is_primary: z.boolean(),
});

const customerSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  type: z.enum(['individual', 'corporate']),
  email: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Invalid email address'
    ),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  country: z.string().min(1, 'Country is required'),
  website: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) =>
        !v ||
        /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(v),
      'Invalid website URL'
    ),
  notes: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'blacklisted']),
  contacts: z.array(contactSchema),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

// --- Component ------------------------------------------------------------

export default function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const customerId = params.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingContactIds, setExistingContactIds] = useState<string[]>([]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      company_name: '',
      type: 'corporate',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: 'Nigeria',
      website: '',
      notes: '',
      status: 'active',
      contacts: [],
    },
  });

  const {
    fields: contactFields,
    append: appendContact,
    remove: removeContact,
  } = useFieldArray({ control, name: 'contacts' });

  // Load existing customer + contacts
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: cust, error: custErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .is('deleted_at', null)
          .maybeSingle();

        if (cancelled) return;

        if (custErr || !cust) {
          toast.error('Customer not found');
          router.push('/customers');
          return;
        }

        const customer = cust as Customer;

        const { data: ctcts } = await supabase
          .from('customer_contacts')
          .select('*')
          .eq('customer_id', customerId)
          .is('deleted_at', null)
          .order('is_primary', { ascending: false });

        if (cancelled) return;

        const contacts = (ctcts as CustomerContact[]) ?? [];
        setExistingContactIds(contacts.map((c) => c.id));

        reset({
          company_name: customer.company_name,
          type: customer.type,
          email: customer.email ?? '',
          phone: customer.phone ?? '',
          address: customer.address ?? '',
          city: customer.city ?? '',
          country: customer.country,
          website: customer.website ?? '',
          notes: customer.notes ?? '',
          status: customer.status,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            title: c.title ?? '',
            email: c.email ?? '',
            phone: c.phone ?? '',
            is_primary: c.is_primary,
          })),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const addContact = () =>
    appendContact({
      name: '',
      title: '',
      email: '',
      phone: '',
      is_primary: contactFields.length === 0,
    });

  const onSubmit = async (values: CustomerFormValues) => {
    if (!profile) {
      toast.error('You must be signed in.');
      return;
    }
    setSubmitting(true);
    try {
      // 1. Update customer
      const { error: custErr } = await supabase
        .from('customers')
        .update({
          company_name: values.company_name,
          type: values.type,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          city: values.city || null,
          country: values.country,
          website: values.website || null,
          notes: values.notes || null,
          status: values.status,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId);

      if (custErr) throw custErr;

      // 2. Sync contacts: upsert existing, insert new, soft-delete removed
      const submittedIds = values.contacts
        .map((c) => c.id)
        .filter((id): id is string => Boolean(id));
      const removedIds = existingContactIds.filter(
        (id) => !submittedIds.includes(id)
      );

      // Soft-delete removed contacts
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase
          .from('customer_contacts')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', removedIds);
        if (delErr) console.error('Contact delete error:', delErr);
      }

      // Upsert each contact
      for (const c of values.contacts) {
        const payload = {
          customer_id: customerId,
          name: c.name,
          title: c.title || null,
          email: c.email || null,
          phone: c.phone || null,
          is_primary: c.is_primary,
        };

        if (c.id) {
          // Update existing
          const { error: upErr } = await supabase
            .from('customer_contacts')
            .update(payload)
            .eq('id', c.id);
          if (upErr) console.error('Contact update error:', upErr);
        } else {
          // Insert new
          const { error: insErr } = await supabase
            .from('customer_contacts')
            .insert(payload);
          if (insErr) console.error('Contact insert error:', insErr);
        }
      }

      // 3. Log activity
      const { data: branchRow } = await supabase
        .from('customers')
        .select('branch_id')
        .eq('id', customerId)
        .single();

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchRow?.branch_id ?? '',
        action: 'customer.updated',
        entity_type: 'customer',
        entity_id: customerId,
        description: `Updated customer "${values.company_name}"`,
        metadata: { company_name: values.company_name },
      });

      toast.success('Customer updated successfully');
      router.push(`/customers/${customerId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update customer';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/customers">Customers</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/customers/${customerId}`}>
                {watch('company_name') || 'Customer'}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/customers/${customerId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-normal tracking-tight">
            <Building2 className="h-6 w-6 text-blue-600" />
            Edit Customer
          </h1>
          <p className="text-sm text-muted-foreground">
            Update customer details and contacts.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Customer Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="h-4 w-4 text-blue-600" />
              Customer Details
            </CardTitle>
            <CardDescription>
              Basic information about the customer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="company_name">
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company_name"
                  placeholder="Acme Logistics Ltd."
                  {...register('company_name')}
                />
                {errors.company_name && (
                  <p className="text-xs text-destructive">
                    {errors.company_name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corporate">Corporate</SelectItem>
                        <SelectItem value="individual">Individual</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="blacklisted">Blacklisted</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@acme.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+234 800 000 0000"
                  {...register('phone')}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="123 Freight Avenue"
                  {...register('address')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Lagos" {...register('city')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="country">
                  Country <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="country"
                  placeholder="Nigeria"
                  {...register('country')}
                />
                {errors.country && (
                  <p className="text-xs text-destructive">
                    {errors.country.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://acme.com"
                  {...register('website')}
                />
                {errors.website && (
                  <p className="text-xs text-destructive">
                    {errors.website.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Internal notes about this customer…"
                {...register('notes')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contacts */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <UserPlus className="h-4 w-4 text-blue-600" />
                Contacts
              </CardTitle>
              <CardDescription>
                Manage contacts for this customer.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addContact}
              className="sm:shrink-0"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Contact
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {contactFields.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No contacts added yet. Click &quot;Add Contact&quot; to get
                started.
              </p>
            ) : (
              contactFields.map((field, index) => (
                <div key={field.id} className="space-y-3">
                  {index > 0 && <Separator />}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Contact {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeContact(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`contacts.${index}.name`}>
                        Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`contacts.${index}.name`}
                        placeholder="John Doe"
                        {...register(`contacts.${index}.name`)}
                      />
                      {errors.contacts?.[index]?.name && (
                        <p className="text-xs text-destructive">
                          {errors.contacts[index]?.name?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`contacts.${index}.title`}>Title</Label>
                      <Input
                        id={`contacts.${index}.title`}
                        placeholder="Operations Manager"
                        {...register(`contacts.${index}.title`)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`contacts.${index}.email`}>Email</Label>
                      <Input
                        id={`contacts.${index}.email`}
                        type="email"
                        placeholder="john@acme.com"
                        {...register(`contacts.${index}.email`)}
                      />
                      {errors.contacts?.[index]?.email && (
                        <p className="text-xs text-destructive">
                          {errors.contacts[index]?.email?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`contacts.${index}.phone`}>Phone</Label>
                      <Input
                        id={`contacts.${index}.phone`}
                        placeholder="+234 800 000 0000"
                        {...register(`contacts.${index}.phone`)}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        id={`contacts.${index}.is_primary`}
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        {...register(`contacts.${index}.is_primary`)}
                      />
                      <Label
                        htmlFor={`contacts.${index}.is_primary`}
                        className="text-sm font-normal"
                      >
                        Set as primary contact
                      </Label>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href={`/customers/${customerId}`} className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
