/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
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

  const fetchRuns = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/cron-history?days=7');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { runs: CronRun[] };
      setRuns(data.runs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cron history';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Cron History" description="Recent cron job runs.">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-danger">{fetchError}</p>
          <button type="button" onClick={fetchRuns} className="text-sm text-fg underline hover:no-underline">
            Retry
          </button>
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
                <td colSpan={4} className="text-fg-subtle px-4 py-4 text-center">
                  No cron runs found.
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
