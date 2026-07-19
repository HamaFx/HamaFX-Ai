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

// PR-06: System Health dashboard — SLI/SLO monitoring for administrators.
//
// Displays real-time service level indicators, error budget gauges,
// and anomaly alerts. Data comes from /api/admin/health-slo which
// computes everything from existing telemetry tables.

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  IconDatabase,
  IconActivity,
  IconClock,
  IconTool,
  IconMessage,
  IconRefresh,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconMinus,
  IconChartDots,
  IconInfoCircle,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { cn } from '@/lib/cn';

// ── Types ────────────────────────────────────────────────────────────────

interface SliSnapshot {
  key: string;
  label: string;
  current: number | null;
  sloTarget: number;
  window: string;
  success: number;
  total: number;
  errorBudget: number | null;
  informational?: boolean;
  details?: string;
}

interface HealthSloData {
  ts: string;
  dbLatencyMs: number;
  dbOk: boolean;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  langfuseActive: boolean;
  langfuseBaseUrl: string | null;
  slis: SliSnapshot[];
  anomalies: string[];
}

// ── Icon map ─────────────────────────────────────────────────────────────

const SLI_ICONS: Record<string, typeof IconDatabase> = {
  worker_ticks: IconActivity,
  cron_jobs: IconClock,
  ai_gateway: IconTool,
  chat_api: IconMessage,
};

// ── Sub-components ───────────────────────────────────────────────────────

