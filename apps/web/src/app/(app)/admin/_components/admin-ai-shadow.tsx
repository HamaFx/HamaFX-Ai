// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconChartDots, IconRefresh } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import type {
  AiShadowComparisonDTO,
  AiShadowComparisonSummaryDTO,
} from '@/lib/services/admin-dtos';

interface ShadowResponse {
  summary: AiShadowComparisonSummaryDTO;
  comparisons: AiShadowComparisonDTO[];
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function milliseconds(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}ms`;
}

function cost(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(4)}`;
}

function outcomeTone(outcome: AiShadowComparisonDTO['outcome']) {
  return outcome === 'completed' ? 'success' as const : 'danger' as const;
}

export function AdminAiShadow() {
  const [data, setData] = useState<ShadowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<ShadowResponse>('/api/admin/ai-shadow?hours=168&limit=100'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load AI comparisons';
      setError(message);
      toastApiError(err, message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading && !data) return <SkeletonCard lines={6} />;

  if (error && !data) {
    return (
      <SettingsSection title="AI Comparison" description="Mastra and legacy shadow results.">
        <p role="alert" className="text-danger text-sm">{error}</p>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void fetchData()}>Retry</Button>
      </SettingsSection>
    );
  }

  if (!data) return null;
  const { summary, comparisons } = data;

  return (
    <SettingsSection
      title="Mastra vs Legacy"
      description="Privacy-safe comparison aggregates from the last seven days. Raw prompts and responses are never stored here."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => void fetchData()} disabled={loading}>
            <IconRefresh className="size-4" aria-hidden="true" /> Refresh
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Comparisons', summary.total],
            ['Completed', summary.completed],
            ['Verified reports', summary.verifiedReports],
            ['Avg overlap', percent(summary.averageSharedTokenRatio)],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-border bg-bg-elev-1 rounded-sm border p-3">
              <p className="text-fg-subtle text-xs">{label}</p>
              <p className="text-fg mt-1 text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <p className="text-fg-subtle text-xs">Primary latency: <strong className="text-fg">{milliseconds(summary.averagePrimaryLatencyMs)}</strong></p>
          <p className="text-fg-subtle text-xs">Shadow latency: <strong className="text-fg">{milliseconds(summary.averageShadowLatencyMs)}</strong></p>
          <p className="text-fg-subtle text-xs">Primary / shadow cost: <strong className="text-fg">{cost(summary.averagePrimaryCostUsd)} / {cost(summary.averageShadowCostUsd)}</strong></p>
        </div>
        {comparisons.length === 0 ? (
          <EmptyState icon={<IconChartDots className="size-6" />} title="No comparisons yet" description="Use an eligible XAUUSD request in chat to create the first comparison." bare />
        ) : (
          <div className="border-border overflow-x-auto rounded-sm border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-bg-elev-2 text-fg-subtle"><tr><th className="px-3 py-2 text-left">Time</th><th className="px-3 py-2 text-left">Primary</th><th className="px-3 py-2 text-left">Outcome</th><th className="px-3 py-2 text-left">Overlap</th><th className="px-3 py-2 text-left">Mastra</th><th className="px-3 py-2 text-left">Timing</th><th className="px-3 py-2 text-left">Reason</th></tr></thead>
              <tbody>{comparisons.map((row) => <tr key={row.id} className="border-border border-t">
                <td className="text-fg-subtle px-3 py-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="text-fg px-3 py-2 font-medium">{row.primaryAgent}</td>
                <td className="px-3 py-2"><Badge tone={outcomeTone(row.outcome)}>{row.outcome}</Badge></td>
                <td className="text-fg-subtle px-3 py-2">{row.overlap ?? '—'}{row.sharedTokenRatio === null ? '' : ` (${percent(row.sharedTokenRatio)})`}</td>
                <td className="px-3 py-2"><Badge tone={row.mastraVerified ? 'success' : 'neutral'}>{row.mastraVerified ? 'verified' : 'not verified'}</Badge></td>
                <td className="text-fg-subtle px-3 py-2 text-xs">{milliseconds(row.primaryLatencyMs)} / {milliseconds(row.shadowLatencyMs)}</td>
                <td className="text-fg-subtle px-3 py-2">{row.failureReason ?? '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
