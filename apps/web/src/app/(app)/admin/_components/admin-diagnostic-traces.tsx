// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconStethoscope } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';

interface DiagnosticTraceSummary {
  id: string;
  threadId: string;
  userId: string;
  startedAt: string;
  finishedAt: string | null;
  stepCount: number;
  errorCount: number;
}

export function AdminDiagnosticTraces() {
  const [traces, setTraces] = useState<DiagnosticTraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ traces: DiagnosticTraceSummary[] }>(
        '/api/admin/diagnostics/traces?limit=20',
      );
      setTraces(data.traces);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error('Failed to load diagnostic traces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (error) {
    return (
      <SettingsSection title="Diagnostic Traces" description="Recent chat diagnostic traces.">
        <div className="border-border bg-bg-elev-1 flex flex-col items-center gap-3 rounded-sm border p-6">
          <p className="text-danger text-sm">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void fetchTraces()}>
            Retry
          </Button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Diagnostic Traces" description="Recent chat diagnostic traces.">
      <div className="border-border overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Thread</th>
              <th className="px-4 py-2 text-left font-medium">Steps</th>
              <th className="px-4 py-2 text-left font-medium">Errors</th>
              <th className="px-4 py-2 text-left font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6">
                  <EmptyState
                    icon={<IconStethoscope className="size-6" />}
                    title="No traces found"
                    description="Diagnostic traces will appear here after chat sessions complete."
                    bare
                  />
                </td>
              </tr>
            ) : (
              traces.map((trace) => (
                <tr key={trace.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2 font-mono text-xs">{trace.threadId}</td>
                  <td className="text-fg-subtle px-4 py-2 tabular-nums">{trace.stepCount}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                        trace.errorCount > 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success',
                      )}
                    >
                      {trace.errorCount}
                    </span>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    {new Date(trace.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
