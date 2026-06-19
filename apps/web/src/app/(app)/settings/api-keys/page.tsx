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

export default async function ApiKeysSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  const [settings] = await db.select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
  // Group providers: free / paid so the UI tells the user which keys have
  // no ongoing cost. The registry defines `pricingTier` per provider.
  const freeProviders = BYOK_PROVIDERS_LIST.filter(
    (p) => p.pricingTier === 'free',
  );
  const paidProviders = BYOK_PROVIDERS_LIST.filter(
    (p) => p.pricingTier !== 'free',
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
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
          {freeProviders.map((p) => (
            <ApiKeyCard
              key={p.id}
              provider={p}
              currentValue={decrypted?.[p.id as ProviderId] ?? ''}
            />
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
            Paid tier
          </h3>
          {paidProviders.map((p) => (
            <ApiKeyCard
              key={p.id}
              provider={p}
              currentValue={decrypted?.[p.id as ProviderId] ?? ''}
            />
          ))}
        </section>

        <div className="flex justify-end">
          <Button type="submit">Save Keys</Button>
        </div>
      </form>
    </div>
  );
}

// Silence the unused-import warning for BYOK_PROVIDERS (kept for
// future per-provider filtering — e.g. disabled-by-feature-flag).
void BYOK_PROVIDERS;