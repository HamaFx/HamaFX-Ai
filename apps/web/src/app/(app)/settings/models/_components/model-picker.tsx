'use client';

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

import { useEffect, useState, useTransition } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { SkeletonCard } from '@/components/ui/skeleton';
import { withCsrf } from '@/lib/csrf';

import type { ProviderMeta } from '@hamafx/shared';

/**
 * Phase D2 — generic per-domain model picker. One component powers
 * the chat / vision / embedding pickers on /settings/models. The
 * differences between domains are:
 *
 *   - Which API endpoint to call (chat-model / vision-model / embedding-model)
 *   - Which tier + capability filter to apply to the option list
 *   - Empty-state copy pointing at the right provider capability
 *   - Helper text describing what this model is used for
 *
 * Everything else (the picker chrome, save flow, delete flow,
 * hydrated-from-API pattern) is shared.
 */
export type ModelPickerKind = 'chat' | 'vision' | 'embedding';

interface ModelPickerProps {
  /** Which domain this picker covers — drives endpoint + filter + copy. */
  kind: ModelPickerKind;
  /**
   * Currently-saved value ("<providerId>:<bareModelId>"). Pass null
   * to have the picker fetch it on mount.
   */
  initialValue?: string | null;
  /** Providers from the catalog endpoint (server filtered to configured). */
  providers: ProviderMeta[];
  /** Override the default title shown above the current-value row. */
  title?: string;
  /** Override the default helper paragraph under the dropdown. */
  helper?: string;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string };

const ENDPOINTS: Record<ModelPickerKind, string> = {
  chat: '/api/settings/chat-model',
  vision: '/api/settings/vision-model',
  embedding: '/api/settings/embedding-model',
};

const RESPONSE_KEYS: Record<ModelPickerKind, 'chatModel' | 'visionModel' | 'embeddingModel'> = {
  chat: 'chatModel',
  vision: 'visionModel',
  embedding: 'embeddingModel',
};

const TITLES: Record<ModelPickerKind, string> = {
  chat: 'Current chat model',
  vision: 'Current vision model',
  embedding: 'Current embedding model',
};

const HELPERS: Record<ModelPickerKind, string> = {
  chat:
    'The chosen model handles every chat turn unless you pick a different ' +
    'model for that specific turn from the chat toolbar. Changes apply immediately.',
  vision:
    'Used by the chart-screenshot analyser (`analyze_chart_image` tool) when ' +
    'you attach an image to a chat turn. Set this to a vision-capable model from ' +
    'your configured provider.',
  embedding:
    'Used by RAG / memory / news embeddings. Dimension must match the DB column; ' +
    'switching models later requires a backfill.',
};

const NO_PROVIDERS_COPY: Record<ModelPickerKind, string> = {
  chat: 'to pick a default chat model',
  vision: 'to pick a default vision model',
  embedding: 'to pick a default embedding model',
};

const NO_PROVIDERS_EMOJI: Record<ModelPickerKind, string> = {
  chat: '🧠',
  vision: '👁️',
  embedding: '🔡',
};

