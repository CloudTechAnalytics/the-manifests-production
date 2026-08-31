'use client';

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Package,
  Loader2,
  Plane,
  Ship,
  Truck,
  Train,
  Waypoints,
  CalendarClock,
  Boxes,
} from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { useBranchSelector } from '@/shared/hooks/use-branch-selector';
import { BranchSelectField } from '@/shared/components/branch-select-field';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import {
  fetchActiveCustomersForBranch,
  fetchAssignableUsersForBranch,
  fetchApprovedQuotationsForCustomer,
  createShipment,
} from '@/features/shipments/services/shipments.service';
import type {
  ShipmentType,
} from '@/shared/types';

// --- Validation schema ----------------------------------------------------

const shipmentSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  quotation_id: z.string().optional().or(z.literal('')),
  shipment_type: z.enum(['air', 'sea', 'road', 'rail', 'multimodal']),
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  assigned_to: z.string().optional().or(z.literal('')),
  booking_date: z.string().optional().or(z.literal('')),
  estimated_departure: z.string().optional().or(z.literal('')),
  estimated_arrival: z.string().optional().or(z.literal('')),
  carrier: z.string().optional().or(z.literal('')),
  tracking_number: z.string().optional().or(z.literal('')),
  container_number: z.string().optional().or(z.literal('')),
  weight: z
    .union([z.number().min(0), z.literal(''), z.null()])
    .optional()
    .or(z.literal('')),
  volume: z
    .union([z.number().min(0), z.literal(''), z.null()])
    .optional()
    .or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

type ShipmentFormValues = z.infer<typeof shipmentSchema>;

// --- Page -----------------------------------------------------------------

