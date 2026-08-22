// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IconExternalLink,
  IconRefresh,
  IconStethoscope,
} from '@tabler/icons-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AdminErrorBlock } from './admin-error-block';
import { apiFetch } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import { formatRelativeTime, formatAbsoluteTime, formatNumber } from '@/lib/format-number';

interface MastraRunScore {
  scorerId: string;
  score: number;
  source: 'LIVE' | 'TEST';
  reason?: string;
}

interface MastraRunWorkflow {
  workflowId: string | null;
  status: string | null;
  failedSteps: string[];
  completedSteps: number;
  totalSteps: number;
}

interface MastraRun {
  runId: string;
  kind: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  createdAt: string;
  traceId: string | null;
  langfuseUrl: string | null;
  workflow: MastraRunWorkflow;
  scores: MastraRunScore[];
  scoreMean: number | null;
}

interface MastraRunsResponse {
  hours: number;
  count: number;
  failed: number;
  scored: number;
  runs: MastraRun[];
}

function runTone(run: MastraRun): BadgeTone {
  if (run.workflow.status === 'failed' || run.workflow.failedSteps.length > 0) return 'danger';
  if (run.kind?.endsWith('_failed')) return 'danger';
  if (run.workflow.status === 'running' || run.workflow.status === 'pending') return 'warn';
  return 'success';
}

function runStatusLabel(run: MastraRun): string {
  if (run.workflow.failedSteps.length > 0) return `failed@${run.workflow.failedSteps.join(',')}`;
  if (run.workflow.status) return run.workflow.status;
  if (run.kind?.endsWith('_failed')) return 'failed';
  return 'completed';
}

export function AdminMastraRuns() {
  const [runs, setRuns] = useState<MastraRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hours, setHours] = useState(72);

  const fetchRuns = useCallback(async (windowHours: number) => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<MastraRunsResponse>(`/api/admin/mastra-runs?hours=${windowHours}&limit=200`);
      setRuns(data.runs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Mastra runs';
      setFetchError(msg);
      toastApiError(err, msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRuns(hours);
  }, [hours, fetchRuns]);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Mastra Runs" description="Unified Mastra run observability (telemetry + workflow state + scores).">
        <AdminErrorBlock message={fetchError} onRetry={() => void fetchRuns(hours)} />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Mastra Runs"
      description="One row per Mastra run: which provider, what it cost, which stage failed, and whether it was grounded — all keyed by the same runId."
    >
      <div className="flex flex-wrap items-center justify-end gap-2 pb-3">
        <select
          aria-label="Time window"
          value={hours}
          onChange={(event) => setHours(Number(event.target.value))}
          className="border-border bg-bg-elev-2 text-fg rounded-sm border px-2 py-1 text-sm"
        >
          <option value={24}>Last 24h</option>
          <option value={72}>Last 3d</option>
          <option value={168}>Last 7d</option>
        </select>
        <Button variant="secondary" size="sm" onClick={() => void fetchRuns(hours)}>
          <IconRefresh className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>
      <div className="border-border overflow-x-auto overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Run</th>
              <th className="px-4 py-2 text-left font-medium">Kind</th>
              <th className="px-4 py-2 text-left font-medium">Model</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Steps</th>
              <th className="px-4 py-2 text-left font-medium">Scores</th>
              <th className="px-4 py-2 text-left font-medium">Cost</th>
              <th className="px-4 py-2 text-left font-medium">Latency</th>
              <th className="px-4 py-2 text-left font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6">
                  <EmptyState
                    icon={<IconStethoscope className="size-6" />}
                    title="No Mastra runs found"
                    description="Runs with a runId recorded in telemetry will appear here."
                    bare
                  />
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.runId} className="border-border border-t">
                  <td className="px-4 py-2">
                    <div className="text-fg font-mono text-xs" title={run.runId}>
                      {run.runId.slice(0, 12)}…
                    </div>
                    {run.langfuseUrl && (
                      <a
                        href={run.langfuseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand mt-0.5 inline-flex items-center gap-1 text-xs"
                      >
                        Langfuse <IconExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    )}
                  </td>
                  <td className="text-fg-subtle px-4 py-2">{run.kind ?? '—'}</td>
                  <td className="text-fg-subtle px-4 py-2">
                    <div>{run.model}</div>
                    <div className="text-fg-subtle/70 text-xs">{run.provider}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={runTone(run)}>{runStatusLabel(run)}</Badge>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    {run.workflow.workflowId
                      ? `${run.workflow.completedSteps}/${run.workflow.totalSteps}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {run.scores.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <Badge tone={run.scoreMean !== null && run.scoreMean >= 0.8 ? 'success' : 'warn'}>
                          {run.scoreMean !== null ? formatNumber(run.scoreMean) : '—'}
                        </Badge>
                        <span className="text-fg-subtle text-xs">
                          {run.scores.map((score) => score.scorerId).join(', ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="text-fg-subtle px-4 py-2">${run.estCostUsd.toFixed(4)}</td>
                  <td className="text-fg-subtle px-4 py-2">{formatNumber(run.ms)} ms</td>
                  <td className="text-fg-subtle px-4 py-2">
                    <span title={formatAbsoluteTime(run.createdAt)}>
                      {formatRelativeTime(run.createdAt)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {runs.length > 0 && (
        <p className="text-fg-subtle pt-2 text-xs">
          {runs.length} runs · {runs.filter((run) => run.scores.length > 0).length} scored ·{' '}
          {runs.filter((run) => runTone(run) === 'danger').length} failed
        </p>
      )}
    </SettingsSection>
  );
}
