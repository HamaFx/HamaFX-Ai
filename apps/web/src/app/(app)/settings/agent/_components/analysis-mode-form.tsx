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

import { Brain, Check, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { getCsrfToken } from '@/lib/csrf';

type AnalysisMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';

const MODE_OPTIONS: Array<{ value: AnalysisMode; label: string; description: string; latencyS: number; costMultiplier: number }> = [
  { value: 'auto', label: 'Auto', description: 'AI picks the best mode based on your question', latencyS: 0, costMultiplier: 0 },
  { value: 'single', label: 'Single', description: 'Fast, one agent (current behavior)', latencyS: 2, costMultiplier: 1 },
  { value: 'quick', label: 'Quick', description: 'Technical only', latencyS: 3, costMultiplier: 1.5 },
  { value: 'standard', label: 'Standard', description: 'Technical + Fundamental', latencyS: 5, costMultiplier: 2.5 },
  { value: 'full', label: 'Full', description: 'All 4 agents + fusion', latencyS: 8, costMultiplier: 4 },
];

interface AnalysisModeFormProps {
  initialMode: AnalysisMode;
  showOpinions: boolean;
}

export function AnalysisModeForm({ initialMode, showOpinions: initialShowOpinions }: AnalysisModeFormProps) {
  const [mode, setMode] = useState<AnalysisMode>(initialMode);
  const [showOpinions, setShowOpinions] = useState(initialShowOpinions);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasChanges = mode !== initialMode || showOpinions !== initialShowOpinions;

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
          body: JSON.stringify({
            defaultAnalysisMode: mode,
            showAgentOpinions: showOpinions,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        setSaved(true);
        toast.success('Analysis mode saved');
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  return (
    <section aria-labelledby="analysis-mode-heading" className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Brain className="size-4 text-fg-muted" />
        <h2 id="analysis-mode-heading" className="text-fg-muted text-sm font-medium">
          Analysis Mode
        </h2>
      </header>
      <p className="text-fg-muted text-xs">
        Choose how the AI analyzes your questions. Multi-agent modes use specialized agents that run
        in parallel for deeper analysis.
      </p>

      <div className="flex flex-col gap-2">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            aria-pressed={mode === opt.value}
            className={cn(
              'flex items-center justify-between gap-3 rounded-sm border p-3 text-left transition-colors',
              mode === opt.value
                ? 'border-zinc-700 bg-zinc-950'
                : 'border-zinc-800 bg-zinc-950 hover:border-divider',
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-fg text-sm font-medium">{opt.label}</span>
              <span className="text-fg-muted text-xs">{opt.description}</span>
              {opt.latencyS > 0 && (
                <span className="text-fg-subtle text-caption tabular-nums">
                  ~{opt.latencyS}s · {opt.costMultiplier}× cost
                </span>
              )}
            </div>
            {mode === opt.value && (
              <Check className="size-4 text-fg shrink-0" />
            )}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 mt-1">
        <input
          type="checkbox"
          checked={showOpinions}
          onChange={(e) => setShowOpinions(e.target.checked)}
          className="size-4 rounded border-zinc-800"
        />
        <span className="text-fg-muted text-sm">Show agent opinions in chat</span>
      </label>

      {hasChanges && (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-fg text-white hover:bg-fg/90 inline-flex items-center gap-2 self-start rounded-sm px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
          {saved ? 'Saved' : 'Save changes'}
        </button>
      )}
    </section>
  );
}