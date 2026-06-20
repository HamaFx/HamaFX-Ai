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
// Phase D — api-keys page overhaul.
//
// Returns the static catalog (every supported provider, every default
// model per domain) plus the live status (does the user have a key
// saved for this provider?). Used by /settings/api-keys to render
// per-provider model lists and by the new "Provider catalog" section.
//
// Auth: NextAuth session gate. Returns only the requesting user's
// own key-presence state.

import { BYOK_PROVIDERS, BYOK_PROVIDERS_LIST } from '@hamafx/ai';
import { decryptByok } from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const [settings] = await db
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;

    // Load the latest health snapshot per provider (tested_at).
    // Single round-trip; the table PK is (userId, providerId) so
    // the result is naturally keyed per provider.
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

    const providers = BYOK_PROVIDERS_LIST.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      familyName: p.familyName,
      description: p.description,
      pricingTier: p.pricingTier,
      bestFor: p.bestFor,
      supports: p.supports,
      // Strip the function field so the response is JSON-serialisable.
      models: p.defaultModels,
      hasKey: Boolean(decrypted?.[p.id]),
      health: healthByProvider.get(p.id) ?? null,
    }));

    // The five domains — surfaced separately so the UI can label
    // each model id with its role ("fundamental reasoning",
    // "summary fast/cheap", etc.).
    return Response.json({
      domains: [
        { id: 'fundamental', label: 'Deep reasoning' },
        { id: 'technical', label: 'Technical' },
        { id: 'summary', label: 'Quick summary' },
        { id: 'vision', label: 'Vision / image input' },
        { id: 'embedding', label: 'Embeddings' },
      ],
      providers,
      total: providers.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// sanity-mark for BYOK_PROVIDERS — the map is referenced through
// BYOK_PROVIDERS_LIST below so this import looks unused to eslint.
void BYOK_PROVIDERS;
