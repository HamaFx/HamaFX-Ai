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
import {
  computeUsage,
  BYOK_PROVIDERS_LIST,
  type ProviderBreakdown,
} from '@hamafx/ai';
import { ApiKeyCard } from './_components/api-key-card';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';
import { BulkTestButton } from './_components/bulk-test-button';

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

/**
 * Phase D — server action: run a bulk test across every configured
 * BYOK provider. Called from the page-level "Test all" button.
 *
 * Delegates to /api/settings/bulk-test (re-uses the same code path
 * as the standalone route). We can't import the route handler
 * directly across the server/client boundary, so we re-implement
 * the trivial bits here. The route remains the single source of
 * truth for the per-provider test logic.
 */
async function bulkTestAll() {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const { withRateLimit } = await import('@hamafx/db');
  const rate = await withRateLimit(session.user.id, 'bulk_test', 2, 5 * 60_000);
  if (!rate.allowed) {
    throw new Error('Bulk test rate-limited. Try again in a few minutes.');
  }

  const { testProviderKey } = await import('@hamafx/ai');
  const db = getDb();
  const [settings] = await db
    .select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));
  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
  const testedAt = new Date();

  const rows: Array<typeof schema.providerTests.$inferInsert> = [];
  for (const providerId of PROVIDER_IDS) {
    const key = decrypted?.[providerId];
    if (typeof key !== 'string' || key.trim().length === 0) continue;
    const r = await testProviderKey(providerId, key);
    rows.push({
      userId: session.user.id,
      providerId,
      ok: r.ok,
      error: r.ok ? null : r.error ?? 'unknown error',
      testedAt: testedAt.toISOString(),
    });
  }
  if (rows.length > 0) {
    await db
      .delete(schema.providerTests)
      .where(eq(schema.providerTests.userId, session.user.id));
    await db.insert(schema.providerTests).values(rows);
  }
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

  // Phase D — per-provider usage. We computeUsage once here and
  // map the breakdown by BYOK id so each card receives just the
  // turns + cost for its own provider. No N+1 queries.
  const usage = await computeUsage(session.user.id);
  const usageByProvider = new Map<string, { turns: number; costUsd: number }>();
  for (const p of usage.byProvider as ProviderBreakdown[]) {
    if (p.byokProviderId) {
      usageByProvider.set(p.byokProviderId, {
        turns: p.turns,
        costUsd: p.costUsd,
      });
    }
  }

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

  // Phase D — group providers into "configured" and "available" so
  // the page can show a clear CTA section when no keys are set.
  // We split rather than render all 9 in one long list so the
  // empty state (no keys at all) feels intentional.
  const configured = BYOK_PROVIDERS_LIST.filter(
    (p) => typeof decrypted?.[p.id as ProviderId] === 'string' &&
      (decrypted?.[p.id as ProviderId] ?? '').trim().length > 0,
  );
  const available = BYOK_PROVIDERS_LIST.filter((p) => !configured.includes(p));

  const totalConfigured = configured.length;
  const totalFailed = Array.from(healthByProvider.values()).filter((h) => !h.ok).length;
  const totalTurns = usage.thirtyDayTurns;
  const totalCost = usage.thirtyDayUsd;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {fromChat ? (
        <ApiKeysLandingBanner
          {...(preservedPrompt ? { prompt: preservedPrompt } : {})}
        />
      ) : null}

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-fg">API Keys</h2>
        <p className="text-sm text-fg-subtle">
          HamaFX-Ai is BYOK. Provide your own keys for the AI models you want
          to use. Keys are encrypted at rest with AES-256-GCM.
        </p>
      </div>

      {/* Summary chips — quick at-a-glance state. */}
      <div className="border border-divider bg-bg-elev-1 rounded-lg p-3 flex flex-wrap items-center gap-2 text-caption">
        <span className="rounded-full bg-brand/15 px-2.5 py-1 font-medium text-brand tabular-nums">
          {totalConfigured} / {BYOK_PROVIDERS_LIST.length} configured
        </span>
        {totalFailed > 0 ? (
          <span className="rounded-full bg-bear/15 px-2.5 py-1 font-medium text-bear tabular-nums">
            {totalFailed} failing
          </span>
        ) : null}
        <span className="rounded-full bg-bg-elev-2 px-2.5 py-1 font-medium text-fg-subtle tabular-nums">
          {totalTurns} turns · ${totalCost.toFixed(2)} this month
        </span>
        <span className="ml-auto">
          <BulkTestButton action={bulkTestAll} disabled={totalConfigured === 0} />
        </span>
      </div>

      {/* Empty state when no providers are configured. */}
      {totalConfigured === 0 ? (
        <div className="border border-divider bg-bg-elev-1 rounded-lg p-6 flex flex-col items-center text-center gap-3">
          <div className="text-3xl">🔑</div>
          <div>
            <h3 className="text-sm font-semibold text-fg">No API keys configured yet</h3>
            <p className="text-caption text-fg-subtle mt-1 max-w-md">
              Pick a provider below and paste your API key. The free tier
              (Google Gemini or Groq) is a good starting point — the chat
              works as soon as one key is saved.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="rounded-full bg-bull/15 px-2.5 py-1 text-caption font-medium text-bull">
              Google Gemini · free
            </span>
            <span className="rounded-full bg-bull/15 px-2.5 py-1 text-caption font-medium text-bull">
              Groq · free
            </span>
            <span className="rounded-full bg-bg-elev-2 px-2.5 py-1 text-caption font-medium text-fg-subtle">
              + 7 paid options
            </span>
          </div>
        </div>
      ) : null}

      <form action={updateApiKeys} className="flex flex-col gap-8">
        {configured.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
              Configured
            </h3>
            {configured.map((p) => {
              const health = healthByProvider.get(p.id);
              const u = usageByProvider.get(p.id);
              return (
                <ApiKeyCard
                  key={p.id}
                  provider={toClientMeta(p)}
                  currentValue={decrypted?.[p.id as ProviderId] ?? ''}
                  {...(health ? { health } : {})}
                  {...(u ? { usage: u } : {})}
                />
              );
            })}
          </section>
        ) : null}

        {available.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
              {configured.length > 0 ? 'Add another' : 'Pick a provider'}
            </h3>
            {available.map((p) => {
              const health = healthByProvider.get(p.id);
              const u = usageByProvider.get(p.id);
              return (
                <ApiKeyCard
                  key={p.id}
                  provider={toClientMeta(p)}
                  currentValue=""
                  {...(health ? { health } : {})}
                  {...(u ? { usage: u } : {})}
                />
              );
            })}
          </section>
        ) : null}

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
