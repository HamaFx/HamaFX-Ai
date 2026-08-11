// SPDX-License-Identifier: Apache-2.0

import { BYOK_PROVIDERS_LIST, computeUsage, type ProviderBreakdown } from '@hamafx/ai';
import { getDb, getUserWithSettings, schema } from '@hamafx/db';
import { decryptByok, type ProviderId } from '@hamafx/shared/encryption';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/catalog-server';
import { formatRelative } from '@/lib/format';

import { updateApiKeysAction } from '../actions';
import { ApiKeyCard } from './_components/api-key-card';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';
import { BulkTestButton } from './_components/bulk-test-button';
import { ExportImportKeys } from './_components/export-import-keys';
import { MarketDataConfig } from './_components/market-data-config';
import { SaveBar } from './_components/save-bar';

export const dynamic = 'force-dynamic';

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
  if (!session?.user?.id) redirect('/login');

  // Phase A — UX_UPGRADE_PLAN.md item 4. When the user lands here
  // from /chat with no AI provider configured, surface a dismissible
  // banner that explains what to do. The banner also offers a deep
  // link back to /chat carrying the original ?prompt= if any, so
  // "Ask AI" affordances don't lose the user's intent.
  const sp = (await searchParams) ?? {};
  const fromChat = sp.from === 'chat';
  const preservedPrompt = sp.prompt && sp.prompt.trim().length > 0 ? sp.prompt : null;

  const { settings } = await getUserWithSettings(session.user.id);

  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;

  // Phase A — UX_UPGRADE_PLAN.md item 7. Load the latest health
  // snapshot per provider so the badge can render without waiting
  // for the user to click "Test". Single round-trip; the row PK
  // is (userId, providerId) so the result is naturally keyed.
  const db = getDb();
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
    <div className="flex max-w-2xl min-w-0 flex-col gap-6">
      {fromChat ? (
        <ApiKeysLandingBanner {...(preservedPrompt ? { prompt: preservedPrompt } : {})} />
      ) : null}

      {/* Header */}
      <div>
        <h2 className="text-fg text-lg font-semibold">API Keys</h2>
        <p className="text-fg-subtle text-sm">
          HamaFX-Ai is BYOK. Provide your own keys for the AI models you want to use. Keys are
          encrypted at rest with AES-256-GCM.
        </p>
      </div>

      {/* Premium Provider Health Dashboard */}
      <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {totalConfigured === 0 ? (
              <span className="bg-fg-muted/40 size-3 animate-pulse rounded-sm" />
            ) : totalFailed > 0 ? (
              <span className="bg-danger size-3 animate-pulse rounded-sm" />
            ) : (
              <span className="bg-success size-3 rounded-sm" />
            )}
            <div>
              <h3 className="text-fg text-sm font-semibold">
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
          <div className="border-danger/20 bg-danger/5 text-caption text-danger flex flex-col gap-1.5 rounded-sm border p-3">
            <span className="font-semibold">Failing Connections:</span>
            <ul className="list-disc space-y-1 pl-4">
              {configured
                .filter((p) => {
                  const health = healthByProvider.get(p.id);
                  return health && !health.ok;
                })
                .map((p) => {
                  const health = healthByProvider.get(p.id);
                  return (
                    <li key={p.id}>
                      <span className="font-semibold">{p.displayName}</span>:{' '}
                      {health?.error || 'Unknown error'}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <div className="border-border text-caption grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="text-fg-muted">Configured</span>
            <span className="text-fg mt-0.5 text-base font-semibold tabular-nums">
              {totalConfigured} / {BYOK_PROVIDERS_LIST.length}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-fg-muted">Turns (30d)</span>
            <span className="text-fg mt-0.5 text-base font-semibold tabular-nums">
              {totalTurns}
            </span>
          </div>
          <div className="col-span-2 flex flex-col sm:col-span-1">
            <span className="text-fg-muted">Spent (30d)</span>
            <span className="text-fg mt-0.5 text-base font-semibold tabular-nums">
              ${totalCost.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Empty state when no providers are configured. */}
      {totalConfigured === 0 ? (
        <div className="border-border bg-bg-elev-1 flex flex-col items-center gap-3 rounded-sm border p-6 text-center">
          <div className="text-3xl">🔑</div>
          <div>
            <h3 className="text-fg text-sm font-semibold">No API keys configured yet</h3>
            <p className="text-caption text-fg-subtle mt-1 max-w-md">
              Pick a provider below and paste your API key. The free tier (Google Gemini or Groq) is
              a good starting point — the chat works as soon as one key is saved.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="bg-success/15 text-caption text-success rounded-sm px-2.5 py-1 font-medium">
              Google Gemini · free
            </span>
            <span className="bg-success/15 text-caption text-success rounded-sm px-2.5 py-1 font-medium">
              Groq · free
            </span>
            <span className="bg-bg-elev-2 text-caption text-fg-subtle rounded-sm px-2.5 py-1 font-medium">
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
            <h3
              id="configured-providers-heading"
              className="text-fg-subtle text-sm font-medium tracking-wide uppercase"
            >
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
            <h3
              id="add-provider-heading"
              className="text-fg-subtle text-sm font-medium tracking-wide uppercase"
            >
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
      <details className="border-border bg-bg-elev-1 mt-2 overflow-hidden rounded-sm border">
        <summary
          aria-label="Toggle provider capability matrix"
          className="hover:bg-bg-elev-2 flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors select-none"
        >
          <div className="flex flex-col">
            <span className="text-fg text-sm font-medium">Provider Capability Matrix</span>
            <span className="text-caption text-fg-subtle">
              Compare capabilities (Vision, Embedding, Free tier) across all supported AI providers.
            </span>
          </div>
          <span className="text-caption text-fg-subtle">▾</span>
        </summary>
        <div className="border-border max-w-full min-w-0 overflow-x-auto border-t p-0">
          <table className="w-full min-w-[500px] border-collapse text-left">
            <thead>
              <tr className="border-border text-caption text-fg-muted bg-bg-elev-2/50 border-b font-semibold">
                <th className="p-3">Provider</th>
                <th className="p-3 text-center">Chat</th>
                <th className="p-3 text-center">Vision</th>
                <th className="p-3 text-center">Embedding</th>
                <th className="p-3 text-center">Streaming</th>
                <th className="p-3 text-center">Tool Calls</th>
                <th className="p-3 text-center">Free Tier</th>
              </tr>
            </thead>
            <tbody className="divide-border/50 text-caption divide-y">
              {BYOK_PROVIDERS_LIST.map((p) => (
                <tr key={p.id} className="hover:bg-bg-elev-2/20">
                  <td className="text-fg p-3 font-medium">{p.displayName}</td>
                  <td className="text-success p-3 text-center">✓</td>
                  <td className="p-3 text-center">
                    {p.supports.vision ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {p.supports.embedding ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="text-success p-3 text-center">✓</td>
                  <td className="text-success p-3 text-center">✓</td>
                  <td className="p-3 text-center">
                    {p.pricingTier === 'free' ? (
                      <span className="bg-success/15 text-success rounded-sm px-2 py-0.5 text-xs font-medium font-semibold">
                        Free
                      </span>
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
