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

// /api/settings/catalog — full provider+model catalog.
//
// Phase E — model picker overhaul.
//
// Returns every model from every supported provider, plus the live
// status (does the user have a key saved for this provider, what's
// the user's per-domain default override?). Consumed by:
//   - /settings/models (the dedicated models browser)
//   - /settings/api-keys (per-card model preview)
//   - The chat "Regenerate with…" popover
//   - /onboarding (step 3 lets users pick their first default)
//
// Auth: NextAuth session gate. Returns only the requesting user's
// own key-presence state.

import {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  type ModelDomain,
  type ModelSpec,
} from '@hamafx/ai';
import { decryptByok, type ProviderId } from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Shape of each model in the response. The `providerId` is added
 * by this endpoint — the registry only stores the bare model id.
 * The `id` field is the fully-qualified id (provider/modelId),
 * which is what the user sees in the picker and what the resolver
 * accepts as a modelOverride.
 */
interface CatalogModel extends ModelSpec {
  providerId: ProviderId;
  /** Fully-qualified id used by resolveOverrideModel + AI SDK paths. */
  id: string;
  /** Default for which domain this model is currently assigned. */
  defaultFor?: ModelDomain;
}

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const [settings] = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        defaultModels: schema.userSettings.defaultModels,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
    const userDefaultModels = settings?.defaultModels ?? {};

    // Load the latest health snapshot per provider (one row per
    // (user, provider) so this is a single round-trip).
    const healthRows = await db
      .select({
        providerId: schema.providerTests.providerId,
        ok: schema.providerTests.ok,
        error: schema.providerTests.error,
        testedAt: schema.providerTests.testedAt,
      })
      .from(schema.providerTests)
      .where(eq(schema.providerTests.userId, user.userId));
    const healthByProvider = new Map(healthRows.map((h) => [h.providerId, h]));

    // Build the catalog. We compute `defaultFor` (which domain this
    // model currently serves as the default for, considering user
    // overrides first, then BYOK_PROVIDERS.defaultModels) so the UI
    // can show a "✓ Default for deep reasoning" badge without a
    // second pass.
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
        // Override format: "<providerId>:<modelId>". If the user
        // picked THIS provider's model, take it. If they picked a
        // different provider, leave the entry alone (it stays as
        // the spec default for the user, but the picked model
        // belongs to the other provider).
        const sep = value.indexOf(':');
        if (sep < 0) continue;
        const pickedProvider = value.slice(0, sep);
        const pickedModel = value.slice(sep + 1);
        if (pickedProvider === p.id) {
          effectiveDefaults[domain as ModelDomain] = pickedModel;
        }
      }

      const models: CatalogModel[] = (p.models ?? []).map((m) => {
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
        bestFor: p.bestFor,
        supports: p.supports,
        defaultModels: effectiveDefaults,
        models,
        hasKey: Boolean(decrypted?.[p.id]),
        health: healthByProvider.get(p.id) ?? null,
      };
    });

    return Response.json({
      domains: [
        { id: 'fundamental', label: 'Deep reasoning', description: 'Long, complex analysis (chart setup, weekly recap, commit-message-free reasoning).' },
        { id: 'technical', label: 'Technical', description: 'Chart pattern recognition, indicator math, JSON tools.' },
        { id: 'summary', label: 'Quick summary', description: 'Brief replies, alerts, headlines. Cheap and fast.' },
        { id: 'vision', label: 'Vision / image input', description: 'Chart-image upload, screenshot parsing.' },
        { id: 'embedding', label: 'Embeddings', description: 'Semantic search, journal clustering.' },
      ],
      // All configured providers — pre-sorted cheapest-first so the
      // /settings/models "By purpose" tab can render provider sections
      // in a consistent order without a client sort.
      providers,
      total: providers.length,
      totalModels: providers.reduce((sum, p) => sum + p.models.length, 0),
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// sanity-mark for BYOK_PROVIDERS — the map is referenced through
// BYOK_PROVIDERS_LIST below so this import looks unused to eslint.
void BYOK_PROVIDERS;