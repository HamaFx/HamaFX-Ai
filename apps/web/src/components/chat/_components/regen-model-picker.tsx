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

import { useEffect, useRef, useState } from 'react';
import {IconCircleCheck, IconLoader2} from '@tabler/icons-react';

import { withCsrf } from '@/lib/csrf';
import type { CatalogResponse } from '@hamafx/shared';

interface CacheData {
  catalog: CatalogResponse | null;
  chatModel: string | null;
  fetchedAt: number;
}

let moduleCache: CacheData | null = null;
const CACHE_TTL_MS = 60000; // 1 minute

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

/**
 * Phase F — replaces the 5-domain picker with a single chat_model
 * picker. The "My default" section is now just one row (the user's
 * saved chat_model). The per-provider full list is unchanged so
 * the user can override per-turn without losing access to the rest.
 *
 * Fetched lazily on first open so we don't block the chat thread.
 */
export function RegenModelPicker({ popoverId, activeModelId, onPick }: RegenModelPickerProps) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [chatModel, setChatModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // We re-fetch on every mount (popover-open). The catalog endpoint
  // is `force-dynamic` so it always reflects the current saved keys.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = Date.now();

      // If we have cache and it's not stale, use it and finish
      if (moduleCache && now - moduleCache.fetchedAt < CACHE_TTL_MS) {
        setCatalog(moduleCache.catalog);
        setChatModel(moduleCache.chatModel);
        setLoading(false);
        return;
      }

      // If we have a stale cache, show it immediately (stale-while-revalidate)
      if (moduleCache) {
        setCatalog(moduleCache.catalog);
        setChatModel(moduleCache.chatModel);
        setLoading(false);
      }

      try {
        const [catRes, modelRes] = await Promise.all([
          fetch('/api/settings/catalog', { ...withCsrf(), cache: 'no-store' }),
          fetch('/api/settings/chat-model', {
            ...withCsrf(),
            cache: 'no-store',
          }),
        ]);
        if (cancelled) return;

        let fetchedCatalog: CatalogResponse | null = null;
        let fetchedChatModel: string | null = null;

        if (catRes.ok) {
          fetchedCatalog = await catRes.json();
          setCatalog(fetchedCatalog);
        }
        if (modelRes.ok) {
          const data = (await modelRes.json()) as { chatModel: string | null };
          fetchedChatModel = data.chatModel;
          setChatModel(fetchedChatModel);
        }

        moduleCache = {
          catalog: fetchedCatalog || (moduleCache ? moduleCache.catalog : null),
          chatModel: fetchedChatModel || (moduleCache ? moduleCache.chatModel : null),
          fetchedAt: Date.now(),
        };
      } catch (err) {
        console.error('Error fetching model picker data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard navigation and initial focus
  useEffect(() => {
    if (!loading && containerRef.current) {
      const items = Array.from(
        containerRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
      );
      const activeItem = items.find((item) => item.getAttribute('data-model-id') === activeModelId);
      if (activeItem) {
        activeItem.focus();
      } else if (items[0]) {
        items[0].focus();
      }
    }
  }, [loading, activeModelId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const items = Array.from(
      containerRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
    );
    if (items.length === 0) return;

    const activeEl = document.activeElement as HTMLButtonElement;
    const currentIndex = items.indexOf(activeEl);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        items[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        const popover = document.getElementById(popoverId);
        (popover as HTMLElement | null)?.hidePopover?.();
        // Return focus to the trigger button if it exists
        const trigger = document.querySelector(`[popovertarget="${popoverId}"]`) as HTMLElement | null;
        trigger?.focus();
        break;
      }
      default:
        break;
    }
  };

  function pick(modelId: string) {
    onPick(modelId);
    const popover = document.getElementById(popoverId);
    (popover as HTMLElement | null)?.hidePopover?.();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-subtle">
        <IconLoader2 size={12} className="animate-spin" aria-hidden="true" />
        Loading models…
      </div>
    );
  }

  if (!catalog || catalog.providers.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-fg-subtle">
        Add a key in IconSettings → API Keys to see model options.
      </div>
    );
  }

  const configured = catalog.providers.filter((p) => p.hasKey);
  if (configured.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-fg-subtle">
        Add a key in IconSettings → API Keys to see model options.
      </div>
    );
  }

  // Find the chat-model row by parsing "<providerId>:<bareModelId>"
  // and matching against the configured providers' full catalog.
  const chatModelParts = chatModel?.split(':');
  const chatProvider = chatModelParts
    ? configured.find((p) => p.id === chatModelParts[0])
    : undefined;
  const chatBare = chatModelParts?.[1];
  const chatCatalogModel = chatProvider?.models.find((m) => {
    const bare = m.modelId.includes('/')
      ? m.modelId.split('/').slice(1).join('/')
      : m.modelId;
    return bare === chatBare;
  });
  const chatFullyQualified =
    chatProvider && chatBare
      ? `${chatProvider.id}/${bareModelId(chatBare)}`
      : null;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      role="menu"
      tabIndex={-1}
      className="flex flex-col gap-2 max-h-96 overflow-y-auto min-w-72 focus:outline-none"
    >
      {/* My default — the chat_model the user saved in /settings/models */}
      <section className="flex flex-col gap-0.5">
        <div className="px-2 py-1 text-caption uppercase tracking-wide text-fg-subtle">
          My default
        </div>
        {chatProvider && chatCatalogModel && chatFullyQualified ? (
          <RegenRow
            label={`${chatProvider.displayName} · ${chatCatalogModel.label ?? chatBare}`}
            fullyQualified={chatFullyQualified}
            isActive={activeModelId === chatFullyQualified}
            onClick={() => pick(chatFullyQualified)}
          />
        ) : (
          <div className="px-2 py-1 text-caption text-fg-subtle italic">
            No default set.{' '}
            <a
              href="/settings/models"
              className="text-fg hover:underline not-italic"
            >
              Pick one in IconSettings → Models
            </a>
            .
          </div>
        )}
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

function RegenRow({
  label,
  fullyQualified,
  isActive,
  onClick,
}: {
  label: string;
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
      className="text-fg hover:bg-bg-elev-2 focus:bg-bg-elev-2 flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-xs transition-colors focus:outline-none"
    >
      <span className="truncate">{label}</span>
      {isActive ? (
        <IconCircleCheck
          size={14}
          className="text-bull shrink-0"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
