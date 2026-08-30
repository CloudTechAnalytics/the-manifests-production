'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SHIPMENT_DIRECTIONS,
  CARGO_TYPES,
  INCOTERMS,
  CURRENCIES,
  CONTAINER_SIZES,
  WEIGHT_UNITS,
  PACKAGE_TYPES,
} from '@/lib/quotation-constants';
import type { QuotationFormValues } from '@/lib/quotation-schema';
import type { ShipmentType } from '@/types';

const TRANSPORT_MODES: { value: ShipmentType; label: string }[] = [
  { value: 'sea', label: 'Sea Freight' },
  { value: 'air', label: 'Air Freight' },
  { value: 'road', label: 'Road Freight' },
  { value: 'rail', label: 'Rail Freight' },
  { value: 'multimodal', label: 'Multimodal' },
];

/** Section 2 — Shipment Information. */
export function ShipmentInfoSection() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Shipment Information</CardTitle>
        <CardDescription>Direction, mode, route, and trade terms.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>Shipment Direction</Label>
          <Controller
            control={control}
            name="shipment_direction"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-4"
              >
                {SHIPMENT_DIRECTIONS.map((d) => (
                  <label key={d.value} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={d.value} />
                    {d.label}
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Transport Mode</Label>
          <Controller
            control={control}
            name="shipment_type"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-4"
              >
                {TRANSPORT_MODES.map((m) => (
                  <label key={m.value} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={m.value} />
                    {m.label}
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Shipment Type</Label>
          <Controller
            control={control}
            name="cargo_type"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-4"
              >
                {CARGO_TYPES.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={t.value} />
                    {t.label}
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="incoterm">Incoterm</Label>
            <Controller
              control={control}
              name="incoterm"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="incoterm">
                    <SelectValue placeholder="Select Incoterm" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOTERMS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="origin_country">Origin Country</Label>
            <Input id="origin_country" placeholder="Nigeria" {...register('origin_country')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origin_port">
              Origin Port <span className="text-destructive">*</span>
            </Label>
            <Input id="origin_port" placeholder="Apapa Port, Lagos" {...register('origin_port')} />
            {errors.origin_port && (
              <p className="text-xs text-destructive">{errors.origin_port.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination_country">Destination Country</Label>
            <Input
              id="destination_country"
              placeholder="United Kingdom"
              {...register('destination_country')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="destination_port">
              Destination Port <span className="text-destructive">*</span>
            </Label>
            <Input
              id="destination_port"
              placeholder="Port of Felixstowe"
              {...register('destination_port')}
            />
            {errors.destination_port && (
              <p className="text-xs text-destructive">{errors.destination_port.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expected_shipping_date">Expected Shipping Date</Label>
            <Input id="expected_shipping_date" type="date" {...register('expected_shipping_date')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expected_arrival_date">Expected Arrival Date</Label>
            <Input id="expected_arrival_date" type="date" {...register('expected_arrival_date')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Section 3 — Cargo Information. */
export function CargoInfoSection() {
  const { control, register } = useFormContext<QuotationFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Cargo Information</CardTitle>
        <CardDescription>What&apos;s being shipped, and how much of it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="commodity_description">Commodity Description</Label>
            <Input
              id="commodity_description"
              placeholder="Auto spare parts"
              {...register('commodity_description')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hs_code">HS Code</Label>
            <Input id="hs_code" placeholder="8708.99" {...register('hs_code')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cargo_value">Cargo Value</Label>
            <Input
              id="cargo_value"
              type="number"
              step="any"
              min="0"
              {...register('cargo_value')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="container_count">Number of Containers</Label>
            <Input
              id="container_count"
              type="number"
              min="0"
              step="1"
              {...register('container_count')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="container_size">Container Size</Label>
            <Controller
              control={control}
              name="container_size"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="container_size">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAINER_SIZES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="weight">Weight</Label>
            <div className="flex gap-2">
              <Input id="weight" type="number" step="any" min="0" {...register('weight')} />
              <Controller
                control={control}
                name="weight_unit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cbm">CBM</Label>
            <Input id="cbm" type="number" step="any" min="0" {...register('cbm')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="packages_count">Packages</Label>
            <Input id="packages_count" type="number" min="0" step="1" {...register('packages_count')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="package_type">Package Type</Label>
            <Controller
              control={control}
              name="package_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="package_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 border-t border-border pt-4">
          <Controller
            control={control}
            name="dangerous_cargo"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                Dangerous Cargo?
              </label>
            )}
          />
          <Controller
            control={control}
            name="temperature_controlled"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                Temperature Controlled?
              </label>
            )}
          />
          {/* Insurance is controlled solely by the "Cargo Insurance" checkbox
              in Services Required (Section 4) — checking it is the only way
              a priced insurance charge appears; there is deliberately no
              second, disconnected insurance toggle here. */}
        </div>
      </CardContent>
    </Card>
  );
}
