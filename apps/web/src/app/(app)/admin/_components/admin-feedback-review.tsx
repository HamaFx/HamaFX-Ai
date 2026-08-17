// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconMessageReport, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';

interface FeedbackRow {
  id: string;
  userId: string;
  threadId: string;
  messageId: string;
  traceId: string | null;
  rating: 'positive' | 'negative';
  userNote: string | null;
  reviewStatus: 'unreviewed' | 'in_review' | 'reviewed' | 'rejected';
  reviewerLabel: 'pass' | 'fail' | 'needs_review' | null;
  issueCodes: string[] | null;
  reviewerNote: string | null;
  updatedAt: string;
}

const issueOptions = ['hallucination', 'wrong_number', 'bad_tool_choice', 'unsafe_advice', 'bad_citation', 'poor_reasoning', 'other'];

export function AdminFeedbackReview() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('unreviewed');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ feedback: FeedbackRow[] }>(`/api/admin/feedback?limit=50&status=${statusFilter}`);
      setRows(data.feedback);
    } catch (error) {
      toastApiError(error, 'Failed to load AI feedback');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  async function save(row: FeedbackRow, form: HTMLFormElement) {
    const data = new FormData(form);
    const issueCodes = issueOptions.filter((code) => data.get(`issue-${row.id}-${code}`) === 'on');
    setSavingId(row.id);
    try {
      await apiMutate(`/api/admin/feedback/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: data.get(`status-${row.id}`),
          label: data.get(`label-${row.id}`),
          issueCodes,
          reviewerNote: data.get(`note-${row.id}`) ?? undefined,
        }),
      });
      toast.success('Review saved');
      await fetchRows();
    } catch (error) {
      toastApiError(error, 'Failed to save review');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <SkeletonCard lines={5} />;

  return (
    <SettingsSection title="AI Feedback Review" description="Review user ratings, classify failures, and approve records for governed evaluation datasets.">
      <div className="mb-3 flex items-center gap-2">
        <label className="text-fg-subtle text-xs" htmlFor="feedback-status-filter">Queue</label>
        <select id="feedback-status-filter" className="bg-bg-elev-1 border-border rounded-sm border px-2 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="unreviewed">Unreviewed</option>
          <option value="in_review">In review</option>
          <option value="reviewed">Reviewed</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => void fetchRows()}><IconRefresh className="size-4" aria-hidden="true" />Refresh</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<IconMessageReport className="size-6" />} title="No feedback in this queue" description="User ratings will appear here after assistant responses are reviewed." bare />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <form key={row.id} onSubmit={(event) => { event.preventDefault(); void save(row, event.currentTarget); }} className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={row.rating === 'negative' ? 'danger' : 'success'}>{row.rating}</Badge>
                <Badge tone="neutral">{row.reviewStatus}</Badge>
                <span className="text-fg-subtle font-mono text-xs">message {row.messageId}</span>
                {row.traceId && <span className="text-fg-subtle font-mono text-xs">trace {row.traceId}</span>}
              </div>
              {row.userNote && <p className="text-fg text-sm">User note: {row.userNote}</p>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-fg-subtle flex flex-col gap-1 text-xs">Status
                  <select name={`status-${row.id}`} defaultValue={row.reviewStatus} className="bg-bg border-border rounded-sm border px-2 py-2 text-sm text-fg">
                    <option value="unreviewed">Unreviewed</option><option value="in_review">In review</option><option value="reviewed">Reviewed</option><option value="rejected">Rejected</option>
                  </select>
                </label>
                <label className="text-fg-subtle flex flex-col gap-1 text-xs">Label
                  <select name={`label-${row.id}`} defaultValue={row.reviewerLabel ?? 'needs_review'} className="bg-bg border-border rounded-sm border px-2 py-2 text-sm text-fg">
                    <option value="pass">Pass</option><option value="fail">Fail</option><option value="needs_review">Needs review</option>
                  </select>
                </label>
              </div>
              <fieldset className="flex flex-wrap gap-x-3 gap-y-2">
                <legend className="text-fg-subtle mb-1 w-full text-xs">Issue taxonomy</legend>
                {issueOptions.map((code) => <label key={code} className="text-fg-subtle inline-flex items-center gap-1 text-xs"><input type="checkbox" name={`issue-${row.id}-${code}`} value="on" defaultChecked={row.issueCodes?.includes(code)} />{code.replaceAll('_', ' ')}</label>)}
              </fieldset>
              <label className="text-fg-subtle flex flex-col gap-1 text-xs">Reviewer note<textarea name={`note-${row.id}`} defaultValue={row.reviewerNote ?? ''} maxLength={4_000} className="bg-bg border-border min-h-16 rounded-sm border p-2 text-sm text-fg" /></label>
              <div className="flex justify-end"><Button type="submit" size="sm" disabled={savingId === row.id}>{savingId === row.id ? 'Saving…' : 'Save review'}</Button></div>
            </form>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
