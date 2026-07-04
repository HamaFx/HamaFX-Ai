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
import { eq } from 'drizzle-orm';
import { formatRelative } from '@/lib/format';
import {
  decryptByok,
  type ProviderId,
} from '@hamafx/shared/encryption';
import {
  computeUsage,
  BYOK_PROVIDERS_LIST,
  type ProviderBreakdown,
} from '@hamafx/ai';
import { updateApiKeysAction } from '../actions';
import { ApiKeyCard } from './_components/api-key-card';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';
import { BulkTestButton } from './_components/bulk-test-button';
import { SaveBar } from './_components/save-bar';
import { MarketDataConfig } from './_components/market-data-config';
import { ExportImportKeys } from './_components/export-import-keys';

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
      <div className="border border-border bg-bg-elev-1 rounded-sm p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {totalConfigured === 0 ? (
              <span className="size-3 rounded-sm bg-fg-muted/40 animate-pulse" />
            ) : totalFailed > 0 ? (
              <span className="size-3 rounded-sm bg-bear animate-pulse" />
            ) : (
              <span className="size-3 rounded-sm bg-bull" />
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
                  ? `Last checked: ${formatRelative(lastTestedStr)}`
                  : 'Test connection below to verify setup.'}
              </p>
            </div>
          </div>
          <BulkTestButton disabled={totalConfigured === 0} />
        </div>

        {totalFailed > 0 && (
          <div className="border border-bear/20 bg-bear/5 rounded-sm p-3 text-caption text-bear flex flex-col gap-1.5">
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border pt-4 text-caption">
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
        <div className="border border-border bg-bg-elev-1 rounded-sm p-6 flex flex-col items-center text-center gap-3">
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
            <span className="rounded-sm bg-bull/15 px-2.5 py-1 text-caption font-medium text-bull">
              Google Gemini · free
            </span>
            <span className="rounded-sm bg-bull/15 px-2.5 py-1 text-caption font-medium text-bull">
              Groq · free
            </span>
            <span className="rounded-sm bg-bg-elev-2 px-2.5 py-1 text-caption font-medium text-fg-subtle">
              + 7 paid options
            </span>
          </div>
        </div>
      ) : null}

      <SaveBar
        action={updateApiKeysAction}
        {...(fromChat && preservedPrompt ? { preservedPrompt } : {})}
      >
        {configured.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="configured-providers-heading">
            <h3 id="configured-providers-heading" className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
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
          <section className="flex flex-col gap-3" aria-labelledby="add-provider-heading">
            <h3 id="add-provider-heading" className="text-sm font-medium text-fg-subtle uppercase tracking-wide">
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
      <details className="border border-border bg-bg-elev-1 rounded-sm overflow-hidden mt-2">
        <summary aria-label="Toggle provider capability matrix" className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elev-2 transition-colors">
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
        <div className="border-t border-border p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-border text-caption font-semibold text-fg-muted bg-bg-elev-2/50">
                <th className="p-3">Provider</th>
                <th className="p-3 text-center">Chat</th>
                <th className="p-3 text-center">Vision</th>
                <th className="p-3 text-center">Embedding</th>
                <th className="p-3 text-center">Streaming</th>
                <th className="p-3 text-center">Tool Calls</th>
                <th className="p-3 text-center">Free Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-caption">
              {BYOK_PROVIDERS_LIST.map((p) => (
                <tr key={p.id} className="hover:bg-bg-elev-2/20">
                  <td className="p-3 font-medium text-fg">{p.displayName}</td>
                  <td className="p-3 text-center text-bull">✓</td>
                  <td className="p-3 text-center">
                    {p.supports.vision ? <span className="text-bull">✓</span> : <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="p-3 text-center">
                    {p.supports.embedding ? <span className="text-bull">✓</span> : <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="p-3 text-center text-bull">✓</td>
                  <td className="p-3 text-center text-bull">✓</td>
                  <td className="p-3 text-center">
                    {p.pricingTier === 'free' ? (
                      <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-xs font-medium text-bull font-semibold">Free</span>
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

