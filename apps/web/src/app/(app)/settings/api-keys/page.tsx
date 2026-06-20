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

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import {
  encryptByok,
  decryptByok,
  PROVIDER_IDS,
  type ProviderId,
  type ByokPayload,
} from '@hamafx/shared/encryption';
import { BYOK_PROVIDERS, BYOK_PROVIDERS_LIST } from '@hamafx/ai';
import { ApiKeyCard } from './_components/api-key-card';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';

async function updateApiKeys(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  // Build the encrypted payload from the submitted keys. Empty
  // strings clear a previously stored key (don't keep stale entries).
  const keys: ByokPayload = {};
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(id);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      keys[id] = raw.trim();
    }
  }

  const db = getDb();
  await db.update(schema.userSettings)
    .set({
      // Always store the payload — even an empty object — so a "clear
      // all" action works by submitting the form with empty fields.
      aiApiKeys: Object.keys(keys).length > 0 ? encryptByok(keys) : null,
    })
    .where(eq(schema.userSettings.userId, session.user.id));

  revalidatePath('/settings/api-keys');
}

export default async function ApiKeysSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; prompt?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Phase A — UX_UPGRADE_PLAN.md item 4. When the user lands here
  // from /chat with no AI provider configured, surface a dismissible
  // banner that explains what to do. The banner also offers a deep
  // link back to /chat carrying the original ?prompt= if any, so
  // "Ask AI" affordances don't lose the user's intent.
  const sp = (await searchParams) ?? {};
  const fromChat = sp.from === 'chat';
  const preservedPrompt = sp.prompt && sp.prompt.trim().length > 0 ? sp.prompt : null;

  const db = getDb();
  const [settings] = await db.select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;

  // Phase A — UX_UPGRADE_PLAN.md item 7. Load the latest health
  // snapshot per provider so the badge can render without waiting
  // for the user to click "Test". Single round-trip; the row PK
  // is (userId, providerId) so the result is naturally keyed.
  const healthRows = await db
    .select({
      providerId: schema.providerTests.providerId,
      ok: schema.providerTests.ok,
      error: schema.providerTests.error,
      testedAt: schema.providerTests.testedAt,
    })
    .from(schema.providerTests)
    .where(eq(schema.providerTests.userId, session.user.id));
  const healthByProvider = new Map(
    healthRows.map((h) => [
      h.providerId,
      {
        ok: h.ok,
        error: h.error,
        // testedAt has `mode: 'string'` in the schema, so the value
        // is always a string already — no Date coercion needed.
        testedAt: h.testedAt,
      },
    ]),
  );

  // Strip server-only fields (factory, defaultModels) before crossing the
  // server→client boundary. RSC serializes props; functions can't be
  // sent. Group by pricing tier for the UI.
  // Phase C — UX_UPGRADE_PLAN.md item 16: pass `bestFor` and
  // `supports` through so the api-keys card tooltip can show them.
  // Conditional spread keeps strict-optional fields happy.
  const toClientMeta = (p: (typeof BYOK_PROVIDERS_LIST)[number]) => ({
    id: p.id,
    displayName: p.displayName,
    familyName: p.familyName,
    keyHint: p.keyHint,
    description: p.description,
    pricingTier: p.pricingTier,
    ...(p.bestFor !== undefined ? { bestFor: p.bestFor } : {}),
    supports: p.supports,
  });
  const freeProviders = BYOK_PROVIDERS_LIST.filter(
    (p) => p.pricingTier === 'free',
  ).map(toClientMeta);
  const paidProviders = BYOK_PROVIDERS_LIST.filter(
    (p) => p.pricingTier !== 'free',
  ).map(toClientMeta);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {fromChat ? (
        <ApiKeysLandingBanner
          {...(preservedPrompt ? { prompt: preservedPrompt } : {})}
        />
      ) : null}

      <div>
        <h2 className="text-lg font-semibold text-fg">API Keys</h2>
        <p className="text-sm text-fg-subtle">
          HamaFX-Ai is BYOK. Provide your own keys for the AI models you want
          to use. Keys are encrypted at rest with AES-256-GCM.
        </p>
      </div>

      <form action={updateApiKeys} className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
            Free tier
          </h3>
          {freeProviders.map((p) => {
            const health = healthByProvider.get(p.id);
            return (
              <ApiKeyCard
                key={p.id}
                provider={p}
                currentValue={decrypted?.[p.id as ProviderId] ?? ''}
                {...(health ? { health } : {})}
              />
            );
          })}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
            Paid tier
          </h3>
          {paidProviders.map((p) => {
            const health = healthByProvider.get(p.id);
            return (
              <ApiKeyCard
                key={p.id}
                provider={p}
                currentValue={decrypted?.[p.id as ProviderId] ?? ''}
                {...(health ? { health } : {})}
              />
            );
          })}
        </section>

        <div className="flex justify-end gap-2">
          {fromChat && preservedPrompt ? (
            <Link
              href={`/chat?prompt=${encodeURIComponent(preservedPrompt)}`}
              className="border border-divider bg-bg-elev-2 text-fg hover:bg-bg-elev-3 inline-flex h-12 items-center justify-center rounded-lg px-4 text-sm font-medium"
            >
              Skip and continue to chat
            </Link>
          ) : null}
          <Button type="submit">Save Keys</Button>
        </div>
      </form>
    </div>
  );
}

// Silence the unused-import warning for BYOK_PROVIDERS (kept for
// future per-provider filtering — e.g. disabled-by-feature-flag).
void BYOK_PROVIDERS;