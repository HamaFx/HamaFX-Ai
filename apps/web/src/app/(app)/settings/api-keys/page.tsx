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
import { buildCatalogForUser } from '@/lib/catalog-server';
import { getDb, schema } from '@hamafx/db';
import { eq, and } from 'drizzle-orm';
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
  testProviderKey,
  type ProviderBreakdown,
} from '@hamafx/ai';
import { ApiKeyCard } from './_components/api-key-card';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';
import { BulkTestButton } from './_components/bulk-test-button';
import { SaveBar } from './_components/save-bar';
import { MarketDataConfig } from './_components/market-data-config';
import { ExportImportKeys } from './_components/export-import-keys';

/**
 * Phase D — server action result type. The client reads this via
 * useActionState to show "saving…" → "Saved!" feedback and any
 * error toast on failure.
 */
export type SaveKeysResult =
  | { status: 'idle' }
  | { status: 'success'; savedCount: number; clearedCount: number; at: number }
  | { status: 'error'; message: string };

async function updateApiKeys(
  _prevState: SaveKeysResult,
  formData: FormData,
): Promise<SaveKeysResult> {
  'use server';
  const session = await auth();
  if (!session?.user?.id) {
    return { status: 'error', message: 'Not authenticated' };
  }

  // Build the encrypted payload from the submitted keys. Empty
  // strings clear a previously stored key (don't keep stale entries).
  const keys: ByokPayload = {};
  let clearedCount = 0;
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(id);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      keys[id] = raw.trim();
    } else {
      clearedCount += 1;
    }
  }

  try {
    const db = getDb();
    
    // 1. Get old keys to find what changed/new keys to test
    const [oldSettings] = await db.select({
      aiApiKeys: schema.userSettings.aiApiKeys,
      aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
    })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, session.user.id));
    const oldDecrypted = oldSettings?.aiApiKeys ? decryptByok(oldSettings.aiApiKeys) : null;
    const oldUpdatedAt = oldSettings?.aiApiKeysUpdatedAt ?? {};

    const newUpdatedAt = { ...oldUpdatedAt };
    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];
      if (newKey && newKey !== oldKey) {
        newUpdatedAt[id] = new Date().toISOString();
      } else if (!newKey && oldKey) {
        delete newUpdatedAt[id];
      }
    }

    // 2. Update user settings first
    await db.update(schema.userSettings)
      .set({
        // Always store the payload — even an empty object — so a "clear
        // all" action works by submitting the form with empty fields.
        aiApiKeys: Object.keys(keys).length > 0 ? encryptByok(keys) : null,
        aiApiKeysUpdatedAt: Object.keys(newUpdatedAt).length > 0 ? newUpdatedAt : null,
      })
      .where(eq(schema.userSettings.userId, session.user.id));

    // 3. For any changed/new keys, test them. For cleared keys, delete health record.
    const testedAt = new Date();
    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];

      if (newKey && newKey !== oldKey) {
        // Run test connection
        const result = await testProviderKey(id, newKey);
        await db
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, session.user.id),
              eq(schema.providerTests.providerId, id),
            ),
          );
        await db.insert(schema.providerTests).values({
          userId: session.user.id,
          providerId: id,
          ok: result.ok,
          error: result.ok ? null : (result.error ?? 'unknown error'),
          testedAt: testedAt.toISOString(),
        });
      } else if (!newKey && oldKey) {
        // Key was cleared, remove health record
        await db
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, session.user.id),
              eq(schema.providerTests.providerId, id),
            ),
          );
      }
    }

    revalidatePath('/settings/api-keys');
    return {
      status: 'success',
      savedCount: Object.keys(keys).length,
      clearedCount,
      at: Date.now(),
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Default export — the page component. Server-component shell that
 * fetches the catalog and renders the BYOK cards + bulk-test button.
 */
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
  const [settings] = await db.select({
    aiApiKeys: schema.userSettings.aiApiKeys,
    aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
    marketDataProvider: schema.userSettings.marketDataProvider,
  })
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
      rateLimit: schema.providerTests.rateLimit,
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
        rateLimit: h.rateLimit,
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

  // Phase E — call the catalog builder directly. RSC pages can't
  // fetch() their own host without a full URL (and APP_URL isn't
  // always set on Vercel), so the route handler and the RSC pages
  // share a `buildCatalogForUser(userId)` helper instead.
  const catalog = await buildCatalogForUser(session.user.id);

  // The catalog endpoint already does the user-overrides merge for
  // defaultModels and the per-provider key/health check. We just
  // filter into configured vs available here.
  const configured = catalog.providers.filter((p) => p.hasKey);
  const available = catalog.providers.filter((p) => !p.hasKey);

  const totalConfigured = configured.length;
  const totalFailed = catalog.providers.filter((p) => p.health && !p.health.ok).length;
  const totalTurns = usage.thirtyDayTurns;
  const totalCost = usage.thirtyDayUsd;

  const testedAtTimes = healthRows
    .map((h) => new Date(h.testedAt).getTime())
    .filter((t) => !isNaN(t));
  const lastTestedTime = testedAtTimes.length > 0 ? Math.max(...testedAtTimes) : null;
  const lastTestedStr = lastTestedTime ? new Date(lastTestedTime).toISOString() : null;

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
          HamaFX-Ai is BYOK. Provide your own keys for the AI models you want to
          use. Keys are encrypted at rest with AES-256-GCM.
        </p>
      </div>

      {/* Premium Provider Health Dashboard */}
      <div className="border border-divider bg-bg-elev-1 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {totalConfigured === 0 ? (
              <span className="size-3 rounded-full bg-fg-muted/40 animate-pulse" />
            ) : totalFailed > 0 ? (
              <span className="size-3 rounded-full bg-bear animate-pulse" />
            ) : (
              <span className="size-3 rounded-full bg-bull" />
            )}
            <div>
              <h3 className="text-sm font-semibold text-fg">
                {totalConfigured === 0
                  ? 'No API Keys Configured'
                  : totalFailed > 0
                  ? `${totalFailed} Connection Issues Detected`
                  : 'All Configured Providers Functional'}
              </h3>
              <p className="text-caption text-fg-subtle mt-0.5">
                {totalConfigured === 0
                  ? 'Please set up at least one provider to start chatting.'
                  : lastTestedStr
                  ? `Last checked: ${formatAge(lastTestedStr)}`
                  : 'Test connection below to verify setup.'}
              </p>
            </div>
          </div>
          <BulkTestButton disabled={totalConfigured === 0} />
        </div>

        {totalFailed > 0 && (
          <div className="border border-bear/20 bg-bear/5 rounded-lg p-3 text-caption text-bear flex flex-col gap-1.5">
            <span className="font-semibold">Failing Connections:</span>
            <ul className="list-disc pl-4 space-y-1">
              {configured
                .filter((p) => {
                  const health = healthByProvider.get(p.id);
                  return health && !health.ok;
                })
                .map((p) => {
                  const health = healthByProvider.get(p.id);
                  return (
                    <li key={p.id}>
                      <span className="font-semibold">{p.displayName}</span>: {health?.error || 'Unknown error'}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-divider/60 pt-4 text-caption">
          <div className="flex flex-col">
            <span className="text-fg-muted">Configured</span>
            <span className="text-base font-semibold text-fg tabular-nums mt-0.5">
              {totalConfigured} / {BYOK_PROVIDERS_LIST.length}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-fg-muted">Turns (30d)</span>
            <span className="text-base font-semibold text-fg tabular-nums mt-0.5">
              {totalTurns}
            </span>
          </div>
          <div className="flex flex-col col-span-2 sm:col-span-1">
            <span className="text-fg-muted">Spent (30d)</span>
            <span className="text-base font-semibold text-fg tabular-nums mt-0.5">
              ${totalCost.toFixed(2)}
            </span>
          </div>
        </div>
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

      <SaveBar
        action={updateApiKeys}
        {...(fromChat && preservedPrompt ? { preservedPrompt } : {})}
      >
        {configured.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
              Configured
            </h3>
            {configured.map((p) => {
              const health = healthByProvider.get(p.id);
              const u = usageByProvider.get(p.id);
              const keyUpdatedAt = settings?.aiApiKeysUpdatedAt?.[p.id];
              return (
                <ApiKeyCard
                  key={p.id}
                  provider={p}
                  currentValue={decrypted?.[p.id as ProviderId] ?? ''}
                  keyUpdatedAt={keyUpdatedAt}
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
              const keyUpdatedAt = settings?.aiApiKeysUpdatedAt?.[p.id];
              return (
                <ApiKeyCard
                  key={p.id}
                  provider={p}
                  currentValue=""
                  keyUpdatedAt={keyUpdatedAt}
                  {...(health ? { health } : {})}
                  {...(u ? { usage: u } : {})}
                />
              );
            })}
          </section>
        ) : null}
      </SaveBar>

      {/* Market Data Provider Configuration */}
      <MarketDataConfig
        initialProvider={settings?.marketDataProvider ?? 'biquote'}
        finnhubKeySet={!!decrypted?.finnhub}
      />

      {/* Export / Import API Keys */}
      <ExportImportKeys />

      {/* Collapsible Capability Matrix */}
      <details className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden mt-2">
        <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elev-2 transition-colors">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-fg">
              Provider Capability Matrix
            </span>
            <span className="text-caption text-fg-subtle">
              Compare capabilities (Vision, Embedding, Free tier) across all supported AI providers.
            </span>
          </div>
          <span className="text-caption text-fg-subtle">▾</span>
        </summary>
        <div className="border-t border-divider p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-divider text-caption font-semibold text-fg-muted bg-bg-elev-2/50">
                <th className="p-3">Provider</th>
                <th className="p-3 text-center">Chat</th>
                <th className="p-3 text-center">Vision</th>
                <th className="p-3 text-center">Embedding</th>
                <th className="p-3 text-center">Streaming</th>
                <th className="p-3 text-center">Tool Calls</th>
                <th className="p-3 text-center">Free Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/50 text-caption">
              {BYOK_PROVIDERS_LIST.map((p) => (
                <tr key={p.id} className="hover:bg-bg-elev-2/20">
                  <td className="p-3 font-medium text-fg">{p.displayName}</td>
                  <td className="p-3 text-center text-emerald-400">✓</td>
                  <td className="p-3 text-center">
                    {p.supports.vision ? <span className="text-emerald-400">✓</span> : <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="p-3 text-center">
                    {p.supports.embedding ? <span className="text-emerald-400">✓</span> : <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="p-3 text-center text-emerald-400">✓</td>
                  <td className="p-3 text-center text-emerald-400">✓</td>
                  <td className="p-3 text-center">
                    {p.pricingTier === 'free' ? (
                      <span className="rounded-full bg-bull/15 px-2 py-0.5 text-[10px] font-medium text-bull font-semibold">Free</span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function formatAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
