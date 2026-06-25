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

import 'server-only';

import { cache } from 'react';
import { BYOK_PROVIDERS_LIST } from '@hamafx/ai';
import { getDb, schema } from '@hamafx/db';
import { decryptByok } from '@hamafx/shared/encryption';
import {
  type CatalogResponse,
  type ModelDomain,
  type ProviderId,
} from '@hamafx/shared';
import { eq } from 'drizzle-orm';

/**
 * Phase F — the catalog body that `/api/settings/catalog` returns.
 * Also imported by RSC server components (the api-keys page, the
 * new /settings/models page) so the data shape and per-user
 * filtering logic live in exactly one place. RSC pages can't fetch()
 * their own host without a full URL — calling this directly is the
 * only way to share the data.
 *
 * `server-only` import makes sure this never accidentally ends up
 * in a client bundle.
 */

export const buildCatalogForUser = cache(async function buildCatalogForUser(
  userId: string,
): Promise<CatalogResponse> {

  const db = getDb();
  const [settings] = await db
    .select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;

  // Latest health snapshot per provider (one row per (user, provider)
  // so this is a single round-trip).
  const healthRows = await db
    .select({
      providerId: schema.providerTests.providerId,
      ok: schema.providerTests.ok,
      error: schema.providerTests.error,
      testedAt: schema.providerTests.testedAt,
    })
    .from(schema.providerTests)
    .where(eq(schema.providerTests.userId, userId));
  const healthByProvider = new Map(healthRows.map((h) => [h.providerId, h]));

  const providers = BYOK_PROVIDERS_LIST.map((p) => {
    // Provider's hardcoded spec defaults per domain — used for the
    // `defaultFor` annotation on each model so the UI can highlight
    // the provider's recommended pick for each task type.
    const specDefaults: Record<ModelDomain, string | null> = {
      fundamental: p.defaultModels.fundamental,
      technical: p.defaultModels.technical,
      summary: p.defaultModels.summary,
      vision: p.defaultModels.vision,
      embedding: p.defaultModels.embedding,
    };

    const models = (p.models ?? []).map((m) => {
      const qualifiedId =
        p.id === 'vertex'
          ? `google-vertex/${m.modelId}`
          : p.id === 'openrouter'
            ? m.modelId
            : `${p.id}/${m.modelId}`;
      // Is this model the default for any domain? (per-provider spec)
      const defaultFor = (
        Object.entries(specDefaults) as [ModelDomain, string | null][]
      ).find(([, id]) => id === m.modelId)?.[0];
      return {
        ...m,
        providerId: p.id,
        id: qualifiedId,
        ...(defaultFor ? { defaultFor } : {}),
      };
    });

    return {
      id: p.id,
      displayName: p.displayName,
      familyName: p.familyName,
      keyHint: p.keyHint,
      description: p.description,
      pricingTier: p.pricingTier,
      ...(p.bestFor !== undefined ? { bestFor: p.bestFor } : {}),
      supports: p.supports,
      // Surface the per-provider hardcoded defaults so the regen-model-picker
      // can label "provider's recommended for technical: claude-haiku-4-5"
      // without a separate fetch. The UI treats these as hints, not user
      // picks (the user pick lives in user_settings.chat_model).
      defaultModels: specDefaults,
      models,
      hasKey: Boolean(decrypted?.[p.id as ProviderId]),
      health: healthByProvider.get(p.id) ?? null,
    };
  });

  const catalog: CatalogResponse = {
    domains: [
      {
        id: 'fundamental',
        label: 'Deep reasoning',
        description:
          'Long, complex analysis (chart setup, weekly recap, commit-message-free reasoning).',
      },
      {
        id: 'technical',
        label: 'Technical',
        description: 'Chart pattern recognition, indicator math, JSON tools.',
      },
      {
        id: 'summary',
        label: 'Quick summary',
        description: 'Brief replies, alerts, headlines. Cheap and fast.',
      },
      {
        id: 'vision',
        label: 'Vision / image input',
        description: 'Chart-image upload, screenshot parsing.',
      },
      {
        id: 'embedding',
        label: 'Embeddings',
        description: 'Semantic search, journal clustering.',
      },
    ],
    providers,
    total: providers.length,
    totalModels: providers.reduce((sum, p) => sum + p.models.length, 0),
  };

  return catalog;
});
