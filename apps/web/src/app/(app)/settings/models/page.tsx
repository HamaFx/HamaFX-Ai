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

import {
  ChatModelPicker,
  EmbeddingModelPicker,
  VisionModelPicker,
} from './_components/model-picker';

export const dynamic = 'force-dynamic';

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

  const catalog = await buildCatalogForUser(session.user.id);

  // The pickers only render for providers the user has a key for.
  // Showing "pick a Google model" when the user has no Google key
  // would silently no-op on save.
  const configured = catalog.providers.filter((p) => p.hasKey);

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

      <ChatModelPicker initialValue={null} providers={configured} />

      <details className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden">
        <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elev-2 transition-colors">
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
          <VisionModelPicker providers={configured} />
          <EmbeddingModelPicker providers={configured} />
        </div>
      </details>

      <p className="text-caption text-fg-subtle text-center">
        {catalog.total} providers · {catalog.totalModels} models in
        the registry
      </p>
    </div>
  );
}