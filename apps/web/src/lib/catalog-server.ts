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

import {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
} from '@hamafx/ai';
import { getDb, schema } from '@hamafx/db';
import { decryptByok } from '@hamafx/shared/encryption';
import {
  type CatalogResponse,
  type ModelDomain,
  type ProviderId,
} from '@hamafx/shared';
import { eq } from 'drizzle-orm';

/**
 * Phase E — the catalog body that the `/api/settings/catalog` route
 * returns. Also imported by RSC server components (the api-keys
 * page, the onboarding page, the new /settings/models page) so
 * the data shape and per-user merging logic live in exactly one
 * place. RSC pages can't fetch() their own host without a full
 * URL — calling this directly is the only way to share the data.
 *
 * `server-only` import makes sure this never accidentally ends up
 * in a client bundle.
 */
export async function buildCatalogForUser(
  userId: string,
): Promise<CatalogResponse> {
  const db = getDb();
  const [settings] = await db
    .select({
      aiApiKeys: schema.userSettings.aiApiKeys,
      defaultModels: schema.userSettings.defaultModels,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
  const userDefaultModels = (settings?.defaultModels ?? {}) as Record<
    string,
    string | null | undefined
  >;

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
    // Apply user override on top of provider defaults. A user-set
    // "<provider>:<modelId>" pair (or just "<modelId>" from a
    // different provider) wins for that domain.
    const effectiveDefaults: Record<ModelDomain, string | null> = {
      fundamental: p.defaultModels.fundamental,
      technical: p.defaultModels.technical,
      summary: p.defaultModels.summary,
      vision: p.defaultModels.vision,
      embedding: p.defaultModels.embedding,
    };
    for (const [domain, value] of Object.entries(userDefaultModels)) {
      if (!value || typeof value !== 'string') continue;
      const sep = value.indexOf(':');
      if (sep < 0) continue;
      const pickedProvider = value.slice(0, sep);
      const pickedModel = value.slice(sep + 1);
      if (pickedProvider === p.id) {
        effectiveDefaults[domain as ModelDomain] = pickedModel;
      }
    }

    const models = (p.models ?? []).map((m) => {
      const qualifiedId =
        p.id === 'vertex'
          ? `google-vertex/${m.modelId}`
          : p.id === 'openrouter'
            ? m.modelId
            : `${p.id}/${m.modelId}`;
      // Is this model the default for any domain?
      const defaultFor = (
        Object.entries(effectiveDefaults) as [ModelDomain, string | null][]
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
      defaultModels: effectiveDefaults,
      models,
      hasKey: Boolean(decrypted?.[p.id as ProviderId]),
      health: healthByProvider.get(p.id) ?? null,
    };
  });

  return {
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
    // All configured providers — pre-sorted cheapest-first so the
    // /settings/models "By purpose" tab can render provider sections
    // in a consistent order without a client sort.
    providers,
    total: providers.length,
    totalModels: providers.reduce((sum, p) => sum + p.models.length, 0),
  };
}

/**
 * Phase E — the user's per-domain default-models map. Same shape
 * as the JSONB column. Re-exported here so RSC pages can read
 * the current values without a fetch.
 */
export async function getDefaultModelsForUser(
  userId: string,
): Promise<Record<ModelDomain, string | undefined>> {
  const db = getDb();
  const [row] = await db
    .select({ defaultModels: schema.userSettings.defaultModels })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  return (row?.defaultModels ?? {}) as Record<ModelDomain, string | undefined>;
}

// silence the unused-import warning when this file is bundled in isolation
void BYOK_PROVIDERS;