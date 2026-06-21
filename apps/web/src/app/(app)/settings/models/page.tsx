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
import {
  buildCatalogForUser,
  getDefaultModelsForUser,
} from '@/lib/catalog-server';
import type {
  CatalogModel,
  ModelDomain,
  ProviderMeta,
} from '@hamafx/shared';

import { ModelsBrowser } from './_components/models-browser';

/**
 * Phase E — Model Settings.
 *
 * A dedicated browser over the full provider × model catalog. Two views:
 *   - "By purpose" — group every provider's flagship/fast/cheap model
 *     for each of the five domains (deep reasoning / technical / etc.)
 *   - "By provider" — drill into one provider and see every model it
 *     serves, with full metadata.
 *
 * "Set as default" persists to `user_settings.default_models` via the
 * `/api/settings/default-model` endpoint.
 *
 * The catalog endpoint is the source of truth for everything you see.
 * The page is a thin server shell that does the auth check and
 * fetches both the catalog and the user's current defaults; the
 * heavy lifting (filtering, search, set-as-default mutations) lives
 * in the client `<ModelsBrowser>` component below.
 */
export default async function ModelsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  // Phase E — call the catalog builder + default-model reader
  // directly. RSC pages can't fetch() their own host without a
  // full URL (and APP_URL isn't always set on Vercel), so we share
  // a server-side helper.
  const [catalog, defaults] = await Promise.all([
    buildCatalogForUser(session.user.id),
    getDefaultModelsForUser(session.user.id),
  ]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-fg">Models</h2>
          <p className="text-sm text-fg-subtle max-w-2xl">
            Choose which AI model handles each task. Defaults here apply to
            every chat turn unless you pick a different model for that turn
            from the chat toolbar.
          </p>
        </div>
        <Link
          href="/settings/api-keys"
          className="text-sm font-medium text-brand hover:underline"
        >
          Manage API keys →
        </Link>
      </div>

      <ModelsBrowser
        catalog={catalog}
        defaults={Object.fromEntries(
          Object.entries(defaults).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ) as { fundamental?: string; technical?: string; summary?: string; vision?: string; embedding?: string }}
      />

      <p className="text-caption text-fg-subtle text-center">
        {catalog?.total ?? 0} providers · {catalog?.totalModels ?? 0} models
        in the registry
      </p>
    </div>
  );
}

/**
 * Augment the CatalogModel with `tierLabel` + `tierOrder` for the
 * browser's filter UI. Returns the providers with their model arrays
 * sorted by tier (flagship → pro → fast → lite → embedding).
 */
export function sortProvidersForBrowser(
  providers: ProviderMeta[],
): ProviderMeta[] {
  const tierOrder: Record<NonNullable<CatalogModel['tier']>, number> = {
    flagship: 0,
    pro: 1,
    fast: 2,
    lite: 3,
    embedding: 4,
  };
  return providers
    .map((p) => ({
      ...p,
      models: [...p.models].sort((a, b) => {
        const oa = a.tier ? tierOrder[a.tier] : 99;
        const ob = b.tier ? tierOrder[b.tier] : 99;
        return oa - ob;
      }),
    }))
    .sort((a, b) => {
      // Free tier first, then low / medium / high.
      const order = { free: 0, low: 1, medium: 2, high: 3 };
      return order[a.pricingTier] - order[b.pricingTier];
    });
}

export type { ModelDomain };