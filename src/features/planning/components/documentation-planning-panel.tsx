'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { resolveRequiredTemplates } from '@/shared/lib/utils/document-templates';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import { CHECKLIST_DOCUMENT_STATUS_META, formatDate } from '@/shared/lib/utils/status';
import type { ChecklistDocumentStatus, PlanDocumentChecklistItem } from '@/shared/types';

interface DocumentationPlanningPanelProps {
  shipmentId: string;
  branchId: string;
}

const STATUS_OPTIONS = Object.keys(CHECKLIST_DOCUMENT_STATUS_META) as ChecklistDocumentStatus[];

const SELECT_COLUMNS =
  '*, template:document_templates(*), uploaded_by_user:profiles!plan_document_checklist_uploaded_by_fkey(id, full_name)';

/**
 * Documentation Planning (Planning Command Center §5). Tracks document
 * readiness BEFORE any file is uploaded — plan_document_checklist,
 * lazily seeded on first load from the same resolveRequiredTemplates()
 * catalog the shipment's own Documents tab uses (stage_key
 * 'documentation'), so both stay in sync with what was actually
 * required at quote time.
 */
export function DocumentationPlanningPanel({ shipmentId, branchId }: DocumentationPlanningPanelProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<PlanDocumentChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plan_document_checklist')
        .select(SELECT_COLUMNS)
        .eq('shipment_id', shipmentId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Error loading document checklist:', error);
        setItems([]);
        return;
      }
      let rows = (data as unknown as PlanDocumentChecklistItem[]) ?? [];

      if (rows.length === 0 && profile?.id) {
        const templates = await resolveRequiredTemplates(shipmentId, 'documentation');
        if (templates.length > 0) {
          const { error: seedError } = await supabase.from('plan_document_checklist').insert(
            templates.map((t) => ({
              shipment_id: shipmentId,
              branch_id: branchId,
              template_id: t.id,
              created_by: profile.id,
            }))
          );
          if (!seedError) {
            const { data: seeded } = await supabase
              .from('plan_document_checklist')
              .select(SELECT_COLUMNS)
              .eq('shipment_id', shipmentId)
              .order('created_at', { ascending: true });
            rows = (seeded as unknown as PlanDocumentChecklistItem[]) ?? [];
          }
        }
      }

      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [shipmentId, branchId, profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (item: PlanDocumentChecklistItem, patch: Record<string, unknown>) => {
    if (!profile?.id) return;
    setSavingId(item.id);
    try {
      const { error } = await supabase
        .from('plan_document_checklist')
        .update({ ...patch, updated_by: profile.id })
        .eq('id', item.id);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'planning.document_checklist_updated',
        entity_type: 'plan_document_checklist',
        entity_id: item.id,
        description: `${item.template?.name ?? item.custom_label ?? 'Document'} updated`,
        metadata: { shipment_id: shipmentId, status: patch.status ?? item.status },
      });

      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update document'));
    } finally {
      setSavingId(null);
    }
  };

  const handleAddCustom = async () => {
    if (!profile?.id || !customLabel.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('plan_document_checklist').insert({
        shipment_id: shipmentId,
        branch_id: branchId,
        custom_label: customLabel.trim(),
        created_by: profile.id,
      });
      if (error) throw error;
      toast.success('Document added');
      setAddOpen(false);
      setCustomLabel('');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add document'));
    } finally {
      setAdding(false);
    }
  };

  const satisfiedCount = items.filter((i) => i.status === 'received' || i.status === 'verified').length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <div>
          <CardTitle className="text-lg font-semibold">Documentation Planning</CardTitle>
          <p className="text-xs text-muted-foreground">
            {items.length > 0
              ? `${satisfiedCount} of ${items.length} documents ready`
              : 'No documents tracked yet'}
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Other Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Document</DialogTitle>
              <DialogDescription>Track a document not on the standard checklist.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Document Name</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Fumigation Certificate"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddCustom} disabled={adding || !customLabel.trim()}>
                {adding && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="No documents required"
            message="This shipment has no documentation checklist yet."
            compact
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Document No.</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.template?.name ?? item.custom_label}</TableCell>
                  <TableCell>
                    <Select
                      value={item.status}
                      onValueChange={(v) => handleUpdate(item, { status: v as ChecklistDocumentStatus })}
                      disabled={savingId === item.id}
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {CHECKLIST_DOCUMENT_STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={item.document_number ?? ''}
                      className="h-8 w-[140px]"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== item.document_number) handleUpdate(item, { document_number: v });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.uploaded_by_user?.full_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(item.upload_date)}</TableCell>
                  <TableCell>
                    <Input
                      defaultValue={item.remarks ?? ''}
                      className="h-8 w-[160px]"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== item.remarks) handleUpdate(item, { remarks: v });
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
