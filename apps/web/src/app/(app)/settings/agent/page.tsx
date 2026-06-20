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

import { buildToolCatalogue } from '@hamafx/ai';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Agent · HamaFX-Ai',
  description: 'Tool catalogue and recent invocation stats.',
};

export default async function AgentCataloguePage() {
  const entries = await buildToolCatalogue();
  const totalInvocations = entries.reduce((s, e) => s + e.invocations24h, 0);
  const totalFailures = entries.reduce((s, e) => s + e.failures24h, 0);

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4">
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
