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

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/catalog-server';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

import {
  ChatModelPicker,
  EmbeddingModelPicker,
  VisionModelPicker,
} from './_components/model-picker';
import { FallbackChainPicker } from './_components/fallback-chain-picker';

export const revalidate = 60;

export const metadata = {
  title: 'Models · HamaFX-Ai',
  description: 'Pick the default chat, vision, and embedding models.',
};

/**
 * Phase D2 — single-page models settings.
 *
 * The chat picker is the only surface most users touch (top section,
 * always visible). Vision + embedding pickers live under an
 * <details> Advanced disclosure because:
 *   - Most users don't think about which model analyses chart
 *     screenshots or which model embeds their journal entries.
 *   - The defaults are usually fine (operator env + spec defaults).
 *   - Showing 3 dropdowns up front pushes the important one down.
 *
 * Each picker filters the catalog to its own capability:
 *   - chat:      any non-embedding model from any configured provider
 *   - vision:    non-embedding model from a vision-capable provider
 *   - embedding: embedding model from an embedding-capable provider
 *
 * RSC pages can't fetch() their own host without a full URL
 * (and APP_URL isn't always set on Vercel), so we share the
 * server-side `buildCatalogForUser` helper.
 */
export default async function ModelsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const db = getDb();
  const [userRow] = await db
    .select({
      aiFallbackChain: schema.userSettings.aiFallbackChain,
      chatModel: schema.userSettings.chatModel,
      visionModel: schema.userSettings.visionModel,
      embeddingModel: schema.userSettings.embeddingModel,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  const catalog = await buildCatalogForUser(session.user.id);

  // The pickers only render for providers the user has a key for.
  // Showing "pick a Google model" when the user has no Google key
  // would silently no-op on save.
  const configured = catalog.providers.filter((p) => p.hasKey);
  const initialChain = userRow?.aiFallbackChain ?? [];
  const initialChatModel = userRow?.chatModel ?? null;
  const initialVisionModel = userRow?.visionModel ?? null;
  const initialEmbeddingModel = userRow?.embeddingModel ?? null;

  const allModels = catalog.providers.flatMap((p) =>
    p.models.map((m) => ({ ...m, providerName: p.displayName })),
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-fg">Models</h2>
          <p className="text-sm text-fg-subtle max-w-2xl">
            Pick the model that handles every chat turn. Per-turn
            overrides via the chat toolbar still work.
          </p>
        </div>
        <Link
          href="/settings/api-keys"
          className="text-sm font-medium text-brand hover:underline shrink-0"
        >
          Manage API keys →
        </Link>
      </div>

      <ChatModelPicker initialValue={initialChatModel} providers={configured} />

      <FallbackChainPicker initialChain={initialChain} configuredProviders={configured} />

      <details className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden">
        <summary aria-label="Toggle advanced model settings" className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elev-2 transition-colors">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-fg">
              Advanced
            </span>
            <span className="text-caption text-fg-subtle">
              Pick vision + embedding models independently of chat.
            </span>
          </div>
          <span className="text-caption text-fg-subtle">▾</span>
        </summary>
        <div className="border-t border-divider p-4 flex flex-col gap-4">
          <VisionModelPicker initialValue={initialVisionModel} providers={configured} />
          <EmbeddingModelPicker initialValue={initialEmbeddingModel} providers={configured} />
        </div>
      </details>

      <details className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden">
        <summary aria-label="Toggle model comparison table" className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elev-2 transition-colors">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-fg">
              Model Comparison
            </span>
            <span className="text-caption text-fg-subtle">
              Compare prices, capabilities, and tiers across all configured providers.
            </span>
          </div>
          <span className="text-caption text-fg-subtle">▾</span>
        </summary>
        <div className="border-t border-divider overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider">
                <th className="text-left px-4 py-2.5 text-fg-muted font-medium">Provider</th>
                <th className="text-left px-4 py-2.5 text-fg-muted font-medium">Model</th>
                <th className="text-left px-4 py-2.5 text-fg-muted font-medium">Tier</th>
                <th className="text-right px-4 py-2.5 text-fg-muted font-medium">Input / 1M tok</th>
                <th className="text-right px-4 py-2.5 text-fg-muted font-medium">Output / 1M tok</th>
                <th className="text-center px-4 py-2.5 text-fg-muted font-medium">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {allModels.map((m) => (
                <tr key={`${m.providerName}:${m.modelId}`} className="border-b border-divider/50 last:border-0 hover:bg-bg-elev-2/40">
                  <td className="px-4 py-2.5 text-fg font-medium">{m.providerName}</td>
                  <td className="px-4 py-2.5 text-fg font-mono text-xs">{m.label ?? m.modelId}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full bg-bg-elev-2 px-2 py-0.5 text-caption font-medium text-fg-subtle border border-divider">
                      {m.tier ?? 'flagship'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-fg tabular-nums">
                    {m.inputPerMTokUsd != null ? `$${m.inputPerMTokUsd.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-fg tabular-nums">
                    {m.outputPerMTokUsd != null ? `$${m.outputPerMTokUsd.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {m.tier !== 'embedding' ? (
                        <span className="inline-flex items-center rounded-full bg-bull/10 text-bull px-1.5 py-0.5 text-caption font-medium">Chat</span>
                      ) : null}
                      {m.tier === 'embedding' ? (
                        <span className="inline-flex items-center rounded-full bg-bg-elev-3 text-fg-muted px-1.5 py-0.5 text-caption font-medium">Embed</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {allModels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-fg-subtle">
                    No models available. Configure an API key first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-caption text-fg-subtle text-center">
        {catalog.total} providers · {catalog.totalModels} models in
        the registry
      </p>
    </div>
  );
}