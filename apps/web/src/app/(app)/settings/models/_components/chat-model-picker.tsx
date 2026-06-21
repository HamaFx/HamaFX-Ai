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
import { withCsrf } from '@/lib/csrf';

import type { ProviderMeta } from '@hamafx/shared';

/**
 * Phase F — single chat-model picker. Replaces the 5-domain ModelsBrowser
 * with one dropdown: pick the model that handles every chat turn.
 *
 * Reads `chatModel` from /api/settings/chat-model. Only shows providers
 * the user has configured (matches the same "configured only" rule as
 * the bulk-test UI). Picks within a provider are tier-sorted (flagship →
 * pro → fast → lite → embedding) so the recommended choice is on top.
 *
 * Empty state (no providers configured): the user has no chat_model
 * and the server resolver falls back to spec defaults. We surface a
 * link to /settings/api-keys so the user can add a key.
 */
interface ChatModelPickerProps {
  /**
   * Currently-saved value. Pass `null` to have the picker fetch
   * it on mount via /api/settings/chat-model (useful when the
   * server doesn't have the value yet). Defaults to null.
   */
  initialChatModel?: string | null;
  /** Providers from the catalog endpoint (server filtered to "configured"). */
  providers: ProviderMeta[];
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string };

export function ChatModelPicker({
  initialChatModel = null,
  providers,
}: ChatModelPickerProps) {
  const [chatModel, setChatModel] = useState<string | null>(
    initialChatModel,
  );
  const [hydrated, setHydrated] = useState(initialChatModel !== null);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  // If we weren't given the saved value at render time, fetch it
  // on mount. RSC pages can't easily inject this without a server
  // helper; the picker doing a one-shot GET is the cleanest path.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/settings/chat-model', {
          ...withCsrf(),
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { chatModel: string | null };
        if (!cancelled) setChatModel(data.chatModel);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  function pick(value: string) {
    if (value === chatModel) return;
    setSave({ kind: 'pending' });
    startTransition(async () => {
      try {
        // Parse "providerId:modelId" — the format the endpoint expects.
        const sep = value.indexOf(':');
        const providerId = value.slice(0, sep);
        const modelId = value.slice(sep + 1);

        const res = await fetch('/api/settings/chat-model', {
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
        const data = (await res.json()) as { chatModel: string };
        setChatModel(data.chatModel);
        setSave({ kind: 'idle' });
        toast.success('Default chat model updated');
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
      const res = await fetch('/api/settings/chat-model', {
        method: 'DELETE',
        ...withCsrf(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChatModel(null);
      setSave({ kind: 'idle' });
      toast.success('Cleared override — using provider default');
    } catch (err) {
      setSave({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    }
  }

  if (providers.length === 0) {
    return (
      <div className="border border-divider bg-bg-elev-1 rounded-lg p-6 flex flex-col items-center text-center gap-3">
        <div className="text-3xl">🧠</div>
        <div>
          <h3 className="text-sm font-semibold text-fg">No providers configured</h3>
          <p className="text-caption text-fg-subtle mt-1 max-w-md">
            Add an API key in{' '}
            <a
              href="/settings/api-keys"
              className="text-brand hover:underline"
            >
              Settings → API Keys
            </a>{' '}
            to pick a default chat model.
          </p>
        </div>
      </div>
    );
  }

  // Flatten configured providers into a single ordered list:
  //   1. providers in priority order (cheapest first, per the catalog)
  //   2. within a provider, models sorted flagship → pro → fast → lite
  const options: Array<{
    value: string;
    label: string;
    providerLabel: string;
    tier: string;
  }> = [];
  for (const provider of providers) {
    for (const model of provider.models) {
      options.push({
        value: `${provider.id}:${model.modelId}`,
        label: model.label ?? model.modelId,
        providerLabel: provider.displayName,
        tier: model.tier ?? 'flagship',
      });
    }
  }

  const current = options.find((o) => o.value === chatModel);
  const currentLabel = current
    ? `${current.providerLabel} · ${current.label}`
    : 'Use provider default';

  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-fg">
            Current model
          </span>
          <span className="text-caption text-fg-subtle tabular-nums">
            {currentLabel}
          </span>
        </div>
        {chatModel ? (
          <span className="inline-flex items-center gap-1 text-caption text-bull">
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
            value={chatModel ?? ''}
            onChange={(e) => pick(e.target.value)}
            disabled={pending || save.kind === 'pending'}
            className="w-full appearance-none border border-divider bg-bg-elev-2 text-fg rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
          >
            <option value="" disabled>
              Use provider default ({options[0]?.label ?? '—'})
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.providerLabel} · {o.label} ({o.tier})
              </option>
            ))}
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
        <div className="text-caption text-bear">{save.message}</div>
      ) : null}

      <p className="text-caption text-fg-subtle">
        The chosen model handles every chat turn unless you pick a
        different model for that specific turn from the chat toolbar.
        Changes apply immediately.
      </p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => void clearOverride()}
        disabled={!chatModel || pending || save.kind === 'pending'}
      >
        Clear override
      </Button>
    </div>
  );
}
