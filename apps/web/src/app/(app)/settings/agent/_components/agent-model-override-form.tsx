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

import {IconCpu, IconCheck, IconLoader2, IconArrowBackUp} from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { getCsrfToken } from '@/lib/csrf';

type AgentName = 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'decision';

interface AgentModelOverrides {
  technical?: string;
  fundamental?: string;
  risk?: string;
  sentiment?: string;
  decision?: string;
}

interface ProviderModel {
  providerId: string;
  providerDisplayName: string;
  modelId: string;
  modelLabel: string;
  tier?: string;
}

const AGENT_META: Array<{ name: AgentName; label: string; defaultTier: string; description: string }> = [
  { name: 'technical', label: 'Technical', defaultTier: 'fast', description: 'Price action, indicators, structure' },
  { name: 'fundamental', label: 'Fundamental', defaultTier: 'mid', description: 'Macro, calendar, COT, central banks' },
  { name: 'risk', label: 'Risk', defaultTier: 'mid', description: 'Risk flags, veto, worst-case scenarios' },
  { name: 'sentiment', label: 'Sentiment', defaultTier: 'fast', description: 'News/social sentiment, fear/greed' },
  { name: 'decision', label: 'Decision', defaultTier: 'strong', description: 'Fusion of all specialist opinions' },
];

interface AgentModelOverrideFormProps {
  initialOverrides: AgentModelOverrides;
  providers: Array<{
    id: string;
    displayName: string;
    models: Array<{ modelId: string; label?: string; tier?: string }>;
  }>;
}

export function AgentModelOverrideForm({ initialOverrides, providers }: AgentModelOverrideFormProps) {
  const [overrides, setOverrides] = useState<AgentModelOverrides>(initialOverrides);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Build a flat list of provider:model options for the dropdowns.
  const modelOptions: ProviderModel[] = providers.flatMap((p) =>
    (p.models ?? []).map((m) => ({
      providerId: p.id,
      providerDisplayName: p.displayName,
      modelId: m.modelId,
      modelLabel: m.label ?? m.modelId,
      ...(m.tier !== undefined ? { tier: m.tier } : {}),
    })),
  );

  const hasChanges = JSON.stringify(overrides) !== JSON.stringify(initialOverrides);

  function setAgentModel(agent: AgentName, value: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === '') {
        delete next[agent];
      } else {
        next[agent] = value;
      }
      return next;
    });
  }

  function reset() {
    setOverrides(initialOverrides);
  }

  function save() {
    startTransition(async () => {
      try {
        const csrf = getCsrfToken();
        const res = await fetch('/api/settings/analysis-mode', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
          body: JSON.stringify({ agentModelOverrides: overrides }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        setSaved(true);
        toast.success('Agent model overrides saved');
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  return (
    <section aria-labelledby="agent-model-override-heading" className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <IconCpu className="size-4 text-fg-muted" />
        <h2 id="agent-model-override-heading" className="text-fg-muted text-sm font-medium">
          Per-Agent Model Override
        </h2>
      </header>
      <p className="text-fg-muted text-xs">
        Assign a specific model to each specialist agent. Leave as &quot;Default&quot; to use the
        agent&apos;s recommended tier (fast / mid / strong).
      </p>

      <div className="flex flex-col gap-2">
        {AGENT_META.map((agent) => {
          const currentValue = overrides[agent.name] ?? '';
          return (
            <div
              key={agent.name}
              className="flex flex-col gap-1.5 rounded-sm border border-border bg-bg-elev-1 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-fg text-sm font-medium">{agent.label}</span>
                  <span className="text-fg-subtle text-caption">{agent.description}</span>
                </div>
                <span className="text-fg-subtle text-caption tabular-nums">
                  Default: {agent.defaultTier}
                </span>
              </div>
              <select
                value={currentValue}
                onChange={(e) => setAgentModel(agent.name, e.target.value)}
                className="bg-bg-elev-2 text-fg border-border rounded-sm border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-fg"
              >
                <option value="">Default ({agent.defaultTier} tier)</option>
                {modelOptions.map((opt) => (
                  <option
                    key={`${opt.providerId}:${opt.modelId}`}
                    value={`${opt.providerId}:${opt.modelId}`}
                  >
                    {opt.providerDisplayName} · {opt.modelLabel}
                    {opt.tier ? ` (${opt.tier})` : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="bg-fg text-white hover:bg-fg/90 inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {pending ? <IconLoader2 className="size-4 animate-spin" /> : saved ? <IconCheck className="size-4" /> : null}
            {saved ? 'Saved' : 'IconDeviceFloppy overrides'}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm transition-colors"
          >
            <IconArrowBackUp className="size-3.5" />
            Reset
          </button>
        </div>
      )}
    </section>
  );
}