export function ModelPicker({
  kind,
  initialValue = null,
  providers,
  title,
  helper,
}: ModelPickerProps) {
  const [value, setValue] = useState<string | null>(initialValue);
  const [hydrated, setHydrated] = useState(initialValue !== null);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  const endpoint = ENDPOINTS[kind];
  const responseKey = RESPONSE_KEYS[kind];

  // If we weren't given the saved value at render time, fetch it
  // on mount via the per-domain GET endpoint.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(endpoint, {
          ...withCsrf(),
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, string | null>;
        if (!cancelled) setValue(data[responseKey] ?? null);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, responseKey, hydrated]);

  function pick(next: string) {
    if (next === value) return;
    setSave({ kind: 'pending' });
    startTransition(async () => {
      try {
        const sep = next.indexOf(':');
        const providerId = next.slice(0, sep);
        const modelId = next.slice(sep + 1);

        const res = await fetch(endpoint, {
          method: 'PUT',
          ...withCsrf({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, modelId }),
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
        }
        const data = (await res.json()) as Record<string, string>;
        setValue(data[responseKey] ?? null);
        setSave({ kind: 'idle' });
        toast.success(`${TITLES[kind]} updated`);
      } catch (err) {
        setSave({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
        toast.error(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  async function clearOverride() {
    setSave({ kind: 'pending' });
    try {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        ...withCsrf(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setValue(null);
      setSave({ kind: 'idle' });
      toast.success('Cleared override — using fallback');
    } catch (err) {
      setSave({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    }
  }

  // Filter options by domain. Same shape as the ChatModelPicker of
  // Phase F but tier- + capability-aware so embedding-only models
  // never surface in the chat picker, etc.
  const options: Array<{
    value: string;
    label: string;
    providerLabel: string;
    tier: string;
    inputPrice?: number | null | undefined;
    outputPrice?: number | null | undefined;
  }> = [];
  for (const provider of providers) {
    for (const model of provider.models) {
      if (!isModelAllowedForKind(model.tier, provider.supports, kind)) continue;
      options.push({
        value: `${provider.id}:${model.modelId}`,
        label: model.label ?? model.modelId,
        providerLabel: provider.displayName,
        tier: model.tier ?? 'flagship',
        inputPrice: model.inputPerMTokUsd,
        outputPrice: model.outputPerMTokUsd,
      });
    }
  }

  if (!hydrated) {
    return <SkeletonCard lines={3} />;
  }

  if (providers.length === 0 || options.length === 0) {
    return (
      <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-6 flex flex-col items-center text-center gap-3">
        <div className="text-3xl">{NO_PROVIDERS_EMOJI[kind]}</div>
        <div>
          <h3 className="text-sm font-semibold text-fg">No providers available</h3>
          <p className="text-caption text-fg-subtle mt-1 max-w-md">
            Add an API key in{' '}
            <a
              href="/settings/api-keys"
              className="text-fg hover:underline"
            >
              Settings → API Keys
            </a>{' '}
            {NO_PROVIDERS_COPY[kind]}.
          </p>
        </div>
      </div>
    );
  }

  const current = options.find((o) => o.value === value);
  const currentLabel = current
    ? `${current.providerLabel} · ${current.label}`
    : 'Use fallback (operator env / spec default)';

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-fg">
            {title ?? TITLES[kind]}
          </span>
          <span className="text-caption text-fg-subtle tabular-nums">
            {currentLabel}
          </span>
        </div>
        {value ? (
          <span className="inline-flex items-center gap-1 text-caption text-emerald-500">
            <Check size={12} aria-hidden="true" />
            Saved
          </span>
        ) : (
          <span className="text-caption text-fg-subtle">No override</span>
        )}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-fg-subtle">
          Pick a model
        </span>
        <div className="relative">
          <select
            value={value ?? ''}
            onChange={(e) => pick(e.target.value)}
            disabled={pending || save.kind === 'pending'}
            className="w-full appearance-none border border-zinc-800 bg-zinc-900 text-fg rounded-sm pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fg disabled:opacity-60"
          >
            <option value="" disabled>
              Use fallback ({options[0]?.label ?? '—'})
            </option>
            {options.map((o) => {
              const priceLabel = (o.inputPrice != null && o.outputPrice != null)
                ? ` · $${o.inputPrice.toFixed(2)}/$${o.outputPrice.toFixed(2)}/1M tok`
                : '';
              return (
                <option key={o.value} value={o.value}>
                  {o.providerLabel} · {o.label} ({o.tier}{priceLabel})
                </option>
              );
            })}
          </select>
          {pending || save.kind === 'pending' ? (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-fg-subtle"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
              aria-hidden="true"
            />
          )}
        </div>
      </label>

      {save.kind === 'error' ? (
        <div className="text-caption text-red-500">{save.message}</div>
      ) : null}

      <p className="text-caption text-fg-subtle">{helper ?? HELPERS[kind]}</p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => void clearOverride()}
        disabled={!value || pending || save.kind === 'pending'}
      >
        Clear override
      </Button>
    </div>
  );
}

/**
 * Filter that decides whether a model in the catalog should appear
 * in the picker for a given kind. Three checks:
 *   - tier: chat/vision forbid 'embedding'; embedding only allows 'embedding'
 *   - provider.supports: vision requires supports.vision; embedding
 *     requires supports.embedding
 *   - chat allows any non-embedding tier
 */
function isModelAllowedForKind(
  tier: string | undefined,
  supports: { vision?: boolean; embedding?: boolean } | undefined,
  kind: ModelPickerKind,
): boolean {
  const t = tier ?? 'flagship';
  if (kind === 'chat') {
    return t !== 'embedding';
  }
  if (kind === 'vision') {
    if (t === 'embedding') return false;
    return Boolean(supports?.vision);
  }
  // embedding
  if (t !== 'embedding') return false;
  return Boolean(supports?.embedding);
}

/* ---------- Thin wrappers that pin the `kind` prop ---------- */

export function ChatModelPicker(
  props: Omit<ModelPickerProps, 'kind'>,
) {
  return <ModelPicker {...props} kind="chat" />;
}

export function VisionModelPicker(
  props: Omit<ModelPickerProps, 'kind'>,
) {
  return <ModelPicker {...props} kind="vision" />;
}

export function EmbeddingModelPicker(
  props: Omit<ModelPickerProps, 'kind'>,
) {
  return <ModelPicker {...props} kind="embedding" />;
}