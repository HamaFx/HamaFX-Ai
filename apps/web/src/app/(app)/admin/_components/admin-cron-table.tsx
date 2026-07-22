// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { IconHistory } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

interface CronRun {
  id: string;
  jobName: string;
  status: 'started' | 'done' | 'error';
  note: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export function AdminCronTable() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // H-3: migrated from raw `fetch` + `await res.text()` to the typed
  // `apiFetch` wrapper. The wrapper parses the standard error envelope,
  // throws `ApiError` with `code`/`status`/`requestId`, and handles
  // timeout/network errors. The `requestId` is surfaced in the toast
  // description so bug reports are traceable to a single server log line.
  const fetchRuns = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<{ runs: CronRun[] }>('/api/admin/cron-history?days=7');
      setRuns(data.runs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cron history';
      setFetchError(msg);
      if (err instanceof ApiError && err.requestId) {
        toast.error(msg, { description: `Ref: ${err.requestId}` });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
  }, []);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Cron History" description="Recent cron job runs.">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-danger">{fetchError}</p>
          <Button variant="secondary" size="sm" onClick={fetchRuns}>
            Retry
          </Button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Cron History" description="Recent cron job runs.">
      <div className="border-border overflow-hidden rounded-sm border">
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
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                        run.status === 'done'
                          ? 'bg-success/10 text-success'
                          : run.status === 'error'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-warn/10 text-warn',
                      )}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    {new Date(run.startedAt).toLocaleString()}
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