export default function NewShipmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const myBranchId = profile?.branch_id ?? null;
  const [branchError, setBranchError] = useState('');
  const {
    needsSelection: needsBranchSelection,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    branchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: {
      customer_id: '',
      quotation_id: '',
      shipment_type: 'sea',
      origin: '',
      destination: '',
      assigned_to: '',
      booking_date: '',
      estimated_departure: '',
      estimated_arrival: '',
      carrier: '',
      tracking_number: '',
      container_number: '',
      weight: '',
      volume: '',
      notes: '',
    },
  });

  const selectedCustomerId = watch('customer_id');

  // Load customers in user's branch
  const { data: customers = [] } = useQuery({
    queryKey: ['shipment-form-customers', isAdmin, myBranchId],
    queryFn: () => fetchActiveCustomersForBranch({ isAdmin, branchId: myBranchId }),
    enabled: !!profile,
  });

  // Load assignable users (profiles) in user's branch
  const { data: assignableUsers = [] } = useQuery({
    queryKey: ['shipment-form-assignable-users', isAdmin, myBranchId],
    queryFn: () => fetchAssignableUsersForBranch({ isAdmin, branchId: myBranchId }),
    enabled: !!profile,
  });

  // Load approved quotations for the selected customer
  const { data: quotations = [] } = useQuery({
    queryKey: ['shipment-form-quotations', selectedCustomerId, isAdmin, myBranchId],
    queryFn: () =>
      fetchApprovedQuotationsForCustomer({
        customerId: selectedCustomerId,
        isAdmin,
        branchId: myBranchId,
      }),
    enabled: !!selectedCustomerId,
  });

  const createMutation = useMutation({
    mutationFn: (values: ShipmentFormValues) => {
      if (!profile || !branchId) throw new Error('Not ready');
      return createShipment({ values, branchId, createdBy: profile.id });
    },
    onSuccess: ({ shipmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      toast.success('Shipment created successfully');
      navigate(`/shipments/${shipmentId}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to create shipment'));
    },
  });
  const submitting = createMutation.isPending;

  const onSubmit = (values: ShipmentFormValues) => {
    if (!profile) return;
    if (!branchId) {
      setBranchError('Please select a branch');
      return;
    }
    setBranchError('');
    createMutation.mutate(values);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/shipments">Shipments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Shipment</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/shipments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Package className="h-6 w-6 text-blue-600" />
            New Shipment
          </h1>
          <p className="text-sm text-muted-foreground">
            Create a new freight shipment record.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {needsBranchSelection && (
          <BranchSelectField
            branches={branches}
            value={selectedBranchId}
            onChange={setSelectedBranchId}
            loading={branchesLoading}
            error={branchError}
          />
        )}

        {/* Shipment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Package className="h-4 w-4 text-blue-600" />
              Shipment Details
            </CardTitle>
            <CardDescription>
              Core information about this shipment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer */}
              <div className="space-y-1.5">
                <Label htmlFor="customer_id">
                  Customer <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="customer_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="customer_id">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.customer_id && (
                  <p className="text-xs text-destructive">
                    {errors.customer_id.message}
                  </p>
                )}
              </div>

              {/* Quotation (optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="quotation_id">Quotation (optional)</Label>
                <Controller
                  control={control}
                  name="quotation_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!selectedCustomerId}
                    >
                      <SelectTrigger id="quotation_id">
                        <SelectValue
                          placeholder={
                            selectedCustomerId
                              ? 'Select approved quotation'
                              : 'Select a customer first'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {quotations.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.quotation_number ?? q.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedCustomerId && quotations.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No approved quotations for this customer.
                  </p>
                )}
              </div>

              {/* Shipment Type */}
              <div className="space-y-1.5">
                <Label htmlFor="shipment_type">
                  Shipment Type <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="shipment_type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) =>
                        field.onChange(v as ShipmentType)
                      }
                    >
                      <SelectTrigger id="shipment_type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="air">
                          <span className="flex items-center gap-1.5">
                            <Plane className="h-4 w-4" /> Air
                          </span>
                        </SelectItem>
                        <SelectItem value="sea">
                          <span className="flex items-center gap-1.5">
                            <Ship className="h-4 w-4" /> Sea
                          </span>
                        </SelectItem>
                        <SelectItem value="road">
                          <span className="flex items-center gap-1.5">
                            <Truck className="h-4 w-4" /> Road
                          </span>
                        </SelectItem>
                        <SelectItem value="rail">
                          <span className="flex items-center gap-1.5">
                            <Train className="h-4 w-4" /> Rail
                          </span>
                        </SelectItem>
                        <SelectItem value="multimodal">
                          <span className="flex items-center gap-1.5">
                            <Waypoints className="h-4 w-4" /> Multimodal
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.shipment_type && (
                  <p className="text-xs text-destructive">
                    {errors.shipment_type.message}
                  </p>
                )}
              </div>

              {/* Assigned To */}
              <div className="space-y-1.5">
                <Label htmlFor="assigned_to">Assigned To</Label>
                <Controller
                  control={control}
                  name="assigned_to"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="assigned_to">
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Origin */}
              <div className="space-y-1.5">
                <Label htmlFor="origin">
                  Origin <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="origin"
                  placeholder="Lagos, Nigeria"
                  {...control.register('origin')}
                />
                {errors.origin && (
                  <p className="text-xs text-destructive">
                    {errors.origin.message}
                  </p>
                )}
              </div>

              {/* Destination */}
              <div className="space-y-1.5">
                <Label htmlFor="destination">
                  Destination <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="destination"
                  placeholder="Rotterdam, Netherlands"
                  {...control.register('destination')}
                />
                {errors.destination && (
                  <p className="text-xs text-destructive">
                    {errors.destination.message}
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Internal notes about this shipment…"
                {...control.register('notes')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <CalendarClock className="h-4 w-4 text-blue-600" />
              Schedule
            </CardTitle>
            <CardDescription>
              Key dates for this shipment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="booking_date">Booking Date</Label>
                <Input
                  id="booking_date"
                  type="date"
                  {...control.register('booking_date')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated_departure">
                  Estimated Departure
                </Label>
                <Input
                  id="estimated_departure"
                  type="date"
                  {...control.register('estimated_departure')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated_arrival">
                  Estimated Arrival
                </Label>
                <Input
                  id="estimated_arrival"
                  type="date"
                  {...control.register('estimated_arrival')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Carrier & Cargo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Boxes className="h-4 w-4 text-blue-600" />
              Carrier &amp; Cargo
            </CardTitle>
            <CardDescription>
              Carrier details and cargo specifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="carrier">Carrier</Label>
                <Input
                  id="carrier"
                  placeholder="Maersk Line"
                  {...control.register('carrier')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tracking_number">Tracking Number</Label>
                <Input
                  id="tracking_number"
                  placeholder="MAEU1234567890"
                  {...control.register('tracking_number')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="container_number">Container Number</Label>
                <Input
                  id="container_number"
                  placeholder="MSCU1234567"
                  {...control.register('container_number')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...control.register('weight', {
                    setValueAs: (v) =>
                      v === '' || v == null ? '' : Number(v),
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="volume">Volume (m³)</Label>
                <Input
                  id="volume"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...control.register('volume', {
                    setValueAs: (v) =>
                      v === '' || v == null ? '' : Number(v),
                  })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/shipments" className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Create Shipment
          </Button>
        </div>
      </form>
    </div>
  );
}
