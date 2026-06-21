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

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { withCsrf } from '@/lib/csrf';
import type { CatalogResponse, DefaultModels, ModelDomain } from '@hamafx/shared';

interface RegenModelPickerProps {
  popoverId: string;
  /**
   * Currently-applied model for this thread, e.g. "google/gemini-2.5-flash".
   * Used to highlight the active row in the menu. Optional — when
   * omitted, no row is marked active.
   */
  activeModelId?: string | null;
  onPick: (modelId: string) => void;
}

const DOMAIN_LABELS: Record<ModelDomain, string> = {
  fundamental: 'Deep reasoning',
  technical: 'Technical',
  summary: 'Quick summary',
  vision: 'Vision',
  embedding: 'Embedding',
};

const DOMAIN_ORDER: ModelDomain[] = [
  'fundamental',
  'technical',
  'summary',
  'vision',
  'embedding',
];

/**
 * Phase E — replaces the hardcoded `REGEN_MODELS` array in
 * `message.tsx`. Pulls the full catalog from `/api/settings/catalog`
 * (and the user's per-domain defaults from
 * `/api/settings/default-model`) and renders an organised popover:
 *
 *   - Quick picks: "Use my defaults" — four pre-set domain defaults
 *     (fundamental / technical / summary / vision).
 *   - Per-provider list: every model from every provider that has a
 *     key, labelled with the model name, tier, and price.
 *   - Active row gets a check.
 *
 * Fetched lazily on first open so we don't block the chat thread.
 */
export function RegenModelPicker({ popoverId, activeModelId, onPick }: RegenModelPickerProps) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [defaults, setDefaults] = useState<DefaultModels>({});
  const [loading, setLoading] = useState(true);

  // We re-fetch on every mount (popover-open). The catalog endpoint
  // is `force-dynamic` so it always reflects the current saved
  // keys and per-domain defaults.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [catRes, defRes] = await Promise.all([
          fetch('/api/settings/catalog', { ...withCsrf(), cache: 'no-store' }),
          fetch('/api/settings/default-model', { ...withCsrf(), cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (catRes.ok) setCatalog(await catRes.json());
        if (defRes.ok) {
          const data = await defRes.json();
          setDefaults(data.defaults ?? {});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(modelId: string) {
    onPick(modelId);
    const popover = document.getElementById(popoverId);
    (popover as HTMLElement | null)?.hidePopover?.();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-subtle">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Loading models…
      </div>
    );
  }

  if (!catalog || catalog.providers.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-fg-subtle">
        Add a key in Settings → API Keys to see model options.
      </div>
    );
  }

  // Split the catalog into "configured" (have a key) vs not.
  // Only configured providers can actually serve a request, so
  // we hide unconfigured ones from this menu.
  const configured = catalog.providers.filter((p) => p.hasKey);
  const sortedDomains = [...catalog.domains].sort(
    (a, b) => DOMAIN_ORDER.indexOf(a.id) - DOMAIN_ORDER.indexOf(b.id),
  );

  if (configured.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-fg-subtle">
        Add a key in Settings → API Keys to see model options.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto min-w-72">
      {/* Quick picks — user's per-domain defaults */}
      <section className="flex flex-col gap-0.5">
        <div className="px-2 py-1 text-caption uppercase tracking-wide text-fg-subtle">
          My defaults
        </div>
        {sortedDomains
          .filter((d) => defaults[d.id])
          .map((d) => {
            const value = defaults[d.id];
            if (!value) return null;
            const [providerId, modelId] = value.split(':');
            const provider = catalog.providers.find((p) => p.id === providerId);
            const model = provider?.models.find((m) => {
              const bare = m.modelId.includes('/')
                ? m.modelId.split('/').slice(1).join('/')
                : m.modelId;
              return bare === modelId;
            });
            if (!provider || !model) return null;
            const fullyQualified = `${provider.id}/${bareModelId(model.modelId)}`;
            return (
              <RegenRow
                key={d.id}
                label={`${DOMAIN_LABELS[d.id]}`}
                sublabel={`${provider.displayName} · ${model.label ?? modelId}`}
                fullyQualified={fullyQualified}
                isActive={activeModelId === fullyQualified}
                onClick={() => pick(fullyQualified)}
              />
            );
          })}
        {Object.keys(defaults).length === 0 ? (
          <div className="px-2 py-1 text-caption text-fg-subtle italic">
            No overrides set. Pick defaults in Settings → Models.
          </div>
        ) : null}
      </section>

      {/* Per-provider model list */}
      <section className="flex flex-col gap-0.5">
        <div className="px-2 py-1 text-caption uppercase tracking-wide text-fg-subtle">
          All configured models
        </div>
        {configured.map((p) => (
          <div key={p.id} className="flex flex-col gap-0.5">
            <div className="px-2 pt-1.5 pb-0.5 text-caption text-fg-muted">
              {p.displayName}
            </div>
            {p.models.map((m) => {
              const fullyQualified = `${p.id}/${bareModelId(m.modelId)}`;
              return (
                <RegenRow
                  key={`${p.id}/${m.modelId}`}
                  label={m.label ?? bareModelId(m.modelId)}
                  sublabel={m.tier ? tierLabel(m.tier) : undefined}
                  fullyQualified={fullyQualified}
                  isActive={activeModelId === fullyQualified}
                  onClick={() => pick(fullyQualified)}
                />
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}

function bareModelId(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
}

function tierLabel(tier: 'flagship' | 'pro' | 'fast' | 'lite' | 'embedding'): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function RegenRow({
  label,
  sublabel,
  fullyQualified,
  isActive,
  onClick,
}: {
  label: string;
  sublabel?: string | undefined;
  fullyQualified: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-model-id={fullyQualified}
      onClick={onClick}
      className="text-fg hover:bg-bg-elev-2 focus:bg-bg-elev-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors focus:outline-none"
    >
      <span className="flex flex-col min-w-0">
        <span className="truncate">{label}</span>
        {sublabel ? (
          <span className="text-caption text-fg-subtle truncate">{sublabel}</span>
        ) : null}
      </span>
      {isActive ? (
        <CheckCircle2 size={14} className="text-bull shrink-0" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export const _regenPickerInternals = {
  DOMAIN_LABELS,
  cn,
};