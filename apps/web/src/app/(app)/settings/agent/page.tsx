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

// Phase 7c — schema-driven tool catalogue page. Lists every registered
// AI tool with its description and the last-24h invocation telemetry
// (count, failure count, p50/p95 latency). Server component — single
// DB read on render.

import { buildToolCatalogue, BYOK_PROVIDERS_LIST } from '@hamafx/ai';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { TOOL_NAMES, type ToolName } from '@hamafx/shared';
import { Settings2 } from 'lucide-react';

import { DisabledToolsForm } from './_components/disabled-tools-form';
import { AnalysisModeForm } from './_components/analysis-mode-form';
import { AgentModelOverrideForm } from './_components/agent-model-override-form';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Agent · HamaFX-Ai',
  description: 'Tool catalogue and recent invocation stats.',
};

export default async function AgentCataloguePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const db = getDb();
  const [settings] = await db
    .select({
      disabledTools: schema.userSettings.disabledTools,
      defaultAnalysisMode: schema.userSettings.defaultAnalysisMode,
      showAgentOpinions: schema.userSettings.showAgentOpinions,
      agentModelOverrides: schema.userSettings.agentModelOverrides,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  const disabledTools = settings?.disabledTools ?? [];
  const analysisMode = (settings?.defaultAnalysisMode ?? 'auto') as 'single' | 'quick' | 'standard' | 'full' | 'auto';
  const showOpinions = settings?.showAgentOpinions ?? true;
  const agentModelOverrides = (settings?.agentModelOverrides as {
    technical?: string; fundamental?: string; risk?: string; sentiment?: string; decision?: string;
  } | null) ?? {};

  // Build the provider+model list for the override dropdowns.
  const providerModelList = BYOK_PROVIDERS_LIST.map((p) => ({
    id: p.id as string,
    displayName: p.displayName,
    models: (p.models ?? []).map((m) => ({
      modelId: m.modelId,
      ...(m.label !== undefined ? { label: m.label } : {}),
      ...(m.tier !== undefined ? { tier: m.tier } : {}),
    })),
  }));
  const entries = await buildToolCatalogue(disabledTools);
  const totalInvocations = entries.reduce((s, e) => s + e.invocations24h, 0);
  const totalFailures = entries.reduce((s, e) => s + e.failures24h, 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-fg text-xl font-bold">Agent</h1>
        <span className="text-fg-subtle text-body-sm tabular-nums">
          last 24h · {totalInvocations} invocation{totalInvocations === 1 ? '' : 's'} ·{' '}
          {totalFailures} failure{totalFailures === 1 ? '' : 's'}
        </span>
      </header>

      <p className="text-fg-muted text-sm">
        Every tool the agent can call. Counts and latencies come from{' '}
        <code className="bg-bg-elev-2 text-fg rounded px-1.5 py-0.5 font-mono text-xs">
          chat_tool_telemetry
        </code>{' '}
        over the last 24 hours.
      </p>

      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <li
            key={e.name}
            className="border-divider/60 bg-bg-elev-1 flex flex-col gap-1.5 rounded-2xl border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <code className="text-fg font-mono text-sm font-semibold">{e.name}</code>
              <div className="flex items-center gap-1.5 text-caption tabular-nums">
                <Pill label={`${e.invocations24h}×`} tone="muted" />
                {e.failures24h > 0 ? (
                  <Pill label={`${e.failures24h} fail`} tone="bear" />
                ) : null}
                {e.invocations24h > 0 ? (
                  <Pill label={`p50 ${e.medianMs}ms`} tone="muted" />
                ) : null}
                {e.invocations24h > 0 ? <Pill label={`p95 ${e.p95Ms}ms`} tone="muted" /> : null}
              </div>
            </div>
            <p className="text-fg-muted text-xs leading-relaxed">{e.description}</p>
          </li>
        ))}
      </ul>

      <AnalysisModeForm initialMode={analysisMode} showOpinions={showOpinions} />

      <AgentModelOverrideForm initialOverrides={agentModelOverrides} providers={providerModelList} />

      <section aria-labelledby="disabled-tools-heading" className="flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <Settings2 className="size-4 text-fg-muted" />
          <h2 id="disabled-tools-heading" className="text-fg-muted text-sm font-medium">
            Disabled Tools
          </h2>
        </header>
        <p className="text-fg-muted text-xs">
          Toggle tools off to prevent the agent from calling them. Disabled tools still appear in the
          catalogue but are excluded from the agent&apos;s available toolset.
        </p>
        <DisabledToolsForm
          allTools={TOOL_NAMES as unknown as ToolName[]}
          initialDisabledTools={disabledTools}
        />
      </section>
    </main>
  );
}

function Pill({ label, tone }: { label: string; tone: 'muted' | 'bear' | 'bull' }) {
  const cls =
    tone === 'bear'
      ? 'bg-bear/15 text-bear'
      : tone === 'bull'
        ? 'bg-bull/15 text-bull'
        : 'bg-bg-elev-2 text-fg-muted';
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-caption font-medium ${cls}`}>{label}</span>
  );
}
