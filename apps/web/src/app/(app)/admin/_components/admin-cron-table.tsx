// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { IconHistory, IconDownload } from '@tabler/icons-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AdminErrorBlock } from './admin-error-block';
import { apiFetch } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import { formatRelativeTime, formatAbsoluteTime, downloadCSV } from '@/lib/format-number';
import type { CronRun } from '@/lib/services/admin-dtos';

const STATUS_TONE: Record<CronRun['status'], BadgeTone> = {
  done: 'success',
  error: 'danger',
  started: 'warn',
};

export function AdminCronTable() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<{ runs: CronRun[] }>('/api/admin/cron-history?days=7');
      setRuns(data.runs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cron history';
      setFetchError(msg);
      toastApiError(err, msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
  }, []);

  function handleExport() {
    downloadCSV(
      runs.map((r) => ({
        jobName: r.jobName,
        status: r.status,
        startedAt: r.startedAt,
        note: r.note ?? '',
      })),
      `cron-history-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Cron History" description="Recent cron job runs.">
        <AdminErrorBlock message={fetchError} onRetry={fetchRuns} />
      </SettingsSection>
    );
  }

  const description = 'Recent cron job runs.';

  return (
    <SettingsSection title="Cron History" description={description}>
      <div className="flex justify-end gap-2 pb-3">
        <Button variant="secondary" size="sm" onClick={fetchRuns}>
          Refresh
        </Button>
        {runs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <IconDownload className="size-4" aria-hidden="true" />
            CSV
          </Button>
        )}
      </div>
      <div className="border-border overflow-x-auto overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Job</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Started</th>
              <th className="px-4 py-2 text-left font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6">
                  <EmptyState
                    icon={<IconHistory className="size-6" />}
                    title="No cron runs found"
                    description="Cron job history from the last 7 days will appear here."
                    bare
                  />
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2">{run.jobName}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    <span title={formatAbsoluteTime(run.startedAt)}>
                      {formatRelativeTime(run.startedAt)}
                    </span>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">{run.note ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
