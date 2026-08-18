// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconBug, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';

type RegressionStatus = 'open' | 'resolved' | 'dismissed';

interface RegressionCase {
  id: string;
  feedbackId: string;
  threadId: string;
  messageId: string;
  promptSha256: string;
  assistantOutputSha256: string;
  issueCodes: string[];
  reviewerNote: string | null;
  status: RegressionStatus;
  createdAt: string;
  updatedAt: string;
}

function statusTone(status: RegressionStatus) {
  if (status === 'open') return 'danger' as const;
  if (status === 'resolved') return 'success' as const;
  return 'neutral' as const;
}

export function AdminRegressionCases() {
  const [rows, setRows] = useState<RegressionCase[]>([]);
  const [status, setStatus] = useState<RegressionStatus | ''>('open');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const query = status ? `?limit=100&status=${status}` : '?limit=100';
      const data = await apiFetch<{ cases: RegressionCase[] }>(`/api/admin/regression-cases${query}`);
      setRows(data.cases);
    } catch (error) {
      toastApiError(error, 'Failed to load regression cases');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  async function update(row: RegressionCase, nextStatus: RegressionStatus) {
    setSavingId(row.id);
    try {
      await apiMutate(`/api/admin/regression-cases/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`Regression case marked ${nextStatus}`);
      await fetchRows();
    } catch (error) {
      toastApiError(error, 'Failed to update regression case');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <SkeletonCard lines={5} />;

  return (
    <SettingsSection
      title="AI Regression Cases"
      description="Reviewed failures become repeatable cases without copying conversation text into this queue."
    >
      <div className="mb-3 flex items-center gap-2">
        <label className="text-fg-subtle text-xs" htmlFor="regression-status-filter">Status</label>
        <select
          id="regression-status-filter"
          className="bg-bg-elev-1 border-border rounded-sm border px-2 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as RegressionStatus | '')}
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All</option>
        </select>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => void fetchRows()}>
          <IconRefresh className="size-4" aria-hidden="true" /> Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconBug className="size-6" />}
          title="No regression cases"
          description="Mark a reviewed feedback item as a failure to create one automatically."
          bare
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <article key={row.id} className="border-border bg-bg-elev-1 rounded-sm border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                {row.issueCodes.map((code) => <Badge key={code} tone="warn">{code}</Badge>)}
                <span className="text-fg-subtle ml-auto text-xs">{new Date(row.updatedAt).toLocaleString()}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <p className="text-fg-subtle">Feedback: <code className="text-fg">{row.feedbackId}</code></p>
                <p className="text-fg-subtle">Message: <code className="text-fg">{row.messageId}</code></p>
                <p className="text-fg-subtle truncate" title={row.promptSha256}>Prompt hash: <code className="text-fg">{row.promptSha256}</code></p>
                <p className="text-fg-subtle truncate" title={row.assistantOutputSha256}>Answer hash: <code className="text-fg">{row.assistantOutputSha256}</code></p>
              </div>
              {row.reviewerNote && <p className="text-fg mt-3 text-sm">Reviewer note: {row.reviewerNote}</p>}
              <div className="mt-3 flex justify-end gap-2">
                {row.status === 'open' && <Button type="button" size="sm" disabled={savingId === row.id} onClick={() => void update(row, 'resolved')}>Mark resolved</Button>}
                {row.status !== 'dismissed' && <Button type="button" variant="ghost" size="sm" disabled={savingId === row.id} onClick={() => void update(row, 'dismissed')}>Dismiss</Button>}
                {row.status !== 'open' && <Button type="button" variant="secondary" size="sm" disabled={savingId === row.id} onClick={() => void update(row, 'open')}>Reopen</Button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