/** Large overall status banner at the top. */
function OverallBanner({ data }: { data: HealthSloData }) {
  const { overall, dbLatencyMs, dbOk, ts, langfuseActive, langfuseBaseUrl } = data;

  const statusConfig = {
    healthy: {
      Icon: IconCircleCheck,
      label: 'All Systems Healthy',
      bg: 'bg-success/5 border-success/25',
      text: 'text-success',
      dot: 'bg-success',
    },
    degraded: {
      Icon: IconAlertTriangle,
      label: 'System Degraded',
      bg: 'bg-warn/5 border-warn/25',
      text: 'text-warn',
      dot: 'bg-warn',
    },
    unhealthy: {
      Icon: IconCircleX,
      label: 'System Unhealthy',
      bg: 'bg-danger/5 border-danger/25',
      text: 'text-danger',
      dot: 'bg-danger',
    },
  } as const;

  const config = statusConfig[overall];

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between',
        config.bg,
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn('relative flex size-10 items-center justify-center rounded-full', config.bg)}>
          <span className={cn('absolute size-3 rounded-full animate-pulse', config.dot)} />
          <config.Icon className={cn('relative size-5', config.text)} aria-hidden="true" />
        </span>
        <div>
          <p className={cn('text-lg font-bold', config.text)}>{config.label}</p>
          <p className="text-fg-subtle text-xs">
            Last checked: {new Date(ts).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 rounded-sm bg-bg-elev-2 px-2 py-1">
          <IconDatabase className="size-3 text-fg-subtle" aria-hidden="true" />
          <span className="text-fg-subtle">DB:</span>
          <span className={cn('font-mono font-bold', dbOk ? 'text-success' : 'text-danger')}>
            {dbOk ? `${dbLatencyMs}ms` : 'DOWN'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-sm bg-bg-elev-2 px-2 py-1">
          <IconChartDots className="size-3 text-fg-subtle" aria-hidden="true" />
          <span className="text-fg-subtle">Tracing:</span>
          {langfuseActive && langfuseBaseUrl ? (
            <a
              href={langfuseBaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-success font-mono font-bold underline hover:no-underline"
            >
              Langfuse
            </a>
          ) : (
            <span className="text-fg-subtle font-mono font-bold">Off</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Error budget gauge — shows how much error budget remains.
 * Green (>50%), Yellow (10-50%), Red (<10% or exhausted).
 */
function ErrorBudgetGauge({ budget }: { budget: number | null }) {
  if (budget === null) {
    return (
      <span className="text-fg-subtle text-xs" aria-label="No data available">
        <IconMinus className="inline size-3" aria-hidden="true" /> N/A
      </span>
    );
  }

  const pct = Math.round(budget * 100);
  const color =
    pct > 50 ? 'text-success' : pct > 10 ? 'text-warn' : 'text-danger';
  const barColor =
    pct > 50
      ? 'bg-success'
      : pct > 10
        ? 'bg-warn'
        : 'bg-danger';

  return (
    <div className="flex items-center gap-2" aria-label={`Error budget: ${pct}% remaining`}>
      <div className="bg-bg-elev-3 h-2 w-16 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className={cn('text-xs font-mono font-bold', color)}>{pct}%</span>
    </div>
  );
}

/** Single SLI card with icon, gauge, and details. */
function SliCard({ sli }: { sli: SliSnapshot }) {
  const Icon = SLI_ICONS[sli.key] ?? IconActivity;
  const isInformational = sli.informational === true;
  const successRate =
    sli.current !== null ? `${Math.round(sli.current * 10000) / 100}%` : 'No data';
  const sloTargetPct = `${Math.round(sli.sloTarget * 10000) / 100}%`;

  const isOk = sli.current !== null && sli.current >= sli.sloTarget;
  const noData = sli.current === null;
  const statusColor = noData
    ? 'text-fg-subtle'
    : isInformational
      ? 'text-fg-subtle'
      : isOk
        ? 'text-success'
        : 'text-danger';
  const statusDot = noData
    ? 'bg-fg-subtle'
    : isInformational
      ? 'bg-fg-subtle'
      : isOk
        ? 'bg-success'
        : 'bg-danger';
  const borderColor = noData
    ? 'border-border'
    : isInformational
      ? 'border-border'
      : isOk
        ? 'border-success/20'
        : 'border-danger/20';

  return (
    <div className={cn('rounded-lg border p-4 transition-colors', borderColor)}>
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('size-2 rounded-full', statusDot)} aria-hidden="true" />
        {isInformational ? (
          <IconInfoCircle className="size-4 text-fg-subtle" aria-hidden="true" />
        ) : (
          <Icon className="size-4 text-fg-subtle" aria-hidden="true" />
        )}
        <h3 className="text-fg text-sm font-semibold truncate">{sli.label}</h3>
        {isInformational && (
          <span className="text-fg-subtle rounded-sm bg-bg-elev-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            Sentry
          </span>
        )}
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold font-mono', isInformational ? 'text-fg-subtle' : statusColor)}>
          {isInformational ? '—' : successRate}
        </span>
        <span className="text-fg-subtle text-xs">/ SLO {sloTargetPct}</span>
      </div>

      {sli.details && (
        <p className="text-fg-subtle mb-2 text-xs">{sli.details}</p>
      )}

      <div className="flex items-center gap-2 border-border border-t pt-2">
        <span className="text-fg-subtle text-xs">Budget:</span>
        {isInformational ? (
          <span className="text-fg-subtle text-xs">via Sentry</span>
        ) : (
          <ErrorBudgetGauge budget={sli.errorBudget} />
        )}
      </div>
    </div>
  );
}

/** Anomaly alert list. */
function AnomalyList({ anomalies }: { anomalies: string[] }) {
  if (anomalies.length === 0) return null;

  return (
    <div className="bg-warn/5 border-warn/25 rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <IconAlertTriangle className="text-warn size-4" aria-hidden="true" />
        <h3 className="text-warn text-sm font-semibold">
          {anomalies.length} Anomal{anomalies.length === 1 ? 'y' : 'ies'} Detected
        </h3>
      </div>
      <ul className="space-y-1">
        {anomalies.map((a, i) => (
          <li key={i} className="text-fg-subtle text-xs flex items-start gap-1.5">
            <span className="text-warn mt-0.5 shrink-0">•</span>
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export function AdminSystemHealth() {
  const [data, setData] = useState<HealthSloData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/health-slo');
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as HealthSloData;
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load system health';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      void fetchHealth();
    }, 30_000);

    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading && !data) {
    return (
      <SettingsSection title="System Health" description="Real-time SLI/SLO monitoring.">
        <SkeletonCard lines={6} />
      </SettingsSection>
    );
  }

  if (fetchError && !data) {
    return (
      <SettingsSection title="System Health" description="Real-time SLI/SLO monitoring.">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-danger">{fetchError}</p>
          <button
            type="button"
            onClick={fetchHealth}
            className="text-sm text-fg underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </SettingsSection>
    );
  }

  if (!data) return null;

  return (
    <SettingsSection
      title="System Health"
      description={`SLI metrics over the last ${data.slis[0]?.window ?? '24h'}. Refreshes every 30s.`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={fetchHealth}
            disabled={loading}
            className="text-fg-subtle hover:text-fg flex items-center gap-1 text-xs transition-colors"
            aria-label="Refresh health data"
          >
            <IconRefresh className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </div>
        <OverallBanner data={data} />

        <AnomalyList anomalies={data.anomalies} />

        {/* SLI Cards Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.slis.map((sli) => (
            <SliCard key={sli.key} sli={sli} />
          ))}
        </div>

        {/* Summary Footer */}
        <div className="border-border rounded-lg border p-4">
          <p className="text-fg-subtle text-xs">
            SLO targets from{' '}
            <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">docs/INCIDENT-RESPONSE.md §2</code>.
            Error budget = (current − target) / (1 − target). When budget is exhausted, freeze
            non-critical deploys.
            {data.langfuseActive && data.langfuseBaseUrl && (
              <>
                {' '}Langfuse tracing is active —{' '}
                <a
                  href={data.langfuseBaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  open LLM traces
                </a>
                .
              </>
            )}
            {!data.langfuseActive && (
              <>
                {' '}Langfuse tracing is off — set <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">LANGFUSE_PUBLIC_KEY</code>,{' '}
                <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">LANGFUSE_SECRET_KEY</code>,{' '}
                <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">LANGFUSE_BASE_URL</code> to
                enable LLM observability.
              </>
            )}
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
