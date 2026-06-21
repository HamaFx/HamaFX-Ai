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

import { useMemo, useState, useTransition, useEffect } from 'react';
import { CheckCircle2, Eye, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { withCsrf } from '@/lib/csrf';

import type {
  CatalogModel,
  CatalogResponse,
  DefaultModels,
  ModelDomain,
  ProviderMeta,
} from '@hamafx/shared';

interface ModelsBrowserProps {
  catalog: CatalogResponse;
  defaults: DefaultModels;
}

type ViewMode = 'purpose' | 'provider';

const TIER_LABELS: Record<NonNullable<CatalogModel['tier']>, string> = {
  flagship: 'Flagship',
  pro: 'Pro',
  fast: 'Fast',
  lite: 'Lite',
  embedding: 'Embedding',
};

const TIER_RANK: Record<NonNullable<CatalogModel['tier']>, number> = {
  flagship: 0,
  pro: 1,
  fast: 2,
  lite: 3,
  embedding: 4,
};

function formatPrice(perMTok: number | null | undefined): string {
  if (perMTok === null || perMTok === undefined) return '—';
  if (perMTok === 0) return 'Free';
  if (perMTok < 1) return `$${perMTok.toFixed(2)}/M`;
  return `$${perMTok.toFixed(2)}/M`;
}

function formatContext(tokens: number | undefined): string {
  if (!tokens) return '—';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return `${tokens}`;
}

/**
 * Format a model id for display. Strips the provider prefix and
 * uses sentence-case for common known patterns.
 */
function prettyModelId(modelId: string): string {
  // For OpenRouter / Vertex the id is "<provider>/<bare>"; strip
  // the prefix. The picker shows the bare id to the user.
  const bare = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
  return bare;
}

export function ModelsBrowser({ catalog, defaults }: ModelsBrowserProps) {
  const [view, setView] = useState<ViewMode>('purpose');
  const [query, setQuery] = useState('');
  // Track only the in-memory override so the UI reflects a "set"
  // immediately. The server action persists it.
  const [active, setActive] = useState<DefaultModels>(defaults);
  const [pending, startTransition] = useTransition();
  // debounce ref so we don't double-toast on React strict-mode

  useEffect(() => {
    setActive(defaults);
  }, [defaults]);

  const providers = useMemo(() => {
    const tierOrder: Record<NonNullable<CatalogModel['tier']>, number> = TIER_RANK;
    const sorted = [...catalog.providers].map((p) => ({
      ...p,
      models: [...p.models].sort((a, b) => {
        const oa = a.tier ? tierOrder[a.tier] : 99;
        const ob = b.tier ? tierOrder[b.tier] : 99;
        return oa - ob;
      }),
    }));
    // Sort providers cheapest-first (free → low → medium → high).
    return sorted.sort((a, b) => {
      const order = { free: 0, low: 1, medium: 2, high: 3 };
      return order[a.pricingTier] - order[b.pricingTier];
    });
  }, [catalog.providers]);

  const filteredProviders = useMemo(() => {
    if (!query.trim()) return providers;
    const q = query.toLowerCase();
    return providers
      .map((p) => ({
        ...p,
        models: p.models.filter(
          (m) =>
            m.modelId.toLowerCase().includes(q) ||
            (m.label ?? '').toLowerCase().includes(q) ||
            (m.description ?? '').toLowerCase().includes(q) ||
            p.displayName.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.models.length > 0);
  }, [providers, query]);

  /**
   * Set a model as the user's default for a domain. The fully-qualified
   * id "<provider>:<modelId>" is what the resolver reads.
   */
  function setDefault(domain: ModelDomain, provider: ProviderMeta, model: CatalogModel) {
    if (!provider.hasKey) {
      toast.error(
        `Add a key for ${provider.displayName} before setting a default`,
      );
      return;
    }
    const bareModelId = prettyModelId(model.modelId);
    const value = `${provider.id}:${bareModelId}`;
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/default-model', {
          method: 'POST',
          ...withCsrf({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'set',
              domain,
              providerId: provider.id,
              modelId: bareModelId,
            }),
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
        }
        setActive((cur) => ({ ...cur, [domain]: value }));
        toast.success(`${TIER_LABELS[model.tier ?? 'fast']} → ${domain}`, {
          description: `${provider.displayName}: ${model.label ?? bareModelId}`,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function clearDefault(domain: ModelDomain) {
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/default-model', {
          method: 'POST',
          ...withCsrf({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear', domain }),
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
        }
        setActive((cur) => {
          const { [domain]: _omit, ...rest } = cur;
          return rest;
        });
        toast.success(`Cleared ${domain} override — back to provider default`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg bg-bg-elev-1 p-1 border border-divider">
          <button
            type="button"
            onClick={() => setView('purpose')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'purpose'
                ? 'bg-brand/15 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            By purpose
          </button>
          <button
            type="button"
            onClick={() => setView('provider')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'provider'
                ? 'bg-brand/15 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            By provider
          </button>
        </div>
        <label className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models, providers, or capabilities…"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-divider bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-fg"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
      </div>

      {view === 'purpose' ? (
        <PurposeView
          providers={filteredProviders}
          domains={catalog.domains}
          active={active}
          pending={pending}
          onSet={setDefault}
          onClear={clearDefault}
        />
      ) : (
        <ProviderView
          providers={filteredProviders}
          active={active}
          pending={pending}
          onSet={setDefault}
          onClear={clearDefault}
        />
      )}
    </div>
  );
}

interface ViewProps {
  providers: ProviderMeta[];
  active: DefaultModels;
  pending: boolean;
  onSet: (domain: ModelDomain, provider: ProviderMeta, model: CatalogModel) => void;
  onClear: (domain: ModelDomain) => void;
}

interface PurposeViewProps {
  providers: ProviderMeta[];
  domains: CatalogResponse['domains'];
  active: DefaultModels;
  pending: boolean;
  onSet: (domain: ModelDomain, provider: ProviderMeta, model: CatalogModel) => void;
  onClear: (domain: ModelDomain) => void;
}

function PurposeView({
  providers,
  domains,
  active,
  pending,
  onSet,
  onClear,
}: PurposeViewProps) {
  if (!domains.length) {
    return (
      <EmptyState
        title="No domains registered"
        body="The catalog endpoint returned no domain definitions. Reload the page after setting up your providers in /settings/api-keys."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {domains.map((d) => {
        // For this domain, gather one card per provider that hosts
        // at least one model capable of the domain. Default-having
        // providers get priority.
        const cards = providers
          .filter((p) =>
            p.models.some(
              (m) =>
                m.defaultFor === d.id ||
                (d.id === 'vision' ? m.capabilities?.vision : false) ||
                (d.id === 'embedding' ? m.tier === 'embedding' : false),
            ),
          )
          .map((p) => {
            // Pick the "right" model for this domain — either the
            // user's override or the spec default.
            const override = active[d.id];
            const overrideModel = override
              ? p.models.find((m) => override === `${p.id}:${prettyModelId(m.modelId)}`)
              : null;
            const defaultModel = p.models.find((m) => m.defaultFor === d.id) ?? null;
            const candidate = overrideModel ?? defaultModel;
            return { provider: p, model: candidate };
          })
          .filter((entry): entry is { provider: ProviderMeta; model: CatalogModel } =>
            Boolean(entry.model),
          )
          // Sort: provider-with-key first, then by tier order
          .sort((a, b) => {
            if (a.provider.hasKey !== b.provider.hasKey) {
              return a.provider.hasKey ? -1 : 1;
            }
            const ta = a.model.tier ? TIER_RANK[a.model.tier] : 99;
            const tb = b.model.tier ? TIER_RANK[b.model.tier] : 99;
            return ta - tb;
          });

        if (cards.length === 0) {
          return null;
        }

        return (
          <section key={d.id} className="flex flex-col gap-2">
            <header className="flex items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-fg">{d.label}</h3>
                <p className="text-caption text-fg-subtle">{d.description}</p>
              </div>
              <ActivePill
                domain={d.id}
                active={active}
                onClear={onClear}
                pending={pending}
              />
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {cards.map(({ provider, model }) => (
                <ModelCard
                  key={`${provider.id}:${model.modelId}`}
                  provider={provider}
                  model={model}
                  domain={d.id}
                  active={active}
                  pending={pending}
                  onSet={onSet}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProviderView({ providers, active, pending, onSet }: ViewProps) {
  if (!providers.length) {
    return (
      <EmptyState
        title="No providers match your search"
        body="Try a different search term or clear the filter to see all 9 providers."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <ProviderCard
          key={p.id}
          provider={p}
          active={active}
          pending={pending}
          onSet={onSet}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  active,
  pending,
  onSet,
}: {
  provider: ProviderMeta;
  active: DefaultModels;
  pending: boolean;
  onSet: (domain: ModelDomain, provider: ProviderMeta, model: CatalogModel) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-elev-2 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-caption uppercase tracking-wide text-fg-subtle shrink-0">
            {provider.pricingTier}
          </span>
          <h3 className="text-sm font-semibold text-fg truncate">
            {provider.displayName}
          </h3>
          <ProviderHealthDot hasKey={provider.hasKey} health={provider.health} />
        </div>
        <span className="text-caption text-fg-subtle shrink-0">
          {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
          {open ? ' ▲' : ' ▼'}
        </span>
      </button>
      {open ? (
        <div className="border-t border-divider px-4 py-3 flex flex-col gap-2">
          <p className="text-caption text-fg-subtle">{provider.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {provider.models.map((m) => (
              <ModelCard
                key={`${provider.id}:${m.modelId}`}
                provider={provider}
                model={m}
                domain={m.defaultFor ?? 'technical'}
                active={active}
                pending={pending}
                onSet={onSet}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ModelCard({
  provider,
  model,
  domain,
  active,
  pending,
  onSet,
}: {
  provider: ProviderMeta;
  model: CatalogModel;
  domain: ModelDomain;
  active: DefaultModels;
  pending: boolean;
  onSet: (domain: ModelDomain, provider: ProviderMeta, model: CatalogModel) => void;
}) {
  const bareModelId = prettyModelId(model.modelId);
  const fullyQualified = `${provider.id}:${bareModelId}`;
  const isActive = active[domain] === fullyQualified;
  const canSet = provider.hasKey && !isActive;

  return (
    <article className="border border-divider bg-bg-elev-1 rounded-lg p-3 flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-fg truncate flex items-center gap-1.5">
            {model.label ?? bareModelId}
            {model.tier ? (
              <span className="text-caption uppercase tracking-wide text-fg-subtle bg-bg-elev-2 px-1.5 py-0.5 rounded shrink-0">
                {TIER_LABELS[model.tier]}
              </span>
            ) : null}
          </h4>
          <code className="text-caption text-fg-subtle font-mono block truncate">
            {bareModelId}
          </code>
        </div>
        {isActive ? (
          <span className="flex items-center gap-1 text-caption text-bull shrink-0">
            <CheckCircle2 size={12} aria-hidden="true" />
            Active
          </span>
        ) : null}
      </header>

      {model.description ? (
        <p className="text-caption text-fg-muted line-clamp-2">
          {model.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle">
        <span>
          <span className="text-fg-muted">in</span> {formatPrice(model.inputPerMTokUsd)}
        </span>
        <span>
          <span className="text-fg-muted">out</span> {formatPrice(model.outputPerMTokUsd)}
        </span>
        <span>
          <span className="text-fg-muted">ctx</span> {formatContext(model.contextTokens)}
        </span>
        {model.capabilities?.vision ? (
          <span className="inline-flex items-center gap-1">
            <Eye size={11} aria-hidden="true" />
            vision
          </span>
        ) : null}
        {model.capabilities?.tools ? (
          <span className="inline-flex items-center gap-1">
            <Sparkles size={11} aria-hidden="true" />
            tools
          </span>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 mt-auto pt-1">
        <Button
          type="button"
          variant={isActive ? 'ghost' : 'primary'}
          size="sm"
          disabled={!canSet || pending}
          onClick={() => onSet(domain, provider, model)}
          className="text-caption"
        >
          {isActive ? 'Default for ' + domain : `Set as default for ${domain}`}
        </Button>
        {!provider.hasKey ? (
          <span className="text-caption text-fg-subtle">
            Add a key for {provider.displayName} to enable
          </span>
        ) : null}
      </footer>
    </article>
  );
}

function ActivePill({
  domain,
  active,
  onClear,
  pending,
}: {
  domain: ModelDomain;
  active: DefaultModels;
  onClear: (domain: ModelDomain) => void;
  pending: boolean;
}) {
  const value = active[domain];
  if (!value) {
    return (
      <span className="text-caption text-fg-subtle">No user override</span>
    );
  }
  const [providerId, modelId] = value.split(':');
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center gap-1.5 text-caption text-bull">
        <CheckCircle2 size={12} aria-hidden="true" />
        <span className="font-mono">{providerId}/{modelId}</span>
      </span>
      <button
        type="button"
        onClick={() => onClear(domain)}
        disabled={pending}
        className="text-caption text-fg-subtle hover:text-fg"
      >
        Reset
      </button>
    </div>
  );
}

function ProviderHealthDot({
  hasKey,
  health,
}: {
  hasKey: boolean;
  health: ProviderMeta['health'];
}) {
  if (!hasKey) {
    return (
      <span className="text-caption text-fg-subtle shrink-0" aria-label="No key configured">
        ○ no key
      </span>
    );
  }
  if (!health) {
    return (
      <span className="text-caption text-fg-subtle shrink-0" aria-label="Untested">
        ○ untested
      </span>
    );
  }
  const color = health.ok ? 'bg-bull' : 'bg-bear';
  const label = health.ok ? 'healthy' : 'failed';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption shrink-0`}
      aria-label={label}
      title={health.ok ? 'Last test passed' : `Last test failed: ${health.error ?? ''}`}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-8 flex flex-col items-center text-center gap-2">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="text-caption text-fg-subtle max-w-md">{body}</p>
    </div>
  );
}