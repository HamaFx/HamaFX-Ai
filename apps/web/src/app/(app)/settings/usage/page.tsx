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

// /settings/usage — token spend, daily-budget gauge, model breakdown,
// recent turns. Server component: pulls everything from the DB in one
// pass per render. Personal-mode volume keeps the query trivial.

import {
  computeUsage,
  listTelemetry,
  type DayBucket,
  type UsageStats,
  getMonthlySpend,
  providerIdFromModel,
  BYOK_PROVIDERS_LIST,
} from '@hamafx/ai';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { IconChartBar } from '@tabler/icons-react';

import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';
import { getServerEnv } from '@/lib/env';
import { formatRelative } from '@/lib/format';
import { getDb, schema } from '@hamafx/db';
import { eq, gte, and } from 'drizzle-orm';
import { UsageLimitsForm } from './_components/usage-limits-form';

export const metadata: Metadata = { title: 'Usage | HamaFX' };
export const revalidate = 60;

export default async function UsagePage() {
  // Pull env synchronously — if it's missing we still want to render the
  // shell so the user sees what's been recorded so far.
  let maxDailyUsd = 5;
  try {
    maxDailyUsd = getServerEnv().MAX_DAILY_USD;
  } catch {
    console.warn('[settings] MAX_DAILY_USD not configured, using default 5');
  }

  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const db = getDb();
  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [stats, recent, settings, mtdRows, monthlySpend, agentOpinionRows] = await Promise.all([
    computeUsage(session.user.id),
    listTelemetry(session.user.id, 20),
    db
      .select({
        monthlyBudgetLimit: schema.userSettings.monthlyBudgetLimit,
        providerSpendingThresholds: schema.userSettings.providerSpendingThresholds,
        spendAlertsConfig: schema.userSettings.spendAlertsConfig,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, session.user.id))
      .then((rows) => rows[0] ?? null),
    db
      .select({
        model: schema.chatTelemetry.model,
        estCostUsd: schema.chatTelemetry.estCostUsd,
      })
      .from(schema.chatTelemetry)
      .where(
        and(
          eq(schema.chatTelemetry.userId, session.user.id),
          gte(schema.chatTelemetry.createdAt, startOfMonth)
        )
      ),
    getMonthlySpend(session.user.id),
    db
      .select({
        agentName: schema.agentOpinions.agentName,
        analysisMode: schema.agentOpinions.analysisMode,
        costUsd: schema.agentOpinions.costUsd,
        latencyMs: schema.agentOpinions.latencyMs,
      })
      .from(schema.agentOpinions)
      .where(
        and(
          eq(schema.agentOpinions.userId, session.user.id),
          gte(schema.agentOpinions.createdAt, startOfMonth)
        )
      ),
  ]);

  const KNOWN_BYOK_PROVIDERS = new Set([
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
    'iamhc',
  ]);

  const canonicalizeProviderId = (prefix: string) => {
    if (prefix === '') return 'google';
    if (prefix === 'google-vertex') return 'vertex';
    if (KNOWN_BYOK_PROVIDERS.has(prefix)) return prefix;
    return null;
  };

  const spendByProvider: Record<string, number> = {};
  for (const r of mtdRows) {
    const rawPrefix = providerIdFromModel(r.model);
    const byokId = canonicalizeProviderId(rawPrefix);
    if (byokId) {
      spendByProvider[byokId] = (spendByProvider[byokId] ?? 0) + Number(r.estCostUsd ?? 0);
    }
  }

  const providers = BYOK_PROVIDERS_LIST.map((p) => {
    return {
      id: p.id,
      displayName: p.displayName,
      currentSpend: spendByProvider[p.id] ?? 0,
      threshold: settings?.providerSpendingThresholds?.[p.id] ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <BudgetCard
        stats={stats}
        maxDailyUsd={maxDailyUsd}
        monthlySpend={monthlySpend}
        monthlyLimit={settings?.monthlyBudgetLimit ?? null}
      />

      <UsageLimitsForm
        initialMonthlyLimit={settings?.monthlyBudgetLimit ?? null}
        initialAlertConfig={{
          email: !!settings?.spendAlertsConfig?.email,
          telegram: !!settings?.spendAlertsConfig?.telegram,
        }}
        providers={providers}
      />

      {stats.thirtyDayTurns === 0 ? (
        <EmptyState
          icon={<IconChartBar className="size-6" />}
          title="No usage recorded yet"
          description="Start interacting with the AI to see token usage, spend, and cost analysis here."
          action={
            <Link
              href="/chat"
              className="bg-fg text-black inline-flex h-9 items-center rounded-sm px-3 text-sm font-medium hover:opacity-90"
            >
              Start chatting
            </Link>
          }
        />
      ) : (
        <>
          <DailyChart daily7={stats.daily7} />
          <ModelBreakdownCard stats={stats} />
          {agentOpinionRows.length > 0 && (
            <AgentUsageCard rows={agentOpinionRows} />
          )}
          <RecentTurnsCard rows={recent} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's spend + daily-budget gauge + monthly budget limit and projection
// ---------------------------------------------------------------------------

function BudgetCard({
  stats,
  maxDailyUsd,
  monthlySpend,
  monthlyLimit,
}: {
  stats: UsageStats;
  maxDailyUsd: number;
  monthlySpend: number;
  monthlyLimit: number | null;
}) {
  const pct = Math.min(100, (stats.todayUsd / maxDailyUsd) * 100);
  const tone = pct >= 90 ? 'danger' : pct >= 60 ? 'warn' : 'success';
  const toneClass = tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-success';

  const projection = (stats.sevenDayUsd / 7) * 30;
  const isProjectedExceeded = monthlyLimit ? projection > monthlyLimit : false;

  return (
    <section
      aria-labelledby="usage-budget-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="usage-budget-heading" className="text-fg-muted text-sm font-medium">
          Today (UTC)
        </h2>
        <span className="text-fg-subtle text-xs tabular-nums">
          ${stats.todayUsd.toFixed(4)} / ${maxDailyUsd.toFixed(2)}
        </span>
      </header>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Daily budget consumed"
        className="bg-bg-elev-2 h-2 w-full overflow-hidden rounded-sm"
      >
        <div className={cn('h-full transition-all', toneClass)} style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-3 gap-3 pt-1 text-xs tabular-nums border-b border-divider pb-3">
        <Stat label="last 7d" value={`$${stats.sevenDayUsd.toFixed(4)}`} />
        <Stat label="last 30d" value={`$${stats.thirtyDayUsd.toFixed(4)}`} />
        <Stat label="turns" value={stats.thirtyDayTurns} />
      </dl>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-baseline text-xs">
          <span className="text-fg-muted">Current Month Spend (MTD)</span>
          <span className="font-semibold text-fg font-mono tabular-nums">
            ${monthlySpend.toFixed(2)} {monthlyLimit ? `/ $${monthlyLimit.toFixed(2)}` : ''}
          </span>
        </div>
        <div className="flex justify-between items-baseline text-xs">
          <span className="text-fg-muted">Estimated Month Projection (based on 7d)</span>
          <span className={cn("font-semibold font-mono tabular-nums", isProjectedExceeded ? "text-warn" : "text-fg")}>
            ${projection.toFixed(2)}
          </span>
        </div>
        {isProjectedExceeded && (
          <div className="bg-warn/5 border border-warn/25 rounded-sm p-2.5 text-caption text-warn mt-1">
            ⚠️ Based on the last 7 days of usage, you are projected to exceed your monthly budget limit of ${monthlyLimit?.toFixed(2)}. Consider reviewing your active tools or adjusting your budget.
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-fg-subtle text-caption uppercase tracking-wide">{label}</dt>
      <dd className="text-fg font-semibold">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily chart — text-based bars, no extra deps. Tabular numerals so columns
// line up. Empty days render a 1px line so they're visible but tiny.
// ---------------------------------------------------------------------------

function DailyChart({ daily7 }: { daily7: DayBucket[] }) {
  const activeDays = daily7.filter((d) => d.costUsd > 0 || d.turns > 0);
  if (activeDays.length === 0) {
    return null;
  }
  const max = Math.max(0.0001, ...activeDays.map((d) => d.costUsd));

  return (
    <section
      aria-labelledby="usage-daily-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"
    >
      <h2 id="usage-daily-heading" className="text-fg-muted text-sm font-medium">
        Last 7 days
      </h2>
      <ul className="flex flex-col gap-1.5">
        {activeDays.map((d) => {
          const pct = Math.max(1, (d.costUsd / max) * 100);
          return (
            <li
              key={d.date}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-body-sm"
            >
              <span className="text-fg-subtle w-12 tabular-nums">{shortDate(d.date)}</span>
              <span
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${d.turns} turns, $${d.costUsd.toFixed(4)} spent`}
                className="bg-fg block h-1.5 rounded-sm"
                style={{ width: `${pct}%` }}
              />
              <span className="text-fg-muted w-20 text-right tabular-nums">
                ${d.costUsd.toFixed(4)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Per-model breakdown
// ---------------------------------------------------------------------------

function ModelBreakdownCard({ stats }: { stats: UsageStats }) {
  if (stats.byModel.length === 0) {
    return (
      <section
        aria-labelledby="usage-models-heading"
        className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-2 p-4"
      >
        <h2 id="usage-models-heading" className="text-fg-muted text-sm font-medium">
          By model (30d)
        </h2>
        <p className="text-fg-subtle text-xs">No turns recorded yet.</p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="usage-models-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"
    >
      <h2 id="usage-models-heading" className="text-fg-muted text-sm font-medium">
        By model (30d)
      </h2>
      <ul className="flex flex-col gap-1.5">
        {stats.byModel.map((m) => (
          <li
            key={m.model}
            className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 text-xs tabular-nums"
          >
            <span className="text-fg truncate font-mono text-body-sm">{m.model}</span>
            <span className="text-fg-subtle">{m.turns} turns</span>
            <span className="text-fg-subtle">
              {(m.inputTokens + m.outputTokens).toLocaleString()} tok
            </span>
            <span className="text-fg w-16 text-right">${m.costUsd.toFixed(4)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent turns
// ---------------------------------------------------------------------------

function RecentTurnsCard({ rows }: { rows: Awaited<ReturnType<typeof listTelemetry>> }) {
  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="usage-recent-heading"
        className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-2 p-4"
      >
        <h2 id="usage-recent-heading" className="text-fg-muted text-sm font-medium">
          Recent turns
        </h2>
        <p className="text-fg-subtle text-xs">
          Nothing yet — start a conversation in <code>/chat</code>.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="usage-recent-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"
    >
      <h2 id="usage-recent-heading" className="text-fg-muted text-sm font-medium">
        Recent turns
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-3 text-xs tabular-nums"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-fg truncate font-mono text-body-sm">{r.model}</span>
              <span className="text-fg-subtle text-caption">
                {formatRelative(r.createdAt)} · {r.inputTokens}/{r.outputTokens} tok · {r.toolCalls}{' '}
                tools · {Math.round(r.ms / 100) / 10}s
              </span>
            </div>
            <span className="text-fg w-16 text-right">${r.estCostUsd.toFixed(4)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Multi-Agent: per-agent and per-mode cost breakdown
// ---------------------------------------------------------------------------

function AgentUsageCard({ rows }: {
  rows: Array<{ agentName: string; analysisMode: string; costUsd: number; latencyMs: number }>;
}) {
  // Aggregate by agent
  const byAgent = new Map<string, { turns: number; cost: number; avgMs: number }>();
  for (const r of rows) {
    const existing = byAgent.get(r.agentName) ?? { turns: 0, cost: 0, avgMs: 0 };
    existing.turns += 1;
    existing.cost += Number(r.costUsd);
    existing.avgMs += Number(r.latencyMs);
    byAgent.set(r.agentName, existing);
  }
  const agentRows = [...byAgent.entries()].map(([name, v]) => ({
    name,
    turns: v.turns,
    cost: v.cost,
    avgMs: Math.round(v.avgMs / v.turns),
  })).sort((a, b) => b.cost - a.cost);

  // Aggregate by mode
  const byMode = new Map<string, { turns: number; cost: number }>();
  for (const r of rows) {
    const existing = byMode.get(r.analysisMode) ?? { turns: 0, cost: 0 };
    existing.turns += 1;
    existing.cost += Number(r.costUsd);
    byMode.set(r.analysisMode, existing);
  }
  const modeRows = [...byMode.entries()].map(([mode, v]) => ({
    mode,
    turns: v.turns,
    cost: v.cost,
  })).sort((a, b) => b.cost - a.cost);

  const totalCost = agentRows.reduce((s, r) => s + r.cost, 0);

  const AGENT_LABELS: Record<string, string> = {
    technical: 'Technical',
    fundamental: 'Fundamental',
    risk: 'Risk',
    sentiment: 'Sentiment',
    decision: 'Decision',
  };

  return (
    <section
      aria-labelledby="agent-usage-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"
    >
      <h2 id="agent-usage-heading" className="text-fg-muted text-sm font-medium">
        Multi-Agent Breakdown (MTD)
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-fg-subtle text-caption font-semibold uppercase tracking-wider">By Agent</h3>
        <ul className="flex flex-col gap-1.5">
          {agentRows.map((r) => (
            <li
              key={r.name}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 text-xs tabular-nums"
            >
              <span className="text-fg font-medium">
                {AGENT_LABELS[r.name] ?? r.name}
              </span>
              <span className="text-fg-subtle text-caption">
                {r.turns} turns · {Math.round(r.avgMs / 100) / 10}s avg
              </span>
              <span className="text-fg w-16 text-right">${r.cost.toFixed(4)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-fg-subtle text-caption font-semibold uppercase tracking-wider">By Mode</h3>
        <ul className="flex flex-col gap-1.5">
          {modeRows.map((r) => (
            <li
              key={r.mode}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 text-xs tabular-nums"
            >
              <span className="text-fg font-medium capitalize">{r.mode}</span>
              <span className="text-fg-subtle text-caption">{r.turns} turns</span>
              <span className="text-fg w-16 text-right">${r.cost.toFixed(4)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-2">
        <div className="flex items-baseline justify-between text-xs tabular-nums">
          <span className="text-fg-muted font-medium">Total Specialist Cost</span>
          <span className="text-fg">${totalCost.toFixed(4)}</span>
        </div>
      </div>
    </section>
  );
}

