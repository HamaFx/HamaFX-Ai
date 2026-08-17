// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconDatabase, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';

interface DatasetRow {
  id: string;
  version: string;
  status: 'draft' | 'in_review' | 'approved' | 'archived';
  recordCount: number;
  contentSha256: string;
  source: string;
  provenance: Record<string, unknown>;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

function statusTone(status: DatasetRow['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'in_review') return 'warn' as const;
  if (status === 'archived') return 'neutral' as const;
  return 'brand' as const;
}

export function AdminDatasetReview() {
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ datasets: DatasetRow[] }>('/api/admin/eval-datasets?limit=50');
      setRows(data.datasets);
    } catch (error) {
      toastApiError(error, 'Failed to load dataset registry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  async function transition(row: DatasetRow, status: DatasetRow['status']) {
    try {
      await apiMutate(`/api/admin/eval-datasets/${encodeURIComponent(row.version)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      toast.success(`Dataset ${row.version} moved to ${status}`);
      await fetchRows();
    } catch (error) {
      toastApiError(error, 'Dataset transition failed');
    }
  }

  if (loading) return <SkeletonCard lines={5} />;

  return (
    <SettingsSection title="Evaluation Datasets" description="Content-addressed dataset versions with explicit provenance and approval state.">
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => void fetchRows()}><IconRefresh className="size-4" aria-hidden="true" />Refresh</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<IconDatabase className="size-6" />} title="No dataset versions" description="Register a manifest after generating a reviewable export." bare />
      ) : (
        <div className="border-border overflow-x-auto rounded-sm border">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-bg-elev-2 text-fg-subtle"><tr><th className="px-3 py-2 text-left">Version</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Records</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Content hash</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-border border-t align-top">
                  <td className="text-fg px-3 py-3 font-mono text-xs">{row.version}</td>
                  <td className="px-3 py-3"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
                  <td className="text-fg-subtle px-3 py-3 tabular-nums">{row.recordCount}</td>
                  <td className="text-fg-subtle px-3 py-3">{row.source}</td>
                  <td className="text-fg-subtle max-w-48 truncate px-3 py-3 font-mono text-xs" title={row.contentSha256}>{row.contentSha256}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{row.status === 'draft' && <Button type="button" size="sm" variant="secondary" onClick={() => void transition(row, 'in_review')}>Submit review</Button>}{row.status === 'in_review' && <Button type="button" size="sm" onClick={() => void transition(row, 'approved')}>Approve</Button>}{row.status === 'approved' && <Button type="button" size="sm" variant="ghost" onClick={() => void transition(row, 'archived')}>Archive</Button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSection>
  );
}
