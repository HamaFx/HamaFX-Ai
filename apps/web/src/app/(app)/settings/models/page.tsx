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

import { ChatModelPicker } from './_components/chat-model-picker';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Models · HamaFX-Ai',
  description: 'Pick the default model that handles every chat turn.',
};

/**
 * Phase F — collapsed the 5-domain picker into a single
 * "default chat model" dropdown. The previous per-domain browser
 * is preserved behind an Advanced disclosure for power users
 * (see _components/advanced-models.tsx).
 *
 * The catalog endpoint is the source of truth for everything you
 * see. The page is a thin server shell that does the auth check
 * and fetches the catalog; the picker itself is a small client
 * component that hits /api/settings/chat-model.
 */
export default async function ModelsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  // RSC pages can't fetch() their own host without a full URL
  // (and APP_URL isn't always set on Vercel), so we share the
  // server-side `buildCatalogForUser` helper.
  const catalog = await buildCatalogForUser(session.user.id);

  // The picker only renders for providers the user has a key for.
  // Keeping the full catalog would surface "pick a Google model" when
  // the user has no Google key, which silently no-ops on save.
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

      <ChatModelPicker
        initialChatModel={null}
        providers={configured}
      />

      <p className="text-caption text-fg-subtle text-center">
        {catalog.total} providers · {catalog.totalModels} models in
        the registry
      </p>
    </div>
  );
}
